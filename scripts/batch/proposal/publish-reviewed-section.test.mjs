import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { relative, resolve } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  attachManifestDigest,
} from "./core.mjs";
import {
  buildReviewedPublicationEnvelope,
  loadAndVerifyPublicationArtifact,
  proposalIdForArtifact,
  publishReviewedPublication,
  reviewedPublicationTrustGate,
} from "./publish-reviewed-section.mjs";
import {
  computeReviewedArtifactDigest,
  canonicalHash,
  computeSectionCasHash,
  REVIEWED_ARTIFACT_DIGEST_VERSION,
  sha256Text,
} from "../../../lib/generatedPublication/canonical.mjs";

const temporaryDirectories = [];
afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

const postgresApi = {
  substanceIndex: {
    getBySlug: "substanceIndex.getBySlug",
    publishReviewedSection: "substanceIndex.publishReviewedSection",
  },
};

function makeArtifact(customize = (value) => value) {
  const root = mkdtempSync(resolve(tmpdir(), "dosewiki-reviewed-publication-"));
  temporaryDirectories.push(root);
  writeFileSync(resolve(root, "package.json"), "{}\n");
  const artifactDirectory = resolve(root, "artifacts");
  mkdirSync(artifactDirectory);

  const baseArticle = { slug: "2c-b", summary: "before summary", pharmacology: { text: "unchanged" } };
  const proposedArticle = { ...baseArticle, summary: "after summary" };
  const manifest = attachManifestDigest({
    schemaVersion: "section-proposal-manifest-v2",
    deployments: {
      source: { identity: "localhost/source-test", fingerprint: "localhost/source-test", urlProvenanceKey: "--source-url" },
      target: { identity: "localhost/target-test", fingerprint: "localhost/target-test", urlProvenanceKey: "--target" },
    },
  });
  const manifestPath = resolve(artifactDirectory, "target-manifest.json");
  writeFileSync(manifestPath, `${JSON.stringify(manifest)}\n`);

  const rawResponse = "summary: after summary";
  const rawResponsePath = resolve(artifactDirectory, "openrouter-response.txt");
  writeFileSync(rawResponsePath, rawResponse);

  const proposalWithoutDigest = customize({
    schemaVersion: "section-proposal-v1",
    status: "ready_for_review",
    slug: "2c-b",
    manifestDigest: manifest.manifestDigest,
    manifestPath: relative(root, manifestPath),
    rawResponseHash: sha256Text(rawResponse),
    targetDeploymentFingerprint: "localhost/target-test",
    section: "summary",
    profile: "summary",
    hashVersion: "section-cas-v1",
    baseArticle,
    proposedArticle,
    approvedPaths: ["summary"],
    expectedOwnedHash: computeSectionCasHash("summary", ["summary"], baseArticle),
    proposedOwnedHash: computeSectionCasHash("summary", ["summary"], proposedArticle),
    guard: { accepted: true },
    artifactDigestVersion: REVIEWED_ARTIFACT_DIGEST_VERSION,
  });
  const artifactDigest = computeReviewedArtifactDigest(proposalWithoutDigest);
  const proposal = {
    ...proposalWithoutDigest,
    artifactDigest,
    artifactPaths: {
      rawResponse: relative(root, rawResponsePath),
    },
  };
  const proposalPath = resolve(artifactDirectory, "proposal.json");
  writeFileSync(proposalPath, `${JSON.stringify(proposal)}\n`);
  chmodSync(manifestPath, 0o444);
  chmodSync(rawResponsePath, 0o444);
  chmodSync(proposalPath, 0o444);

  return { root, proposal, proposalPath, rawResponsePath };
}

function makeRegenerationArtifact(customize = (value) => value) {
  return makeArtifact((original) => {
    const baseArticle = {
      ...original.baseArticle, priority: "low", index_categories: [],
      summary: "Old claim [cite:old-source]",
      references: [{ id: "old-source", title: "Retained source" }],
      legality: { countries: {}, international: ["Retained legality"] },
      editorial_review: { status: "completed", notes: "Retained review" },
    };
    const value = customize({
      ...original, baseArticle,
      proposedArticle: { ...baseArticle, summary: "Fresh uncited narrative" },
      sourceArtifactKind: "excerpt_section_regeneration",
      regenerationAudit: {
        version: "excerpt-section-regeneration-v1", section: "summary",
        promptHash: "c".repeat(64), excerptHash: "d".repeat(64),
        model: "openai-codex/gpt-5.6-sol", thinking: "low",
      },
    });
    return {
      ...value,
      expectedOwnedHash: computeSectionCasHash(value.profile, [value.profile], value.baseArticle),
      proposedOwnedHash: computeSectionCasHash(value.profile, [value.profile], value.proposedArticle),
    };
  });
}

function makeClient(initialArticle) {
  let article = structuredClone(initialArticle);
  const mutation = vi.fn(async (_reference, args) => {
    article = structuredClone(args.proposal.proposedArticle);
    return { status: "updated", proposalId: args.proposal.proposalId, nextHash: args.proposal.proposedOwnedHash };
  });

  class FakeClient {
    constructor(url) {
      this.url = url;
    }

    async query(reference, args) {
      expect(reference).toBe(postgresApi.substanceIndex.getBySlug);
      expect(args).toEqual({ slug: "2c-b" });
      return structuredClone(article);
    }

    mutation(...args) {
      return mutation(...args);
    }
  }

  return { FakeClient, mutation };
}

describe("reviewed section publication command", () => {
  it("verifies immutable artifacts, target identity, and a dry-run without invoking a mutation", async () => {
    const { root, proposal, proposalPath } = makeArtifact();
    const { FakeClient, mutation } = makeClient(proposal.baseArticle);

    const result = await publishReviewedPublication({
      argv: [
        `--proposal=${relative(root, proposalPath)}`,
        "--target=postgresql://localhost/target-test",
        "--dry-run",
      ],
      env: { DATA_BACKEND: "postgres",},
      repoRoot: root,
      Client: FakeClient,
      postgresApi,
      logger: { log: vi.fn() },
    });

    expect(result).toMatchObject({
      status: "dry_run",
      artifactDigest: proposal.artifactDigest,
      proposalId: proposalIdForArtifact(proposal.artifactDigest),
      liveTargetMatchesProposal: false,
      casState: "ready",
    });
    expect(mutation).not.toHaveBeenCalled();
  });

  it("refuses a stale owned section before invoking the mutation", async () => {
    const { root, proposal, proposalPath } = makeArtifact();
    const staleArticle = { ...proposal.baseArticle, summary: "concurrent summary edit" };
    const { FakeClient, mutation } = makeClient(staleArticle);

    await expect(publishReviewedPublication({
      argv: [
        `--proposal=${relative(root, proposalPath)}`,
        "--target=postgresql://localhost/target-test",
        "--write",
        "--confirm-reviewed-publication",
        "--confirm-write=publish-reviewed-section",
        "--expected-deployment=localhost/target-test",
        "--actor-email=editor@example.com",
        "--reviewed-by=Editor Example",
        "--reviewed-at=2026-07-15T15:00:00.000Z",
        `--approve-artifact=${proposal.artifactDigest}`,
      ],
      env: { DATA_BACKEND: "postgres", DATA_ADMIN_TOKEN_GENERATED_PUBLICATION_WRITE: "scoped-token" },
      repoRoot: root,
      Client: FakeClient,
      postgresApi,
      logger: { log: vi.fn() },
    })).rejects.toThrow(/Publication is stale/);
    expect(mutation).not.toHaveBeenCalled();
  });

  it("requires explicit human approval, uses only the scoped token, and verifies the target after publication", async () => {
    const { root, proposal, proposalPath } = makeArtifact();
    const { FakeClient, mutation } = makeClient(proposal.baseArticle);

    const result = await publishReviewedPublication({
      argv: [
        `--proposal=${relative(root, proposalPath)}`,
        "--target=postgresql://localhost/target-test",
        "--write",
        "--confirm-reviewed-publication",
        "--confirm-write=publish-reviewed-section",
        "--expected-deployment=localhost/target-test",
        "--actor-email=editor@example.com",
        "--reviewed-by=Editor Example",
        "--reviewed-at=2026-07-15T15:00:00.000Z",
        `--approve-artifact=${proposal.artifactDigest}`,
      ],
      env: { DATA_BACKEND: "postgres", DATA_ADMIN_TOKEN_GENERATED_PUBLICATION_WRITE: "scoped-token" },
      repoRoot: root,
      Client: FakeClient,
      postgresApi,
      logger: { log: vi.fn() },
    });

    expect(result).toMatchObject({ status: "updated", proposalId: proposalIdForArtifact(proposal.artifactDigest) });
    expect(mutation).toHaveBeenCalledTimes(1);
    expect(mutation).toHaveBeenCalledWith(postgresApi.substanceIndex.publishReviewedSection, {
      apiKey: "scoped-token",
      actorEmail: "editor@example.com",
      proposal: expect.objectContaining({
        proposalId: proposalIdForArtifact(proposal.artifactDigest),
        review: {
          status: "approved",
          reviewedBy: "Editor Example",
          reviewedAt: "2026-07-15T15:00:00.000Z",
          artifactDigest: proposal.artifactDigest,
        },
      }),
    });
    const auditDirectory = resolve(root, "scripts", "data", "audit-logs");
    expect(readFileSync(result.auditLogPath, "utf8")).toContain(proposal.artifactDigest);
    expect(result.auditLogPath).toContain(auditDirectory);
  });

  it("fails closed if a response artifact is modified or approval does not re-identify its digest", async () => {
    const tampered = makeArtifact();
    chmodSync(tampered.rawResponsePath, 0o644);
    writeFileSync(tampered.rawResponsePath, "tampered response");
    expect(() => loadAndVerifyPublicationArtifact({
      proposalPath: relative(tampered.root, tampered.proposalPath),
      repoRoot: tampered.root,
    })).toThrow(/rawResponseHash/);

    const { root, proposal, proposalPath } = makeArtifact();
    const { FakeClient, mutation } = makeClient(proposal.baseArticle);
    await expect(publishReviewedPublication({
      argv: [
        `--proposal=${relative(root, proposalPath)}`,
        "--target=postgresql://localhost/target-test",
        "--write",
        "--confirm-reviewed-publication",
        "--confirm-write=publish-reviewed-section",
        "--expected-deployment=localhost/target-test",
        "--actor-email=editor@example.com",
        "--reviewed-by=Editor Example",
        "--reviewed-at=2026-07-15T15:00:00.000Z",
        `--approve-artifact=${"f".repeat(64)}`,
      ],
      env: { DATA_BACKEND: "postgres", DATA_ADMIN_TOKEN_GENERATED_PUBLICATION_WRITE: "scoped-token" },
      repoRoot: root,
      Client: FakeClient,
      postgresApi,
      logger: { log: vi.fn() },
    })).rejects.toThrow(/approve-artifact/);
    expect(mutation).not.toHaveBeenCalled();
  });

  it("builds transient review envelopes without modifying the immutable artifact", () => {
    const { proposal } = makeArtifact();
    const reviewed = buildReviewedPublicationEnvelope({
      proposal,
      artifactDigest: proposal.artifactDigest,
      reviewedBy: "Editor Example",
      reviewedAt: "2026-07-15T15:00:00.000Z",
    });

    expect(reviewed).toMatchObject({
      proposalId: proposalIdForArtifact(proposal.artifactDigest),
      review: { artifactDigest: proposal.artifactDigest },
    });
    expect(proposal).not.toHaveProperty("review");
  });
});

describe("reviewed regeneration publication command", () => {
  it("digest-binds and forwards the exact audit into a transient review envelope", () => {
    const { proposal } = makeRegenerationArtifact();
    const reviewed = buildReviewedPublicationEnvelope({
      proposal, artifactDigest: proposal.artifactDigest,
      reviewedBy: "Editor Example", reviewedAt: "2026-07-15T15:00:00.000Z",
    });
    expect(reviewed.sourceArtifactKind).toBe("excerpt_section_regeneration");
    expect(reviewed.regenerationAudit).toEqual(proposal.regenerationAudit);
    expect(computeReviewedArtifactDigest(reviewed)).toBe(proposal.artifactDigest);
    expect(reviewedPublicationTrustGate(reviewed)).toEqual({ accepted: true, errors: [] });
    reviewed.regenerationAudit = { ...reviewed.regenerationAudit, excerptHash: "e".repeat(64) };
    expect(computeReviewedArtifactDigest(reviewed)).not.toBe(proposal.artifactDigest);
  });

  it.each([
    ["version", "forged"], ["model", "openai/gpt-5"],
    ["thinking", "high"], ["promptHash", "bad"], ["excerptHash", "bad"],
    ["section", "legality"],
  ])("fails a malformed %s audit during dry-run before any client is created", async (field, value) => {
    const { root, proposalPath } = makeRegenerationArtifact((proposal) => ({
      ...proposal, regenerationAudit: { ...proposal.regenerationAudit, [field]: value },
    }));
    const Client = vi.fn();
    await expect(publishReviewedPublication({
      argv: [`--proposal=${relative(root, proposalPath)}`, "--target=postgresql://localhost/target-test", "--dry-run"],
      env: { DATA_BACKEND: "postgres" }, repoRoot: root, Client, postgresApi, logger: { log: vi.fn() },
    })).rejects.toThrow(/regeneration trust gate failed/);
    expect(Client).not.toHaveBeenCalled();
  });

  it.each([
    (proposal) => ({ ...proposal, sourceArtifactKind: "generated_section" }),
    (proposal) => ({ ...proposal, regenerationAudit: undefined }),
    (proposal) => ({ ...proposal, regenerationAudit: { ...proposal.regenerationAudit, extra: true } }),
    (proposal) => ({ ...proposal, proposedArticle: { ...proposal.proposedArticle, summary: "Changed [cite:old-source]" } }),
    (proposal) => ({ ...proposal, proposedArticle: { ...proposal.proposedArticle, summary: "Changed [cite:new-source]" } }),
    (proposal) => ({ ...proposal, proposedArticle: { ...proposal.proposedArticle, legality: {} } }),
    (proposal) => ({
      ...proposal,
      baseArticle: { ...proposal.baseArticle, priority: "normal" },
      proposedArticle: { ...proposal.proposedArticle, priority: "normal" },
    }),
  ])("blocks forged kinds, audits, markers, unowned edits, and public targets locally", (customize) => {
    const { proposal } = makeRegenerationArtifact(customize);
    expect(reviewedPublicationTrustGate(proposal).accepted).toBe(false);
  });

  it("rejects digest tampering in the immutable regeneration artifact", () => {
    const { root, proposal, proposalPath } = makeRegenerationArtifact();
    chmodSync(proposalPath, 0o644);
    writeFileSync(proposalPath, JSON.stringify({
      ...proposal, regenerationAudit: { ...proposal.regenerationAudit, promptHash: "e".repeat(64) },
    }));
    expect(() => loadAndVerifyPublicationArtifact({ proposalPath, repoRoot: root })).toThrow(/artifactDigest/);
  });

  it.each([false, true])("checks live eligibility before accepting matching content=%s", async (matches) => {
    const { root, proposal, proposalPath } = makeRegenerationArtifact();
    const { FakeClient, mutation } = makeClient({
      ...(matches ? proposal.proposedArticle : proposal.baseArticle),
      priority: "normal", index_categories: [],
    });
    await expect(publishReviewedPublication({
      argv: [`--proposal=${relative(root, proposalPath)}`, "--target=postgresql://localhost/target-test", "--dry-run"],
      env: { DATA_BACKEND: "postgres" }, repoRoot: root, Client: FakeClient, postgresApi, logger: { log: vi.fn() },
    })).rejects.toThrow(/Live article is no longer eligible/);
    expect(mutation).not.toHaveBeenCalled();
  });

  it("publishes an eligible fresh section only through the explicit reviewed ceremony", async () => {
    const { root, proposal, proposalPath } = makeRegenerationArtifact();
    const { FakeClient, mutation } = makeClient(proposal.baseArticle);
    const result = await publishReviewedPublication({
      argv: [
        `--proposal=${relative(root, proposalPath)}`, "--target=postgresql://localhost/target-test",
        "--write", "--confirm-reviewed-publication", "--confirm-write=publish-reviewed-section",
        "--expected-deployment=localhost/target-test", "--actor-email=editor@example.com",
        "--reviewed-by=Editor Example", "--reviewed-at=2026-07-15T15:00:00.000Z",
        `--approve-artifact=${proposal.artifactDigest}`,
      ],
      env: { DATA_BACKEND: "postgres", DATA_ADMIN_TOKEN_GENERATED_PUBLICATION_WRITE: "scoped-token" },
      repoRoot: root, Client: FakeClient, postgresApi, logger: { log: vi.fn() },
    });
    expect(result.status).toBe("updated");
    expect(mutation).toHaveBeenCalledWith(postgresApi.substanceIndex.publishReviewedSection, expect.objectContaining({
      proposal: expect.objectContaining({
        regenerationAudit: proposal.regenerationAudit, sourceArtifactKind: "excerpt_section_regeneration",
        approvedPaths: ["summary"], proposedArticle: proposal.proposedArticle,
      }),
    }));
  });
});

function makeCollaborationArtifact(customize = (value) => value, alterManifest = (value) => value) {
  const prompt = { content: "Write the summary from these excerpts." };
  const exactExcerpt = "The compound was described in a clinical investigation.";
  const messages = [{ role: "system", content: "Use only provided evidence; return one summary YAML document." },
    { role: "user", content: `${prompt.content}\n\nEXACT SECTION EXCERPTS\n${exactExcerpt}` }];
  const receipt = {
    actualTaskPath: "/root/summary_writer", actualAgentId: "11111111-2222-3333-4444-555555555555",
    transport: "codex-collaboration-subagent", forkTurns: "none", capturedAt: "2026-09-30T00:46:21.929Z",
    inputHash: canonicalHash(messages), rawResponseSha256: sha256Text("summary: after summary"),
    wireModelVerified: false, wireEffortVerified: false, wireToolsVerified: false, sdkReceipt: false,
  };
  const artifact = makeArtifact((original) => {
    const baseArticle = { ...original.baseArticle, priority: "low" };
    return customize({ ...original, baseArticle, proposedArticle: { ...baseArticle, summary: "after summary" },
      sourceArtifactKind: "codex_collaboration_section_draft",
      collaborationAudit: { version: "codex-collaboration-section-draft-v1", section: "summary",
        promptHash: sha256Text(prompt.content), excerptHash: sha256Text(exactExcerpt), inputHash: receipt.inputHash,
        receiptHash: canonicalHash(receipt), receipt },
    });
  });
  const manifestPath = resolve(artifact.root, artifact.proposal.manifestPath);
  const previousManifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const { manifestDigest: _previousDigest, ...manifestContent } = previousManifest;
  const manifest = attachManifestDigest(alterManifest({ ...manifestContent, prompt, exactExcerpt, messages,
    collaborationAudit: artifact.proposal.collaborationAudit }));
  const proposal = { ...artifact.proposal, manifestDigest: manifest.manifestDigest };
  proposal.artifactDigest = computeReviewedArtifactDigest(proposal);
  chmodSync(manifestPath, 0o644); writeFileSync(manifestPath, JSON.stringify(manifest)); chmodSync(manifestPath, 0o444);
  chmodSync(artifact.proposalPath, 0o644); writeFileSync(artifact.proposalPath, JSON.stringify(proposal)); chmodSync(artifact.proposalPath, 0o444);
  return { ...artifact, proposal };
}

describe("reviewed collaboration publication command", () => {
  it("binds actual collaboration provenance without creating an SDK receipt", () => {
    const { root, proposal, proposalPath } = makeCollaborationArtifact();
    expect(loadAndVerifyPublicationArtifact({ proposalPath, repoRoot: root }).artifactDigest).toBe(proposal.artifactDigest);
    const envelope = buildReviewedPublicationEnvelope({ proposal, artifactDigest: proposal.artifactDigest,
      reviewedBy: "parent agent", reviewedAt: "2026-09-30T01:00:00.000Z" });
    expect(envelope.collaborationAudit).toEqual(proposal.collaborationAudit);
    expect(envelope).not.toHaveProperty("regenerationAudit");
    expect(computeReviewedArtifactDigest(envelope)).toBe(proposal.artifactDigest);
  });

  it.each([
    (manifest) => ({ ...manifest, prompt: { content: "Substituted prompt" } }),
    (manifest) => ({ ...manifest, exactExcerpt: "Substituted evidence" }),
    (manifest) => ({ ...manifest, messages: [...manifest.messages, { role: "user", content: "Previous context" }] }),
    (manifest) => ({ ...manifest, messages: [{ ...manifest.messages[0], tools: [] }, manifest.messages[1]] }),
    (manifest) => Object.fromEntries(Object.entries(manifest).filter(([key]) => key !== "collaborationAudit")),
  ])("rejects frozen input substitution before creating a client", async (alterManifest) => {
    const { root, proposalPath } = makeCollaborationArtifact(undefined, alterManifest);
    const Client = vi.fn();
    await expect(publishReviewedPublication({ argv: [`--proposal=${relative(root, proposalPath)}`,
      "--target=postgresql://localhost/target-test", "--dry-run"], env: { DATA_BACKEND: "postgres" },
      repoRoot: root, Client, postgresApi, logger: { log: vi.fn() } })).rejects.toThrow(/collaboration artifact gate failed/);
    expect(Client).not.toHaveBeenCalled();
  });

  it("rejects a re-signed audit claiming verified wire transport", () => {
    const { root, proposalPath } = makeCollaborationArtifact((proposal) => {
      const receipt = { ...proposal.collaborationAudit.receipt, wireModelVerified: true };
      return { ...proposal, collaborationAudit: { ...proposal.collaborationAudit, receipt, receiptHash: canonicalHash(receipt) } };
    });
    expect(() => loadAndVerifyPublicationArtifact({ proposalPath, repoRoot: root })).toThrow(/wireModelVerified: false/);
  });

  it("checks live eligibility before any write or already-applied disposition", async () => {
    const { root, proposal, proposalPath } = makeCollaborationArtifact();
    const { FakeClient, mutation } = makeClient({ ...proposal.proposedArticle, priority: "normal", index_categories: [] });
    await expect(publishReviewedPublication({ argv: [`--proposal=${relative(root, proposalPath)}`,
      "--target=postgresql://localhost/target-test", "--dry-run"], env: { DATA_BACKEND: "postgres" },
      repoRoot: root, Client: FakeClient, postgresApi, logger: { log: vi.fn() } })).rejects.toThrow(/Live article is no longer eligible/);
    expect(mutation).not.toHaveBeenCalled();
  });

  it("uses the existing scoped, approved-artifact write ceremony", async () => {
    const { root, proposal, proposalPath } = makeCollaborationArtifact();
    const { FakeClient, mutation } = makeClient(proposal.baseArticle);
    const argv = [`--proposal=${relative(root, proposalPath)}`, "--target=postgresql://localhost/target-test",
      "--write", "--confirm-reviewed-publication", "--confirm-write=publish-reviewed-section",
      "--expected-deployment=localhost/target-test", "--actor-email=editor@example.com", "--reviewed-by=parent agent",
      "--reviewed-at=2026-09-30T01:00:00.000Z", `--approve-artifact=${proposal.artifactDigest}`];
    const result = await publishReviewedPublication({ argv,
      env: { DATA_BACKEND: "postgres", DATA_ADMIN_TOKEN_GENERATED_PUBLICATION_WRITE: "scoped-token" },
      repoRoot: root, Client: FakeClient, postgresApi, logger: { log: vi.fn() } });
    expect(result.status).toBe("updated");
    expect(mutation).toHaveBeenCalledWith(postgresApi.substanceIndex.publishReviewedSection, expect.objectContaining({
      proposal: expect.objectContaining({ sourceArtifactKind: "codex_collaboration_section_draft",
        collaborationAudit: proposal.collaborationAudit, approvedPaths: ["summary"] }),
    }));
  });
});
