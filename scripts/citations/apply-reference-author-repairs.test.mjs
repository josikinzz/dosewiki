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

function reviewedRow(overrides = {}) {
  const expectedReference = { ...row().expectedReference };
  const base = row({
    identifiers: { doi: null, pmid: "19322953" },
    expectedReference,
    expectedReferenceSha256: sha256Json(expectedReference),
    providerLanes: [{ providerLane: "pmid", title: "Different provider title" }],
  });
  const result = {
    key: base.key,
    decision: "resolved",
    authors: base.proposedAuthors,
    doi: "10.1000/reviewed",
    pmid: "19322953",
    title: "Authoritative reviewed title",
    sourceUrls: ["https://pubmed.ncbi.nlm.nih.gov/19322953/"],
    inspectedEvidence: "The authoritative record explicitly lists the byline.",
    confidence: "high",
  };
  const reviewResultSha256 = sha256Json(result);
  const refutation = {
    artifactType: "citation_author_repair_refutation",
    artifactVersion: 1,
    proposalArtifactSha256: "original-proposal-hash",
    queueArtifactSha256: "queue-hash",
    batchId: "batch-001",
    key: base.key,
    reviewResultSha256,
    originalReviewerIdentifier: "primary-reviewer",
    refutationReviewerIdentifier: "independent-refuter",
    decision: "survived_refutation",
    authoritativeSourceUrls: ["https://pubmed.ncbi.nlm.nih.gov/19322953/"],
    inspectedEvidence: "Independent inspection confirmed the byline.",
    generatedAt: "2026-08-09T02:00:00.000Z",
  };
  return {
    ...base,
    sourceKind: "independently_reviewed_residual",
    reasonCodes: ["independently_reviewed_residual"],
    resolvedIdentifiers: { doi: "10.1000/reviewed", pmid: "19322953" },
    reviewedEvidence: {
      batchId: "batch-001",
      reviewResultSha256,
      reviewResultArtifactSha256: sha256Json({ batchId: "batch-001", result }),
      reviewResultGeneratedAt: "2026-08-09T01:00:00.000Z",
      primaryReviewerIdentifier: "primary-reviewer",
      result,
      refutationArtifactSha256: sha256Json(refutation),
      refutationReviewerIdentifier: "independent-refuter",
      refutationDecision: "survived_refutation",
      refutation,
    },
    ...overrides,
  };
}

function refreshReviewedEvidence(reviewed) {
  reviewed.reviewedEvidence.reviewResultSha256 = sha256Json(reviewed.reviewedEvidence.result);
  reviewed.reviewedEvidence.refutation.reviewResultSha256 = reviewed.reviewedEvidence.reviewResultSha256;
  reviewed.reviewedEvidence.refutationArtifactSha256 = sha256Json(reviewed.reviewedEvidence.refutation);
  return reviewed;
}

function artifacts({ residual = [], highConfidence = [row()], sourceKind } = {}) {
  const payload = {
    artifactType: "citation_author_repair_proposal",
    artifactVersion: 1,
    generatedAt: "2026-08-09T00:00:00.000Z",
    sourceDeployment: "example/dosewiki",
    mode: "dry_run",
    ...(sourceKind ? {
      sourceKind,
      sourceArtifacts: {
        originalProposalArtifactSha256: "original-proposal-hash",
        reviewQueueArtifactSha256: "queue-hash",
      },
    } : {}),
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

  it("accepts only digest-valid independently reviewed rows without weakening ordinary strictness", () => {
    const reviewed = reviewedRow();
    const values = artifacts({ highConfidence: [reviewed], sourceKind: "independently_reviewed_residual" });
    expect(validateApprovedCitationAuthorProposal(values.proposal, values.approval)).toEqual([reviewed]);

    const tampered = reviewedRow();
    tampered.reviewedEvidence.result.authors = ["Tampered Author"];
    const invalid = artifacts({ highConfidence: [tampered], sourceKind: "independently_reviewed_residual" });
    expect(() => validateApprovedCitationAuthorProposal(invalid.proposal, invalid.approval)).toThrow(/reviewed evidence/i);

    const identityMismatch = reviewedRow();
    identityMismatch.reviewedEvidence.result.pmid = "99999999";
    identityMismatch.reviewedEvidence.reviewResultSha256 = sha256Json(identityMismatch.reviewedEvidence.result);
    identityMismatch.reviewedEvidence.refutation.reviewResultSha256 = identityMismatch.reviewedEvidence.reviewResultSha256;
    identityMismatch.reviewedEvidence.refutationArtifactSha256 = sha256Json(identityMismatch.reviewedEvidence.refutation);
    const mismatched = artifacts({ highConfidence: [identityMismatch], sourceKind: "independently_reviewed_residual" });
    expect(() => validateApprovedCitationAuthorProposal(mismatched.proposal, mismatched.approval)).toThrow(/reviewed evidence/i);

    const sameCanonicalReviewer = reviewedRow();
    sameCanonicalReviewer.reviewedEvidence.refutation.refutationReviewerIdentifier = " PRIMARY-REVIEWER ";
    sameCanonicalReviewer.reviewedEvidence.refutationReviewerIdentifier = " PRIMARY-REVIEWER ";
    sameCanonicalReviewer.reviewedEvidence.refutationArtifactSha256 = sha256Json(sameCanonicalReviewer.reviewedEvidence.refutation);
    const nonIndependent = artifacts({ highConfidence: [sameCanonicalReviewer], sourceKind: "independently_reviewed_residual" });
    expect(() => validateApprovedCitationAuthorProposal(nonIndependent.proposal, nonIndependent.approval)).toThrow(/reviewed evidence/i);

    const ordinary = artifacts({ highConfidence: [row({ identifiers: { doi: null, pmid: null } })] });
    expect(() => validateApprovedCitationAuthorProposal(ordinary.proposal, ordinary.approval)).toThrow(/stable DOI or PMID/i);
  });

  it("independently enforces normalized-title identity for reviewed identifierless rows", () => {
    const reviewed = reviewedRow();
    reviewed.identifiers = { doi: null, pmid: null };
    reviewed.expectedReference = { ...reviewed.expectedReference, pmid: null };
    reviewed.expectedReferenceSha256 = sha256Json(reviewed.expectedReference);
    reviewed.reviewedEvidence.result.doi = null;
    reviewed.reviewedEvidence.result.pmid = null;
    reviewed.reviewedEvidence.result.title = "A different work";
    reviewed.resolvedIdentifiers = { doi: null, pmid: null };
    refreshReviewedEvidence(reviewed);
    const values = artifacts({ highConfidence: [reviewed], sourceKind: "independently_reviewed_residual" });
    expect(() => validateApprovedCitationAuthorProposal(values.proposal, values.approval)).toThrow(/reviewed evidence/i);
  });

  it("requires reviewed evidence to match both original DOI and PMID when both are present", () => {
    for (const resolvedIdentifiers of [
      { doi: null, pmid: "19322953" },
      { doi: "10.1000/other", pmid: "19322953" },
      { doi: "10.1000/reviewed", pmid: null },
      { doi: "10.1000/reviewed", pmid: "99999999" },
    ]) {
      const reviewed = reviewedRow();
      reviewed.identifiers = { doi: "10.1000/reviewed", pmid: "19322953" };
      reviewed.expectedReference = { ...reviewed.expectedReference, doi: "10.1000/reviewed" };
      reviewed.expectedReferenceSha256 = sha256Json(reviewed.expectedReference);
      reviewed.reviewedEvidence.result.doi = resolvedIdentifiers.doi;
      reviewed.reviewedEvidence.result.pmid = resolvedIdentifiers.pmid;
      reviewed.resolvedIdentifiers = resolvedIdentifiers;
      refreshReviewedEvidence(reviewed);
      const values = artifacts({ highConfidence: [reviewed], sourceKind: "independently_reviewed_residual" });
      expect(() => validateApprovedCitationAuthorProposal(values.proposal, values.approval)).toThrow(/reviewed evidence/i);
    }
  });

  it("rejects row-versus-snapshot identifier contradictions during validation and preflight", () => {
    const reviewed = reviewedRow();
    reviewed.identifiers = { doi: "10.1000/row", pmid: "19322953" };
    reviewed.expectedReference = { ...reviewed.expectedReference, doi: "10.1000/snapshot" };
    reviewed.expectedReferenceSha256 = sha256Json(reviewed.expectedReference);
    reviewed.reviewedEvidence.result.doi = "10.1000/row";
    reviewed.resolvedIdentifiers = { doi: "10.1000/row", pmid: "19322953" };
    refreshReviewedEvidence(reviewed);
    const values = artifacts({ highConfidence: [reviewed], sourceKind: "independently_reviewed_residual" });
    expect(() => validateApprovedCitationAuthorProposal(values.proposal, values.approval)).toThrow(/reviewed evidence|contradict|identity/i);
    expect(() => preflightCitationAuthorRepair({
      slug: reviewed.slug,
      references: [{ ...reviewed.expectedReference, doi: "10.1000/row" }],
    }, reviewed)).toThrow(/contradict|identity/i);
  });

  it("requires nonempty canonical and distinct reviewed-lane reviewer identifiers", () => {
    for (const { primary, refuter } of [
      { primary: "", refuter: "independent-refuter" },
      { primary: "primary-reviewer", refuter: "" },
      { primary: "primary-reviewer", refuter: " PRIMARY-REVIEWER " },
    ]) {
      const reviewed = reviewedRow();
      reviewed.reviewedEvidence.primaryReviewerIdentifier = primary;
      reviewed.reviewedEvidence.refutation.originalReviewerIdentifier = primary;
      reviewed.reviewedEvidence.refutationReviewerIdentifier = refuter;
      reviewed.reviewedEvidence.refutation.refutationReviewerIdentifier = refuter;
      refreshReviewedEvidence(reviewed);
      const values = artifacts({ highConfidence: [reviewed], sourceKind: "independently_reviewed_residual" });
      expect(() => validateApprovedCitationAuthorProposal(values.proposal, values.approval)).toThrow(/reviewed evidence/i);
    }
  });

  it("excludes residual rows and produces a successful dry-run plan", async () => {
    const residual = row({ key: "other::ref", slug: "other", referenceId: "ref", classification: "residual" });
    const values = writeArtifacts(artifacts({ residual: [residual] }));
    const client = { query: vi.fn(async () => article()) };
    const result = await runApplyReferenceAuthorRepairs([
      `--proposal=${values.proposalPath}`,
      `--approval=${values.approvalPath}`,
    ], { client, env: { DATA_BACKEND: "postgres", SOURCE_POSTGRES_URL: "postgres://example/dosewiki" }, logger: { log: vi.fn() } });
    expect(result).toEqual({ status: "dry_run", pending: 1, alreadyApplied: 0, residualExcluded: 1 });
    expect(client.query).toHaveBeenCalledTimes(1);
  });

  it("refuses stale references and recognizes an already-applied proposal", () => {
    expect(() => preflightCitationAuthorRepair(article(["Someone Else"]), row())).toThrow(/REFERENCE_CONFLICT/);
    expect(preflightCitationAuthorRepair(article(row().proposedAuthors), row())).toBe("already_applied");
  });

  it("retains independently reviewed evidence in the audit mutation", async () => {
    const reviewed = reviewedRow();
    const values = writeArtifacts(artifacts({ highConfidence: [reviewed], sourceKind: "independently_reviewed_residual" }));
    let live = { slug: reviewed.slug, references: [structuredClone(reviewed.expectedReference)] };
    const client = {
      query: vi.fn(async () => structuredClone(live)),
      mutation: vi.fn(async (_mutation, args) => {
        live.references[0].authors = args.proposedAuthors;
        return { updated: true, authors: args.proposedAuthors };
      }),
    };
    const writeAuditLog = vi.fn(() => ({ path: "/tmp/audit-reviewed.json" }));
    await runApplyReferenceAuthorRepairs([
      `--proposal=${values.proposalPath}`,
      `--approval=${values.approvalPath}`,
      "--target=postgres://example/dosewiki",
      "--write",
      "--allow-remote",
      "--confirm-write=apply-citation-author-repairs",
      "--expected-deployment=example/dosewiki",
      "--confirm-citation-author-write",
    ], {
      client,
      apiKey: "scoped-token",
      env: { DATA_BACKEND: "postgres", POSTGRES_IMPORT_CONFIRM: "example" },
      logger: { log: vi.fn() },
      backupBeforeWrite: vi.fn(async () => ({ path: "/tmp/backup.json", documentCount: 1 })),
      writeAuditLog,
      updateAuditLog: vi.fn(),
    });
    expect(writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      mutations: [expect.objectContaining({
        sourceKind: "independently_reviewed_residual",
        reviewedEvidence: reviewed.reviewedEvidence,
      })],
    }));
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
      "--target=postgres://example/dosewiki",
      "--write",
      "--allow-remote",
      "--confirm-write=apply-citation-author-repairs",
      "--expected-deployment=example/dosewiki",
      "--confirm-citation-author-write",
    ], {
      client,
      apiKey: "scoped-token",
      env: { DATA_BACKEND: "postgres", POSTGRES_IMPORT_CONFIRM: "example" },
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
