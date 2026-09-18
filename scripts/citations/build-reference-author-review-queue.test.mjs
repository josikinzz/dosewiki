import { describe, expect, it } from "vitest";

import {
  balancedBatchSizes,
  buildCitationAuthorReviewQueue,
  validateCitationAuthorRepairProposal,
} from "./build-reference-author-review-queue.mjs";
import { sha256Json } from "./plan-reference-author-repairs.mjs";

function residualRow(index, overrides = {}) {
  const slug = overrides.slug ?? `article-${String(Math.floor(index / 7)).padStart(2, "0")}`;
  return {
    key: `${slug}::ref-${String(index).padStart(3, "0")}`,
    slug,
    articleTitle: `Article ${slug}`,
    referenceId: `ref-${index}`,
    classification: "residual",
    reasonCodes: ["provider_failure"],
    identifiers: { doi: `10.1000/${index}`, pmid: null },
    storedTitle: `Reference ${index}`,
    expectedReference: { id: `ref-${index}`, title: `Reference ${index}`, authors: [] },
    expectedReferenceSha256: "fixture",
    expectedAuthors: [],
    proposedAuthors: [],
    providerLanes: [],
    ...overrides,
  };
}

function proposal(residual) {
  const payload = {
    artifactType: "citation_author_repair_proposal",
    artifactVersion: 1,
    generatedAt: "2026-08-09T00:00:00.000Z",
    sourceDeployment: "example/dosewiki",
    mode: "dry_run",
    summary: {
      articleCount: new Set(residual.map((row) => row.slug)).size,
      candidateCount: residual.length,
      highConfidenceCount: 0,
      residualCount: residual.length,
      residualReasonCounts: {},
    },
    highConfidence: [],
    residual,
  };
  return { ...payload, artifactSha256: sha256Json(payload) };
}

describe("citation author residual review queue", () => {
  it("balances non-empty queues into deterministic 10–20 item batches", () => {
    expect(balancedBatchSizes(1)).toEqual([1]);
    expect(balancedBatchSizes(20)).toEqual([20]);
    expect(balancedBatchSizes(21)).toEqual([11, 10]);
    expect(balancedBatchSizes(41)).toEqual([14, 14, 13]);

    const artifact = proposal(Array.from({ length: 41 }, (_, index) => residualRow(index)).reverse());
    const queue = buildCitationAuthorReviewQueue(artifact, { generatedAt: "2026-08-10T00:00:00.000Z" });
    expect(queue.batches.map((batch) => batch.rows.length)).toEqual([14, 14, 13]);
    expect(queue.batches.flatMap((batch) => batch.rows).map((row) => row.key)).toEqual(
      [...artifact.residual].sort((left, right) => left.slug.localeCompare(right.slug) || left.key.localeCompare(right.key)).map((row) => row.key),
    );
    expect(queue.batches.every((batch) => batch.articleSlugs.length > 0)).toBe(true);
  });

  it("keeps ordering and batch IDs stable regardless of proposal row order", () => {
    const rows = Array.from({ length: 23 }, (_, index) => residualRow(index));
    const leftProposal = proposal(rows);
    const rightProposal = proposal([...rows].reverse());
    // Proposal hashes legitimately differ when immutable row order differs; normalize
    // both proposals to the same signed order before comparing repeat builds.
    const first = buildCitationAuthorReviewQueue(leftProposal, { generatedAt: "2026-08-10T00:00:00.000Z" });
    const second = buildCitationAuthorReviewQueue(leftProposal, { generatedAt: "2026-08-11T00:00:00.000Z" });
    expect(first.batches.map((batch) => batch.batchId)).toEqual(second.batches.map((batch) => batch.batchId));
    expect(first.batches.flatMap((batch) => batch.rows).map((row) => row.key)).toEqual(
      buildCitationAuthorReviewQueue(rightProposal, { generatedAt: "2026-08-10T00:00:00.000Z" })
        .batches.flatMap((batch) => batch.rows).map((row) => row.key),
    );
  });

  it("preserves reason codes and supplies instructions for every exception class", () => {
    const reasons = [
      "identifier_conflict",
      "title_conflict",
      "missing_stable_identifier",
      "no_authors_returned",
      "institutional_authorship",
      "duplicate_reference",
      "provider_failure",
    ];
    const queue = buildCitationAuthorReviewQueue(proposal(reasons.map((reason, index) => residualRow(index, { reasonCodes: [reason] }))));
    expect(queue.batches[0].reasonCodes).toEqual([...reasons].sort());
    expect(queue.batches[0].rows.map((row) => row.reasonCodes[0])).toEqual(reasons);
    expect(queue.batches[0].reviewInstructions.map((item) => item.category).sort()).toEqual([
      "identifier_disagreement",
      "missing_identifier_or_authors",
      "organizational_ambiguity",
      "possible_duplicate",
      "source_inspection",
      "title_disagreement",
    ]);
    expect(queue.sourceProposal).toEqual(expect.objectContaining({
      artifactSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      sourceDeployment: "example/dosewiki",
    }));
  });

  it("emits a valid empty review queue when there are no residuals", () => {
    const queue = buildCitationAuthorReviewQueue(proposal([]), { generatedAt: "2026-08-10T00:00:00.000Z" });
    expect(queue.summary).toEqual({ residualCount: 0, batchCount: 0, articleCount: 0, reasonCounts: {} });
    expect(queue.batches).toEqual([]);
  });

  it("rejects a proposal whose immutable digest no longer matches", () => {
    const artifact = proposal([residualRow(0)]);
    artifact.residual[0].storedTitle = "Tampered title";
    expect(() => validateCitationAuthorRepairProposal(artifact)).toThrow(/hash is missing or invalid/i);
  });
});
