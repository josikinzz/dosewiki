import { describe, expect, it } from "vitest";

import {
  buildReviewedReferenceAuthorRepairProposal,
  reviewResultSha256,
} from "./build-reviewed-reference-author-repair-proposal.mjs";
import { buildCitationAuthorReviewQueue } from "./build-reference-author-review-queue.mjs";
import { sha256Json } from "./plan-reference-author-repairs.mjs";

function residualRow(index, overrides = {}) {
  const expectedReference = {
    id: `ref-${index}`,
    title: `Stored title ${index}`,
    authors: [],
    doi: index === 1 ? null : `10.1000/${index}`,
    pmid: null,
  };
  return {
    key: `article::ref-${index}`,
    slug: "article",
    articleTitle: "Article",
    referenceId: `ref-${index}`,
    classification: "residual",
    reasonCodes: ["title_conflict"],
    identifiers: { doi: expectedReference.doi, pmid: null },
    storedTitle: expectedReference.title,
    expectedReference,
    expectedReferenceSha256: sha256Json(expectedReference),
    expectedAuthors: [],
    proposedAuthors: [],
    providerLanes: [],
    ...overrides,
  };
}

function originalProposal(rows) {
  const payload = {
    artifactType: "citation_author_repair_proposal",
    artifactVersion: 1,
    generatedAt: "2026-08-09T00:00:00.000Z",
    sourceDeployment: "example/dosewiki",
    mode: "dry_run",
    summary: {},
    highConfidence: [],
    residual: rows,
  };
  return { ...payload, artifactSha256: sha256Json(payload) };
}

function resultRow(row, overrides = {}) {
  return {
    key: row.key,
    decision: "resolved",
    authors: ["First Author", "Second Author"],
    doi: row.identifiers.doi,
    pmid: row.identifiers.pmid,
    title: row.storedTitle,
    sourceUrls: ["https://pubmed.ncbi.nlm.nih.gov/123/"],
    inspectedEvidence: "The authoritative PubMed record explicitly lists the complete byline.",
    confidence: "high",
    ...overrides,
  };
}

function resultArtifact(proposal, batch, results, reviewerIdentifier = "primary-reviewer") {
  return {
    artifactType: "citation_author_repair_review_result",
    artifactVersion: 1,
    batchId: batch.batchId,
    proposalDigest: proposal.artifactSha256,
    reviewerIdentifier,
    generatedAt: "2026-08-09T02:00:00.000Z",
    results,
  };
}

function refutation(proposal, queue, batch, result, overrides = {}) {
  return {
    artifactType: "citation_author_repair_refutation",
    artifactVersion: 1,
    proposalArtifactSha256: proposal.artifactSha256,
    queueArtifactSha256: queue.artifactSha256,
    batchId: batch.batchId,
    key: result.key,
    reviewResultSha256: reviewResultSha256(result),
    originalReviewerIdentifier: "primary-reviewer",
    refutationReviewerIdentifier: "independent-refuter",
    decision: "survived_refutation",
    authoritativeSourceUrls: ["https://pubmed.ncbi.nlm.nih.gov/123/"],
    inspectedEvidence: "Independent inspection confirmed the source byline and identifier.",
    generatedAt: "2026-08-09T03:00:00.000Z",
    ...overrides,
  };
}

function setup(rows = [residualRow(0)]) {
  const proposal = originalProposal(rows);
  const queue = buildCitationAuthorReviewQueue(proposal, { generatedAt: "2026-08-09T01:00:00.000Z" });
  const batch = queue.batches[0];
  const results = rows.map((row) => resultRow(row));
  const result = resultArtifact(proposal, batch, results);
  const refutations = results.map((row) => refutation(proposal, queue, batch, row));
  return { proposal, queue, batch, results, result, refutations };
}

describe("independently reviewed citation-author repair proposal", () => {
  it("promotes only resolved rows that survive an independent refutation while preserving CAS snapshots", () => {
    const values = setup();
    const artifact = buildReviewedReferenceAuthorRepairProposal({
      originalProposal: values.proposal,
      reviewQueue: values.queue,
      reviewResults: [values.result],
      refutations: values.refutations,
      generatedAt: "2026-08-09T04:00:00.000Z",
    });

    expect(artifact.sourceKind).toBe("independently_reviewed_residual");
    expect(artifact.highConfidence).toHaveLength(1);
    expect(artifact.residual).toHaveLength(0);
    expect(artifact.highConfidence[0]).toEqual(expect.objectContaining({
      key: values.proposal.residual[0].key,
      classification: "high_confidence",
      sourceKind: "independently_reviewed_residual",
      expectedReference: values.proposal.residual[0].expectedReference,
      expectedReferenceSha256: values.proposal.residual[0].expectedReferenceSha256,
      identifiers: values.proposal.residual[0].identifiers,
      expectedAuthors: [],
      proposedAuthors: ["First Author", "Second Author"],
    }));
    expect(artifact.highConfidence[0].reviewedEvidence).toEqual(expect.objectContaining({
      reviewResultSha256: reviewResultSha256(values.results[0]),
      primaryReviewerIdentifier: "primary-reviewer",
      refutationReviewerIdentifier: "independent-refuter",
      refutationDecision: "survived_refutation",
    }));
    const { artifactSha256, ...payload } = artifact;
    expect(artifactSha256).toBe(sha256Json(payload));
  });

  it("requires an exact one-to-one result for every queue batch and row", () => {
    const values = setup([residualRow(0), residualRow(1)]);
    const missingRowResult = resultArtifact(values.proposal, values.batch, [values.results[0]]);
    expect(() => buildReviewedReferenceAuthorRepairProposal({
      originalProposal: values.proposal,
      reviewQueue: values.queue,
      reviewResults: [missingRowResult],
      refutations: [values.refutations[0]],
    })).toThrow(/exact row completeness/i);

    expect(() => buildReviewedReferenceAuthorRepairProposal({
      originalProposal: values.proposal,
      reviewQueue: values.queue,
      reviewResults: [values.result, values.result],
      refutations: values.refutations,
    })).toThrow(/exact batch completeness/i);
  });

  it("rejects tampered proposal or queue digests and mismatched queue rows", () => {
    const values = setup();
    const tamperedProposal = structuredClone(values.proposal);
    tamperedProposal.residual[0].storedTitle = "Tampered";
    expect(() => buildReviewedReferenceAuthorRepairProposal({
      originalProposal: tamperedProposal,
      reviewQueue: values.queue,
      reviewResults: [values.result],
      refutations: values.refutations,
    })).toThrow(/proposal artifact hash/i);

    const tamperedQueue = structuredClone(values.queue);
    tamperedQueue.batches[0].rows[0].storedTitle = "Tampered";
    expect(() => buildReviewedReferenceAuthorRepairProposal({
      originalProposal: values.proposal,
      reviewQueue: tamperedQueue,
      reviewResults: [values.result],
      refutations: values.refutations,
    })).toThrow(/queue artifact hash/i);
  });

  it("requires a differently authored, hash-bound refutation with authoritative evidence", () => {
    const values = setup();
    for (const invalid of [
      { ...values.refutations[0], reviewResultSha256: "wrong" },
      { ...values.refutations[0], refutationReviewerIdentifier: "primary-reviewer" },
      { ...values.refutations[0], refutationReviewerIdentifier: " PRIMARY-REVIEWER " },
      { ...values.refutations[0], authoritativeSourceUrls: [] },
      { ...values.refutations[0], authoritativeSourceUrls: ["https://example.com/not-authoritative"] },
      { ...values.refutations[0], inspectedEvidence: "" },
    ]) {
      expect(() => buildReviewedReferenceAuthorRepairProposal({
        originalProposal: values.proposal,
        reviewQueue: values.queue,
        reviewResults: [values.result],
        refutations: [invalid],
      })).toThrow(/refutation/i);
    }
  });

  it("binds reviewed identity to an original stable identifier and rejects contradictions", () => {
    const values = setup();
    const mismatchedDoi = resultArtifact(values.proposal, values.batch, [resultRow(values.proposal.residual[0], {
      doi: "10.1000/different",
    })]);
    expect(() => buildReviewedReferenceAuthorRepairProposal({
      originalProposal: values.proposal,
      reviewQueue: values.queue,
      reviewResults: [mismatchedDoi],
      refutations: [],
    })).toThrow(/stable identifier|identity/i);

    const matchingDoiDifferentTitle = resultRow(values.proposal.residual[0], { title: "A punctuation-different provider title" });
    const matchingArtifact = resultArtifact(values.proposal, values.batch, [matchingDoiDifferentTitle]);
    const matchingRefutation = refutation(values.proposal, values.queue, values.batch, matchingDoiDifferentTitle);
    expect(buildReviewedReferenceAuthorRepairProposal({
      originalProposal: values.proposal,
      reviewQueue: values.queue,
      reviewResults: [matchingArtifact],
      refutations: [matchingRefutation],
    }).highConfidence).toHaveLength(1);
  });

  it("requires reviewed evidence to match both original DOI and PMID when both are present", () => {
    const expectedReference = {
      ...residualRow(0).expectedReference,
      doi: "10.1000/dual",
      pmid: "12345678",
    };
    const original = residualRow(0, {
      identifiers: { doi: "10.1000/dual", pmid: "12345678" },
      expectedReference,
      expectedReferenceSha256: sha256Json(expectedReference),
    });
    const values = setup([original]);

    for (const overrides of [{ pmid: null }, { pmid: "87654321" }, { doi: null }, { doi: "10.1000/other" }]) {
      const reviewed = resultRow(original, overrides);
      const result = resultArtifact(values.proposal, values.batch, [reviewed]);
      const checked = refutation(values.proposal, values.queue, values.batch, reviewed);
      expect(() => buildReviewedReferenceAuthorRepairProposal({
        originalProposal: values.proposal,
        reviewQueue: values.queue,
        reviewResults: [result],
        refutations: [checked],
      })).toThrow(/stable identifier|identity/i);
    }
  });

  it("rejects identifier contradictions between the row and complete expected snapshot", () => {
    const expectedReference = {
      ...residualRow(0).expectedReference,
      doi: "10.1000/snapshot",
      pmid: "12345678",
    };
    const original = residualRow(0, {
      identifiers: { doi: "10.1000/row", pmid: "12345678" },
      expectedReference,
      expectedReferenceSha256: sha256Json(expectedReference),
    });
    const values = setup([original]);
    const reviewed = resultRow(original);
    const result = resultArtifact(values.proposal, values.batch, [reviewed]);
    const checked = refutation(values.proposal, values.queue, values.batch, reviewed);
    expect(() => buildReviewedReferenceAuthorRepairProposal({
      originalProposal: values.proposal,
      reviewQueue: values.queue,
      reviewResults: [result],
      refutations: [checked],
    })).toThrow(/contradict|identity/i);
  });

  it("requires exact normalized title identity for identifierless originals", () => {
    const values = setup([residualRow(1)]);
    const mismatched = resultRow(values.proposal.residual[0], { title: "A different work" });
    const result = resultArtifact(values.proposal, values.batch, [mismatched]);
    expect(() => buildReviewedReferenceAuthorRepairProposal({
      originalProposal: values.proposal,
      reviewQueue: values.queue,
      reviewResults: [result],
      refutations: [],
    })).toThrow(/title identity/i);

    const matched = resultRow(values.proposal.residual[0], { title: "  STORED title 1  " });
    const matchedArtifact = resultArtifact(values.proposal, values.batch, [matched]);
    const matchedRefutation = refutation(values.proposal, values.queue, values.batch, matched);
    expect(buildReviewedReferenceAuthorRepairProposal({
      originalProposal: values.proposal,
      reviewQueue: values.queue,
      reviewResults: [matchedArtifact],
      refutations: [matchedRefutation],
    }).highConfidence).toHaveLength(1);
  });

  it("canonicalizes nonempty reviewer identities before enforcing independent review", () => {
    const values = setup();
    const result = resultArtifact(values.proposal, values.batch, values.results, " Primary-Reviewer ");
    const checked = refutation(values.proposal, values.queue, values.batch, values.results[0], {
      originalReviewerIdentifier: "PRIMARY-REVIEWER",
      refutationReviewerIdentifier: " Independent-Refuter ",
    });
    const artifact = buildReviewedReferenceAuthorRepairProposal({
      originalProposal: values.proposal,
      reviewQueue: values.queue,
      reviewResults: [result],
      refutations: [checked],
    });
    expect(artifact.highConfidence[0].reviewedEvidence).toEqual(expect.objectContaining({
      primaryReviewerIdentifier: "primary-reviewer",
      refutationReviewerIdentifier: "independent-refuter",
    }));

    for (const reviewerIdentifier of ["", "   "]) {
      expect(() => buildReviewedReferenceAuthorRepairProposal({
        originalProposal: values.proposal,
        reviewQueue: values.queue,
        reviewResults: [resultArtifact(values.proposal, values.batch, values.results, reviewerIdentifier)],
        refutations: values.refutations,
      })).toThrow(/reviewer|bound/i);
    }
    for (const refutationReviewerIdentifier of ["", "   ", "PRIMARY-REVIEWER"]) {
      expect(() => buildReviewedReferenceAuthorRepairProposal({
        originalProposal: values.proposal,
        reviewQueue: values.queue,
        reviewResults: [values.result],
        refutations: [refutation(values.proposal, values.queue, values.batch, values.results[0], {
          refutationReviewerIdentifier,
        })],
      })).toThrow(/refutation|independent/i);
    }
  });

  it("retains the whole result artifact digest and generatedAt in reviewed evidence", () => {
    const values = setup();
    const artifact = buildReviewedReferenceAuthorRepairProposal({
      originalProposal: values.proposal,
      reviewQueue: values.queue,
      reviewResults: [values.result],
      refutations: values.refutations,
    });
    expect(artifact.highConfidence[0].reviewedEvidence).toEqual(expect.objectContaining({
      reviewResultArtifactSha256: sha256Json(values.result),
      reviewResultGeneratedAt: values.result.generatedAt,
    }));
  });

  it("permanently excludes duplicate, unresolved, refuted, and uncertain rows", () => {
    const rows = [
      residualRow(0, { reasonCodes: ["duplicate_reference"] }),
      residualRow(1),
      residualRow(2),
      residualRow(3),
    ];
    const values = setup(rows);
    const decisions = [
      resultRow(rows[0]),
      resultRow(rows[1], { decision: "unresolved", authors: [] }),
      resultRow(rows[2]),
      resultRow(rows[3]),
    ];
    const result = resultArtifact(values.proposal, values.batch, decisions);
    const refutations = [
      refutation(values.proposal, values.queue, values.batch, decisions[0]),
      refutation(values.proposal, values.queue, values.batch, decisions[2], { decision: "refuted" }),
      refutation(values.proposal, values.queue, values.batch, decisions[3], { decision: "uncertain" }),
    ];
    const artifact = buildReviewedReferenceAuthorRepairProposal({
      originalProposal: values.proposal,
      reviewQueue: values.queue,
      reviewResults: [result],
      refutations,
    });

    expect(artifact.highConfidence).toEqual([]);
    expect(artifact.residual.map((row) => row.reviewDisposition)).toEqual([
      "duplicate_permanently_excluded",
      "unresolved",
      "refuted",
      "uncertain",
    ]);
    expect(() => buildCitationAuthorReviewQueue(artifact)).toThrow(/terminal|reviewed proposal/i);
  });
});
