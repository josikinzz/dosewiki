import { chmodSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { relative, resolve } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { attachManifestDigest } from "./core.mjs";
import {
  loadAndVerifyPublicationArtifact,
  proposalIdForArtifact,
  publishReviewedPublication,
} from "./publish-reviewed-section.mjs";
import {
  computeReviewedArtifactDigest,
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

function makeArtifact() {
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

  const proposalWithoutDigest = {
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
  };
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

  it.each([
    ["the write freeze", "postgresql://localhost/target-test", [], { DATA_WRITES_FROZEN: "1" }, /DATA_WRITES_FROZEN/],
    ["a remote host without --allow-remote", "postgresql://db.example/target-test", [], {}, /--allow-remote/],
  ])("refuses a confirmed publication under %s before opening a client", async (_label, target, extraArgv, env, expected) => {
    const { root, proposal, proposalPath } = makeArtifact();
    const constructed = [];
    class RecordingClient {
      constructor(url) {
        constructed.push(url);
      }
    }

    await expect(publishReviewedPublication({
      argv: [
        `--proposal=${relative(root, proposalPath)}`,
        `--target=${target}`,
        "--write",
        "--confirm-reviewed-publication",
        "--confirm-write=publish-reviewed-section",
        `--expected-deployment=${target.replace("postgresql://", "")}`,
        "--actor-email=editor@example.com",
        "--reviewed-by=Editor Example",
        "--reviewed-at=2026-07-15T15:00:00.000Z",
        `--approve-artifact=${proposal.artifactDigest}`,
        ...extraArgv,
      ],
      env: { DATA_BACKEND: "postgres", DATA_ADMIN_TOKEN_GENERATED_PUBLICATION_WRITE: "scoped-token", ...env },
      repoRoot: root,
      Client: RecordingClient,
      postgresApi,
      logger: { log: vi.fn() },
    })).rejects.toThrow(expected);
    expect(constructed).toEqual([]);
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
});
