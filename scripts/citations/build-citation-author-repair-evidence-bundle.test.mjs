import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  buildEvidenceBundleFromFiles,
  sha256Json,
} from "./build-citation-author-repair-evidence-bundle.mjs";

const temporary = [];
afterEach(() => {
  for (const directory of temporary.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

const DETERMINISTIC_WAVE = "deterministic-high-confidence";
const REVIEWED_WAVE = "independently-reviewed-residual";
const PRIMARY_REVIEWER = "reviewer-primary";
const REFUTATION_REVIEWER = "reviewer-refuter";

// The bundle builder pins the completed campaign population: 74 provider-fetched
// repairs plus 685 independently reviewed repairs, 759 unique keys. The
// synthetic lineage reproduces that population with hash-bound artifacts so the
// digest, coverage, and independence gates all execute from a temp directory.
function deterministicMutation(index) {
  const number = String(index + 1).padStart(3, "0");
  const title = `Deterministic Reference ${number}`;
  const proposedAuthors = [`Author ${number} A`, `Author ${number} B`];
  return {
    slug: `article-${number}`,
    referenceId: `ref-det-${number}`,
    proposedAuthors,
    providerLanes: [{
      providerLane: "doi",
      title,
      authors: proposedAuthors,
      identifiers: { doi: `10.1000/det.${number}` },
      metadataProvenance: [{ status: "success", provider: "crossref", title, authorCount: proposedAuthors.length }],
    }],
  };
}

function reviewedMutation(index) {
  const number = String(index + 1).padStart(3, "0");
  const key = `article-${number}::ref-rev-${number}`;
  const proposedAuthors = [`Reviewed Author ${number}`];
  const doi = `10.1000/rev.${number}`;
  // Every tenth reviewed row keeps a stored title that differs from the review
  // title so the stable-identifier identity basis is exercised.
  const storedTitle = index % 10 === 0 ? `Stored Legacy Title ${number}` : `Reviewed Reference ${number}`;
  const result = { key, decision: "resolved", authors: proposedAuthors, title: `Reviewed Reference ${number}`, doi, pmid: null, sourceUrls: [`https://doi.org/${doi}`] };
  const reviewResultSha256 = sha256Json(result);
  const expectedReference = { title: storedTitle, doi, pmid: null };
  return {
    mutation: {
      slug: `article-${number}`,
      referenceId: `ref-rev-${number}`,
      proposedAuthors,
      reviewedEvidence: {
        result,
        reviewResultSha256,
        reviewResultArtifactSha256: sha256(`review-artifact-${number}`),
        refutationArtifactSha256: sha256(`refutation-artifact-${number}`),
        refutationDecision: "survived_refutation",
        primaryReviewerIdentifier: PRIMARY_REVIEWER,
        refutationReviewerIdentifier: REFUTATION_REVIEWER,
        refutation: {
          key,
          decision: "survived_refutation",
          reviewResultSha256,
          originalReviewerIdentifier: PRIMARY_REVIEWER,
          refutationReviewerIdentifier: REFUTATION_REVIEWER,
          authoritativeSourceUrls: [`https://www.pubmed.ncbi.nlm.nih.gov/${number}`],
        },
      },
    },
    proposalRow: { key, classification: "high_confidence", expectedReference, expectedReferenceSha256: sha256Json(expectedReference), proposedAuthors },
  };
}

function audit(mutations, proposalArtifactSha256) {
  return {
    status: "completed",
    proposalArtifactSha256,
    mutations,
    results: mutations.map((mutation) => ({ status: "updated", key: `${mutation.slug}::${mutation.referenceId}` })),
  };
}

function writeJson(directory, name, value) {
  const filePath = path.join(directory, name);
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
  fs.writeFileSync(filePath, bytes);
  return { path: filePath, bytes, fileSha256: sha256(bytes) };
}

/** Writes a complete synthetic lineage; `transform` may mutate artifacts before they are written. */
function syntheticLineage(transform = (artifacts) => artifacts) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "citation-author-evidence-"));
  temporary.push(directory);
  const deterministicMutations = Array.from({ length: 74 }, (_, index) => deterministicMutation(index));
  const reviewed = Array.from({ length: 685 }, (_, index) => reviewedMutation(index));
  const deterministicProposalSha256 = sha256("deterministic-proposal");
  const proposalPayload = { artifactType: "citation_author_repair_proposal", highConfidence: reviewed.map((row) => row.proposalRow) };
  const proposal = { ...proposalPayload, artifactSha256: sha256Json(proposalPayload) };
  const artifacts = transform({
    deterministicAudit: audit(deterministicMutations, deterministicProposalSha256),
    reviewedAudit: audit(reviewed.map((row) => row.mutation), proposal.artifactSha256),
    proposal,
    proposalBytes: null,
  });
  const deterministicAudit = writeJson(directory, "deterministic-audit.json", artifacts.deterministicAudit);
  const reviewedAudit = writeJson(directory, "reviewed-audit.json", artifacts.reviewedAudit);
  const proposalFile = artifacts.proposalBytes
    ? { path: path.join(directory, "reviewed-proposal.json"), fileSha256: sha256(artifacts.proposalBytes) }
    : writeJson(directory, "reviewed-proposal.json", artifacts.proposal);
  if (artifacts.proposalBytes) fs.writeFileSync(proposalFile.path, artifacts.proposalBytes);
  const lineage = {
    sourceDeployment: "prod:synthetic-deployment",
    waves: [{
      name: DETERMINISTIC_WAVE,
      successfulMutationCount: 74,
      proposalArtifactSha256: deterministicProposalSha256,
      referenceProviders: Object.fromEntries(deterministicMutations.map((mutation) => [`${mutation.slug}::${mutation.referenceId}`, ["crossref"]])),
      sourceArtifacts: {
        audit: { path: deterministicAudit.path, fileSha256: artifacts.deterministicAuditFileSha256 ?? deterministicAudit.fileSha256 },
        approval: { path: path.join(directory, "deterministic-approval.json"), fileSha256: sha256("deterministic-approval") },
      },
    }, {
      name: REVIEWED_WAVE,
      successfulMutationCount: 685,
      proposalArtifactSha256: artifacts.declaredProposalArtifactSha256 ?? artifacts.proposal.artifactSha256,
      referenceProviders: Object.fromEntries(reviewed.map((row) => [row.proposalRow.key, []])),
      sourceArtifacts: {
        audit: { path: reviewedAudit.path, fileSha256: reviewedAudit.fileSha256 },
        approval: { path: path.join(directory, "reviewed-approval.json"), fileSha256: sha256("reviewed-approval") },
        proposal: { path: proposalFile.path, fileSha256: artifacts.declaredProposalFileSha256 ?? proposalFile.fileSha256 },
      },
    }],
  };
  const lineagePath = writeJson(directory, "lineage.json", lineage).path;
  return { lineagePath, outputPath: path.join(directory, "evidence.json") };
}

describe("tracked citation-author evidence bundle", () => {
  it("rebuilds deterministically from the lineage-declared hash-bound proposal", () => {
    const { lineagePath, outputPath } = syntheticLineage();
    const rebuilt = buildEvidenceBundleFromFiles({ lineagePath, outputPath });
    expect(rebuilt.rows).toHaveLength(759);
    expect(new Set(rebuilt.rows.map((row) => row.key)).size).toBe(759);
    expect(rebuilt.rows.map((row) => row.key)).toEqual([...rebuilt.rows.map((row) => row.key)].sort((left, right) => left.localeCompare(right)));
    expect(rebuilt.rows.filter((row) => row.provenance.every((entry) => entry.kind === "fetched"))).toHaveLength(74);
    expect(rebuilt.rows.filter((row) => row.provenance.every((entry) => entry.kind === "inspected"))).toHaveLength(685);
    expect(rebuilt.rows.filter((row) => row.identityMatchBasis === "stable_identifier_with_independent_review")).toHaveLength(69);
    expect(rebuilt.rows.filter((row) => row.identityMatchBasis === "title_and_identifier")).toHaveLength(690);
    expect(rebuilt.waves.map((wave) => wave.name)).toEqual([DETERMINISTIC_WAVE, REVIEWED_WAVE]);
    expect(rebuilt.waves[1].proposalFileSha256).toMatch(/^[a-f0-9]{64}$/);
    const { bundleDigest, ...payload } = rebuilt;
    expect(bundleDigest).toBe(sha256Json(payload));
    expect(JSON.parse(fs.readFileSync(outputPath, "utf8"))).toEqual(rebuilt);

    const again = syntheticLineage();
    const rebuiltAgain = buildEvidenceBundleFromFiles({ lineagePath: again.lineagePath, outputPath: again.outputPath });
    expect(rebuiltAgain.bundleDigest).toBe(bundleDigest);
    expect(sha256(fs.readFileSync(again.outputPath))).toBe(sha256(fs.readFileSync(outputPath)));
  });

  it("rejects proposal bytes that do not match the lineage-declared file hash", () => {
    const { lineagePath, outputPath } = syntheticLineage((artifacts) => {
      const declared = Buffer.from(`${JSON.stringify(artifacts.proposal, null, 2)}\n`);
      return {
        ...artifacts,
        proposalBytes: Buffer.concat([declared, Buffer.from("\n")]),
        declaredProposalFileSha256: sha256(declared),
      };
    });
    expect(() => buildEvidenceBundleFromFiles({ lineagePath, outputPath })).toThrow(/proposal file hash mismatch/i);
    expect(fs.existsSync(outputPath)).toBe(false);
  });

  it("rejects a proposal whose declared artifact digest differs from the lineage", () => {
    const { lineagePath, outputPath } = syntheticLineage((artifacts) => ({
      ...artifacts,
      declaredProposalArtifactSha256: sha256("some other proposal"),
    }));
    expect(() => buildEvidenceBundleFromFiles({ lineagePath, outputPath })).toThrow(/proposal declared artifact digest mismatch/i);
  });

  it("rejects a proposal whose canonical artifact digest is invalid", () => {
    const { lineagePath, outputPath } = syntheticLineage((artifacts) => {
      const proposal = structuredClone(artifacts.proposal);
      proposal.highConfidence[0].proposedAuthors = ["Substituted Author"];
      return { ...artifacts, proposal };
    });
    expect(() => buildEvidenceBundleFromFiles({ lineagePath, outputPath })).toThrow(/proposal canonical artifact digest mismatch/i);
  });

  it("rejects an audit whose bytes drifted from the lineage-declared file hash", () => {
    const { lineagePath, outputPath } = syntheticLineage((artifacts) => ({
      ...artifacts,
      deterministicAuditFileSha256: "0".repeat(64),
    }));
    expect(() => buildEvidenceBundleFromFiles({ lineagePath, outputPath })).toThrow(/audit file hash mismatch/i);
  });

  it("rejects reviewed evidence whose refutation was not independent or whose stored identity drifted", () => {
    const dependent = syntheticLineage((artifacts) => {
      const reviewedAudit = structuredClone(artifacts.reviewedAudit);
      const evidence = reviewedAudit.mutations[0].reviewedEvidence;
      evidence.refutationReviewerIdentifier = PRIMARY_REVIEWER;
      evidence.refutation.refutationReviewerIdentifier = PRIMARY_REVIEWER;
      return { ...artifacts, reviewedAudit };
    });
    expect(() => buildEvidenceBundleFromFiles(dependent)).toThrow(/reviewers are not independent/);

    const rebound = syntheticLineage((artifacts) => {
      const proposal = structuredClone(artifacts.proposal);
      const row = proposal.highConfidence[1];
      row.expectedReference = { ...row.expectedReference, title: "Unrelated Stored Title", doi: "10.1000/unrelated" };
      row.expectedReferenceSha256 = sha256Json(row.expectedReference);
      const { artifactSha256: _ignored, ...payload } = proposal;
      return { ...artifacts, proposal: { ...payload, artifactSha256: sha256Json(payload) } };
    });
    // The audit still cites the original proposal digest, so the audit-to-proposal binding fails first.
    expect(() => buildEvidenceBundleFromFiles(rebound)).toThrow(/proposal digest mismatch/);

    const drifted = syntheticLineage((artifacts) => {
      const proposal = structuredClone(artifacts.proposal);
      const row = proposal.highConfidence[1];
      row.expectedReference = { ...row.expectedReference, title: "Unrelated Stored Title", doi: "10.1000/unrelated" };
      row.expectedReferenceSha256 = sha256Json(row.expectedReference);
      const { artifactSha256: _ignored, ...payload } = proposal;
      const artifactSha256 = sha256Json(payload);
      return { ...artifacts, proposal: { ...payload, artifactSha256 }, reviewedAudit: { ...artifacts.reviewedAudit, proposalArtifactSha256: artifactSha256 } };
    });
    expect(() => buildEvidenceBundleFromFiles(drifted)).toThrow(/title mismatch lacks independently reviewed stable-identifier identity/);
  });
});
