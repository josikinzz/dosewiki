import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  preflightCitationAuthorRepair,
  runApplyReferenceAuthorRepairs,
  validateApprovedCitationAuthorProposal,
} from "./apply-reference-author-repairs.mjs";
import { sha256Json } from "./plan-reference-author-repairs.mjs";

const directories = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function row(overrides = {}) {
  const expectedReference = {
    id: "pmid-19322953",
    type: "journal_article",
    title: "Methylphenidate receptor paper",
    authors: [],
    pmid: "19322953",
  };
  return {
    key: "methylphenidate::pmid-19322953",
    slug: "methylphenidate",
    referenceId: "pmid-19322953",
    classification: "high_confidence",
    identifiers: { doi: null, pmid: "19322953" },
    expectedReference,
    expectedReferenceSha256: sha256Json(expectedReference),
    expectedAuthors: [],
    proposedAuthors: ["Markowitz JS", "DeVane CL"],
    providerLanes: [{
      providerLane: "pmid",
      title: "Methylphenidate receptor paper",
      metadataProvenance: [{ provider: "pubmed", status: "success" }],
      metadataDiagnostics: [],
    }],
    ...overrides,
  };
}

function artifacts({ residual = [], highConfidence = [row()] } = {}) {
  const payload = {
    artifactType: "citation_author_repair_proposal",
    artifactVersion: 1,
    generatedAt: "2026-08-09T00:00:00.000Z",
    sourceDeployment: "https://example.convex.cloud",
    mode: "dry_run",
    summary: {},
    highConfidence,
    residual,
  };
  const proposal = { ...payload, artifactSha256: sha256Json(payload) };
  const approval = {
    artifactType: "citation_author_repair_approval",
    artifactVersion: 1,
    proposalArtifactSha256: proposal.artifactSha256,
    decision: "approved",
    scope: "high_confidence_only",
    approvedAt: "2026-08-09T01:00:00.000Z",
    approvedBy: "editor@example.com",
  };
  return { proposal, approval };
}

function writeArtifacts(values = artifacts()) {
  const directory = mkdtempSync(resolve(tmpdir(), "citation-author-apply-"));
  directories.push(directory);
  const proposalPath = resolve(directory, "proposal.json");
  const approvalPath = resolve(directory, "approval.json");
  writeFileSync(proposalPath, JSON.stringify(values.proposal));
  writeFileSync(approvalPath, JSON.stringify(values.approval));
  return { ...values, proposalPath, approvalPath };
}

function article(authors = []) {
  return {
    slug: "methylphenidate",
    references: [{ ...row().expectedReference, authors }],
  };
}

describe("citation author repair apply command", () => {
  it("requires an explicit matching approval artifact", () => {
    const { proposal, approval } = artifacts();
    expect(validateApprovedCitationAuthorProposal(proposal, approval)).toHaveLength(1);
    expect(() => validateApprovedCitationAuthorProposal(proposal, { ...approval, decision: "pending" }))
      .toThrow(/explicit matching approval/i);
    expect(() => validateApprovedCitationAuthorProposal(proposal, { ...approval, proposalArtifactSha256: "wrong" }))
      .toThrow(/explicit matching approval/i);
    for (const approvedAt of ["not-a-date", "2026-02-30T01:00:00.000Z", "2026-08-09", "2026-08-09T01:00:00Z"]) {
      expect(() => validateApprovedCitationAuthorProposal(proposal, { ...approval, approvedAt }))
        .toThrow(/explicit matching approval/i);
    }
  });

  it("rejects high-confidence automation without a stable identifier or strict provider title agreement", () => {
    const withoutIdentifier = artifacts({ highConfidence: [row({ identifiers: { doi: null, pmid: null } })] });
    expect(() => validateApprovedCitationAuthorProposal(withoutIdentifier.proposal, withoutIdentifier.approval))
      .toThrow(/stable DOI or PMID/i);

    const titleConflict = artifacts({
      highConfidence: [row({ providerLanes: [{ providerLane: "pmid", title: "Different work" }] })],
    });
    expect(() => validateApprovedCitationAuthorProposal(titleConflict.proposal, titleConflict.approval))
      .toThrow(/strict provider title agreement/i);
  });

  it("excludes residual rows and produces a successful dry-run plan", async () => {
    const residual = row({ key: "other::ref", slug: "other", referenceId: "ref", classification: "residual" });
    const values = writeArtifacts(artifacts({ residual: [residual] }));
    const client = { query: vi.fn(async () => article()) };
    const result = await runApplyReferenceAuthorRepairs([
      `--proposal=${values.proposalPath}`,
      `--approval=${values.approvalPath}`,
    ], { client, env: {}, logger: { log: vi.fn() } });
    expect(result).toEqual({ status: "dry_run", pending: 1, alreadyApplied: 0, residualExcluded: 1 });
    expect(client.query).toHaveBeenCalledTimes(1);
  });

  it("refuses stale references and recognizes an already-applied proposal", () => {
    expect(() => preflightCitationAuthorRepair(article(["Someone Else"]), row())).toThrow(/REFERENCE_CONFLICT/);
    expect(preflightCitationAuthorRepair(article(row().proposedAuthors), row())).toBe("already_applied");
  });

  it("applies an approved high-confidence row with backups, audit, and post-write verification", async () => {
    const values = writeArtifacts();
    let live = article();
    const client = {
      query: vi.fn(async () => structuredClone(live)),
      mutation: vi.fn(async (_mutation, args) => {
        live.references[0].authors = args.proposedAuthors;
        return { updated: true, authors: args.proposedAuthors };
      }),
    };
    const backupBeforeWrite = vi.fn(async () => ({ path: "/tmp/backup.json", documentCount: 1 }));
    const writeAuditLog = vi.fn(() => ({ path: "/tmp/audit.json" }));
    const updateAuditLog = vi.fn();
    const result = await runApplyReferenceAuthorRepairs([
      `--proposal=${values.proposalPath}`,
      `--approval=${values.approvalPath}`,
      "--target-url=https://example.convex.cloud",
      "--write",
      "--confirm-write=apply-citation-author-repairs",
      "--expected-deployment=example",
      "--confirm-citation-author-write",
    ], {
      client,
      apiKey: "scoped-token",
      env: {},
      logger: { log: vi.fn() },
      backupBeforeWrite,
      writeAuditLog,
      updateAuditLog,
    });
    expect(result.status).toBe("completed");
    expect(client.mutation).toHaveBeenCalledTimes(1);
    expect(backupBeforeWrite).toHaveBeenCalledTimes(1);
    expect(writeAuditLog).toHaveBeenCalledTimes(1);
    expect(writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      mutations: [expect.objectContaining({
        proposedAuthors: ["Markowitz JS", "DeVane CL"],
        providerLanes: [expect.objectContaining({
          metadataProvenance: [{ provider: "pubmed", status: "success" }],
          metadataDiagnostics: [],
        })],
      })],
    }));
    expect(updateAuditLog).toHaveBeenCalledWith("/tmp/audit.json", expect.objectContaining({ status: "completed" }));
  });
});
