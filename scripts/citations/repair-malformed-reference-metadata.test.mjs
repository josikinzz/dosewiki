import { describe, expect, it, vi } from "vitest";

import {
  buildMalformedReferenceRepairProposal,
  collectUsedReferenceIds,
  isMalformedReference,
  isMalformedReferenceRepairRowApplied,
  validateMalformedReferenceRepairProposal,
} from "./repair-malformed-reference-metadata.mjs";

const malformedUsed = {
  id: "doi-10-2147-sar-s36761",
  type: "unknown",
  title: '<ref name="pmid24648790" /> [[NMDA receptor]]',
  authors: [],
  doi: "10.2147/SAR.S36761",
  url: "https://doi.org/10.2147/SAR.S36761",
  sourceType: "unknown",
  quality: "fallback",
  metadataProvenance: [{
    kind: "cached",
    source: "wikipedia-reference-cache",
    fields: ["title"],
  }],
};

const malformedUnused = {
  id: "unused-wiki-reference",
  type: "unknown",
  title: "{{cite web|title=Broken}}",
  authors: [],
  sourceType: "unknown",
  quality: "fallback",
};

function enrichedResult(candidates) {
  return {
    references: candidates.map((candidate) => ({
      ...candidate,
      type: "webpage",
      title: "Antitussives and substance abuse",
      authors: ["Edward Boyer", "Jarrett Burns"],
      siteName: "Substance Abuse and Rehabilitation",
      publisher: "Informa UK Limited",
      year: 2013,
      doi: "10.2147/sar.s36761",
      sourceType: "primary_literature",
      quality: "high",
      metadataProvenance: [{
        provider: "crossref",
        status: "success",
        fields: ["title", "authors", "siteName", "year", "publisher"],
      }],
    })),
    diagnostics: candidates.map((candidate) => ({
      referenceId: candidate.id,
      providers: [{
        provider: "crossref",
        status: "success",
        fields: ["title", "authors", "siteName", "year", "publisher"],
      }],
      issues: [],
    })),
  };
}

describe("malformed reference metadata repair", () => {
  it("detects markup and citation use without reading reference metadata as article prose", () => {
    const article = {
      summary: "Supported claim.[cite:doi-10-2147-sar-s36761]",
      dosage: { routes: [{ reference_ids: ["route-reference"] }] },
      references: [
        malformedUsed,
        malformedUnused,
        { ...malformedUnused, id: "route-reference" },
      ],
    };

    expect(isMalformedReference(malformedUsed)).toBe(true);
    expect(collectUsedReferenceIds(article)).toEqual(new Set([
      "doi-10-2147-sar-s36761",
      "route-reference",
    ]));
  });

  it("repairs used malformed metadata and removes unused malformed rows", async () => {
    const enrich = vi.fn(async (candidates) => enrichedResult(candidates));
    const proposal = await buildMalformedReferenceRepairProposal([{
      slug: "dextromethorphan",
      summary: "Supported claim.[cite:doi-10-2147-sar-s36761]",
      references: [
        malformedUsed,
        malformedUnused,
        {
          id: "safe-reference",
          type: "webpage",
          title: "Safe reference",
          authors: [],
          sourceType: "unknown",
          quality: "fallback",
        },
      ],
    }], {
      enrich,
      sourceDeployment: "example/dosewiki",
      now: () => "2026-08-31T00:00:00.000Z",
    });

    expect(proposal.summary).toEqual({
      articleCount: 1,
      affectedArticleCount: 1,
      malformedReferenceCount: 2,
      repairedReferenceCount: 1,
      removedReferenceCount: 1,
    });
    expect(proposal.rows[0].proposedReferences).toHaveLength(2);
    expect(proposal.rows[0].proposedReferences[0]).toMatchObject({
      id: malformedUsed.id,
      title: "Antitussives and substance abuse",
      authors: ["Edward Boyer", "Jarrett Burns"],
      year: 2013,
      sourceType: "primary_literature",
      quality: "high",
    });
    expect(proposal.rows[0].proposedReferences[0].metadataProvenance).toContainEqual(
      expect.objectContaining({
        kind: "inspected",
        source: "repair-malformed-reference-metadata",
        fields: expect.arrayContaining(["title"]),
      }),
    );
    expect(proposal.rows[0].proposedReferences.some((reference) => isMalformedReference(reference))).toBe(false);
    expect(proposal.rows[0].removals).toEqual([expect.objectContaining({
      referenceId: malformedUnused.id,
      reason: "unused_malformed_reference",
    })]);
    expect(validateMalformedReferenceRepairProposal(proposal)).toBe(proposal);
  });

  it("accepts save-time metadata merging while verifying the requested repair", () => {
    const row = {
      repairs: [{
        referenceId: malformedUsed.id,
        proposedTitle: "Antitussives and substance abuse",
        identifiers: { doi: "10.2147/sar.s36761", pmid: "24648790" },
      }],
      removals: [{ referenceId: malformedUnused.id }],
    };
    const persisted = [{
      ...malformedUsed,
      title: "Antitussives and substance abuse",
      doi: "https://doi.org/10.2147/SAR.S36761",
      pmid: "PMID: 24648790",
      authors: ["Existing Author", "Fetched Author"],
      accessedAt: null,
    }];

    expect(isMalformedReferenceRepairRowApplied(persisted, row)).toBe(true);
    expect(isMalformedReferenceRepairRowApplied([
      ...persisted,
      malformedUnused,
    ], row)).toBe(false);
    expect(isMalformedReferenceRepairRowApplied([{
      ...persisted[0],
      title: "Different title",
    }], row)).toBe(false);
  });

  it("rejects provider disagreement for the same stable source", async () => {
    const enrich = vi.fn(async (candidates, options) => {
      const result = enrichedResult(candidates);
      if (options.identifierLane === "pmid") {
        result.references[0].title = "A different PubMed title";
      }
      return result;
    });

    await expect(buildMalformedReferenceRepairProposal([{
      slug: "dextromethorphan",
      summary: "Supported.[cite:doi-10-2147-sar-s36761]",
      references: [{ ...malformedUsed, pmid: "24648790" }],
    }], { enrich, sourceDeployment: "example/dosewiki" })).rejects.toThrow(
      /Crossref and PubMed titles disagree/,
    );
  });
});
