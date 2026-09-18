import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  preflightReferenceProvenanceBackfill,
  runApplyReferenceProvenanceBackfill,
  validateApprovedReferenceProvenanceBackfill,
  withApprovalArtifactSha256,
} from "./apply-reference-metadata-provenance-backfill.mjs";
import { sha256Json } from "./plan-reference-author-repairs.mjs";

const directories = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

const digest = (character) => character.repeat(64);

function approvalPayload(value) {
  const { approvalArtifactSha256: _digest, ...payload } = value;
  return payload;
}

function row(index) {
  const fetched = index < 74;
  const key = `article::ref-${String(index).padStart(3, "0")}`;
  const proposedMetadataProvenance = fetched ? [{
    kind: "fetched",
    source: "citation-author-repair:pmid",
    provider: "pubmed",
    artifactDigest: digest("c"),
    fields: ["authors"],
  }] : [{
    kind: "inspected",
    source: "citation-author-repair:independent-refutation",
    provider: "ncbi.nlm.nih.gov",
    artifactDigest: digest("6"),
    fields: ["authors"],
  }, {
    kind: "inspected",
    source: "citation-author-repair:review-result",
    provider: "pubmed.ncbi.nlm.nih.gov",
    artifactDigest: digest("b"),
    fields: ["authors"],
  }];
  return {
    key,
    slug: "article",
    referenceId: `ref-${String(index).padStart(3, "0")}`,
    wave: fetched ? "deterministic-high-confidence" : "independently-reviewed-residual",
    identifiers: { doi: null, pmid: String(100000 + index) },
    expectedTitle: `Reference title ${index}`,
    normalizedTitle: `reference title ${index}`,
    expectedAuthors: [`Author ${index}`],
    expectedMetadataProvenance: null,
    expectedMetadataProvenanceSha256: sha256Json(null),
    proposedMetadataProvenance,
    proposedMetadataProvenanceSha256: sha256Json(proposedMetadataProvenance),
    sourceBinding: {
      proposalArtifactSha256: digest("c"),
      auditFileSha256: digest("d"),
      approvalFileSha256: digest("e"),
      evidenceBundleDigest: digest("7"),
      evidenceBundleFileSha256: digest("8"),
      evidenceRowSha256: digest("1"),
      ...(fetched ? {} : {
        reviewedEvidence: {
          reviewResultSha256: digest("9"),
          reviewResultArtifactSha256: digest("b"),
          refutationArtifactSha256: digest("6"),
        },
      }),
    },
  };
}

function artifacts() {
  const rows = Array.from({ length: 759 }, (_, index) => row(index));
  const payload = {
    artifactType: "citation_reference_provenance_backfill_proposal",
    artifactVersion: 1,
    generatedAt: "2026-08-10T00:00:00.000Z",
    sourceDeployment: "example/dosewiki",
    mode: "read_only_proposal",
    lineageManifest: { path: "lineage.json", fileSha256: digest("f"), artifactVersion: 2 },
    evidenceBundle: { path: "evidence.json", fileSha256: digest("8"), bundleDigest: digest("7"), artifactVersion: 1 },
    summary: { rows: 759, fetched: 74, inspected: 685 },
    rows,
  };
  const proposal = { ...payload, artifactSha256: sha256Json(payload) };
  const approval = withApprovalArtifactSha256({
    artifactType: "citation_reference_provenance_backfill_approval",
    artifactVersion: 1,
    proposalArtifactSha256: proposal.artifactSha256,
    decision: "approved",
    scope: "all_rows",
    approvedAt: "2026-08-10T01:00:00.000Z",
    approvedBy: "editor@example.com",
  });
  return { proposal, approval };
}

function writeArtifacts(values = artifacts()) {
  const directory = mkdtempSync(resolve(tmpdir(), "citation-provenance-apply-"));
  directories.push(directory);
  const proposalPath = resolve(directory, "proposal.json");
  const approvalPath = resolve(directory, "approval.json");
  writeFileSync(proposalPath, JSON.stringify(values.proposal));
  writeFileSync(approvalPath, JSON.stringify(values.approval));
  return { ...values, proposalPath, approvalPath };
}

function snapshot(currentRow, provenance = currentRow.expectedMetadataProvenance) {
  return {
    articleCount: 1,
    referenceCount: 1,
    reference: {
      id: currentRow.referenceId,
      title: currentRow.expectedTitle,
      pmid: currentRow.identifiers.pmid,
      authors: currentRow.expectedAuthors,
      ...(provenance === null ? {} : { metadataProvenance: provenance }),
    },
  };
}

function alphabetizeWireObject(value) {
  if (Array.isArray(value)) return value.map(alphabetizeWireObject);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, alphabetizeWireObject(value[key])]),
  );
}

describe("reference metadata provenance backfill apply", () => {
  it("requires an immutable proposal and separate exact approval", () => {
    const { proposal, approval } = artifacts();
    expect(validateApprovedReferenceProvenanceBackfill(proposal, approval)).toHaveLength(759);
    expect(() => validateApprovedReferenceProvenanceBackfill({ ...proposal, artifactSha256: "bad" }, approval)).toThrow(/hash/i);
    expect(() => validateApprovedReferenceProvenanceBackfill(proposal, { ...approval, decision: "pending" })).toThrow(/approval/i);
    expect(() => validateApprovedReferenceProvenanceBackfill(proposal, { ...approval, approvedAt: "2026-08-10" })).toThrow(/approval/i);
    expect(() => validateApprovedReferenceProvenanceBackfill(proposal, { ...approval, approvedBy: "tampered" })).toThrow(/approval/i);
  });

  it("accepts semantically identical proposal entries with alphabetized object keys", () => {
    const { proposal, approval } = artifacts();
    proposal.rows[0].proposedMetadataProvenance = alphabetizeWireObject(
      proposal.rows[0].proposedMetadataProvenance,
    );
    expect(validateApprovedReferenceProvenanceBackfill(proposal, approval)).toHaveLength(759);
  });

  it("rejects incorrect provenance semantics and destructive snapshots", () => {
    const { proposal, approval } = artifacts();
    const wrong = structuredClone(proposal);
    wrong.rows[0].proposedMetadataProvenance[0].kind = "inspected";
    wrong.rows[0].proposedMetadataProvenanceSha256 = sha256Json(wrong.rows[0].proposedMetadataProvenance);
    const { artifactSha256: _old, ...payload } = wrong;
    wrong.artifactSha256 = sha256Json(payload);
    const matching = withApprovalArtifactSha256({ ...approvalPayload(approval), proposalArtifactSha256: wrong.artifactSha256 });
    expect(() => validateApprovedReferenceProvenanceBackfill(wrong, matching)).toThrow(/semantics/i);
  });

  it("fails closed on duplicate articles/references and stale identity, authors, or provenance", () => {
    const current = row(0);
    expect(preflightReferenceProvenanceBackfill(snapshot(current), current)).toBe("apply");
    expect(preflightReferenceProvenanceBackfill(
      snapshot(current, alphabetizeWireObject(current.proposedMetadataProvenance)),
      current,
    )).toBe("already_applied");
    expect(() => preflightReferenceProvenanceBackfill({ ...snapshot(current), articleCount: 2 }, current)).toThrow(/ARTICLE_DUPLICATE/);
    expect(() => preflightReferenceProvenanceBackfill({ ...snapshot(current), referenceCount: 2 }, current)).toThrow(/REFERENCE_DUPLICATE/);
    expect(() => preflightReferenceProvenanceBackfill({ ...snapshot(current), reference: { ...snapshot(current).reference, authors: ["Changed"] } }, current)).toThrow(/REFERENCE_CONFLICT/);
    expect(() => preflightReferenceProvenanceBackfill(snapshot(current, [{ ...current.proposedMetadataProvenance[0], provider: "changed" }]), current)).toThrow(/REFERENCE_CONFLICT/);

    const ordered = row(0);
    ordered.proposedMetadataProvenance[0].fields = ["authors", "title"];
    expect(() => preflightReferenceProvenanceBackfill(snapshot(ordered, [{
      ...ordered.proposedMetadataProvenance[0],
      fields: ["title", "authors"],
    }]), ordered)).toThrow(/REFERENCE_CONFLICT/);
  });

  it("defaults to a read-only 759-row dry run", async () => {
    const values = writeArtifacts();
    const rowsById = new Map(values.proposal.rows.map((entry) => [entry.referenceId, entry]));
    const client = { query: vi.fn(async (_query, args) => snapshot(rowsById.get(args.referenceId))) };
    const result = await runApplyReferenceProvenanceBackfill([
      `--proposal=${values.proposalPath}`,
      `--approval=${values.approvalPath}`,
    ], { client, env: { DATA_BACKEND: "postgres", SOURCE_POSTGRES_URL: "postgres://example/dosewiki" }, logger: { log: vi.fn() } });
    expect(result).toEqual({ status: "dry_run", pending: 759, alreadyApplied: 0 });
    expect(client.query).toHaveBeenCalledTimes(759);
    expect(client.mutation).toBeUndefined();
  });

  it("rejects a different database before reading any proposal rows", async () => {
    const values = writeArtifacts();
    const client = { query: vi.fn(), mutation: vi.fn() };
    await expect(runApplyReferenceProvenanceBackfill([
      `--proposal=${values.proposalPath}`,
      `--approval=${values.approvalPath}`,
      "--source-url=postgres://reader:secret@example/other",
    ], { client, env: { DATA_BACKEND: "postgres" }, logger: { log: vi.fn() } })).rejects.toThrow(Error);
    expect(client.query).not.toHaveBeenCalled();
    expect(client.mutation).not.toHaveBeenCalled();
  });

  it("requires explicit production confirmations, rereads, backs up, audits, and verifies", async () => {
    const values = writeArtifacts();
    const rowsById = new Map(values.proposal.rows.map((entry) => [entry.referenceId, entry]));
    const current = new Map(values.proposal.rows.map((entry, index) => [
      entry.referenceId,
      index === 0 ? null : entry.proposedMetadataProvenance,
    ]));
    const client = {
      query: vi.fn(async (_query, args) => snapshot(
        rowsById.get(args.referenceId),
        alphabetizeWireObject(current.get(args.referenceId)),
      )),
      mutation: vi.fn(async (_mutation, args) => {
        current.set(args.referenceId, args.proposedMetadataProvenance);
        return {
          updated: true,
          metadataProvenance: alphabetizeWireObject(args.proposedMetadataProvenance),
        };
      }),
    };
    const writeAuditLog = vi.fn(() => ({ path: "/tmp/provenance-audit.json" }));
    const updateAuditLog = vi.fn();
    const result = await runApplyReferenceProvenanceBackfill([
      `--proposal=${values.proposalPath}`,
      `--approval=${values.approvalPath}`,
      "--target=postgres://example/dosewiki",
      "--write",
      "--allow-remote",
      "--confirm-write=apply-citation-reference-provenance-backfill",
      "--expected-deployment=example/dosewiki",
      "--confirm-citation-provenance-write",
    ], {
      client,
      apiKey: "scoped-token",
      env: { DATA_BACKEND: "postgres", POSTGRES_IMPORT_CONFIRM: "example" },
      logger: { log: vi.fn() },
      backupBeforeWrite: vi.fn(async () => ({ path: "/tmp/backup.json", documentCount: 1 })),
      writeAuditLog,
      updateAuditLog,
    });
    expect(result.status).toBe("completed");
    expect(client.mutation).toHaveBeenCalledTimes(1);
    expect(client.query).toHaveBeenCalledTimes(761);
    expect(writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      mutations: [expect.objectContaining({ key: values.proposal.rows[0].key })],
    }));
    expect(updateAuditLog).toHaveBeenCalledWith("/tmp/provenance-audit.json", expect.objectContaining({
      status: "completed",
      approvalArtifactSha256: values.approval.approvalArtifactSha256,
      evidenceBundle: values.proposal.evidenceBundle,
      results: [{ key: values.proposal.rows[0].key, status: "updated" }],
    }));
  });
});
