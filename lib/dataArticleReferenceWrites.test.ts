import { describe, expect, it } from "vitest";

import {
  appendArticleReference,
  normalizeIncomingReference,
  PORTAL_MINTED_REFERENCE_SUPPORT_STATUS,
} from "../server/lib/articleReferenceWrites";

function incomingReference(overrides: Record<string, unknown> = {}) {
  return {
    id: "doi-10-1000-example",
    type: "journal_article",
    title: "An example study",
    authors: ["Author One"],
    year: 2024,
    doi: "10.1000/example",
    url: "https://doi.org/10.1000/example",
    sourceType: "primary_literature",
    quality: "fallback",
    ...overrides,
  };
}

function articleDocument(references: unknown[] = []) {
  return { slug: "example", title: "Example", references };
}

describe("normalizeIncomingReference", () => {
  it("forces the portal-minted support status whatever the caller claimed", () => {
    const result = normalizeIncomingReference(
      incomingReference({ supportStatus: "inspected" }),
    );

    expect(result.ok).toBe(true);
    if (result.ok === false) return;
    expect(result.reference.supportStatus).toBe(PORTAL_MINTED_REFERENCE_SUPPORT_STATUS);
    expect(result.reference.metadataProvenance).toEqual([
      expect.objectContaining({ kind: "imported", source: "portal-reference-intake" }),
    ]);
  });
});

describe("appendArticleReference", () => {
  it("merges different-id PMID aliases while preserving pmid-19322953 as the marker id", () => {
    const stored = incomingReference({
      id: "pmid-19322953",
      title: "Canonical methylphenidate study",
      authors: ["Markowitz JS", "DeVane CL"],
      doi: null,
      pmid: "19322953",
      url: "https://pubmed.ncbi.nlm.nih.gov/19322953/",
    });

    const result = appendArticleReference(articleDocument([stored]), incomingReference({
      id: "doi-10-1055-s-0028-1109182",
      title: "Conflicting imported title",
      authors: ["markowitz js", "Ramamoorthy S", "Zhu HJ"],
      doi: "10.1055/s-0028-1109182",
      pmid: "19322953",
      url: null,
      metadataProvenance: [{
        kind: "fetched",
        source: "pubmed",
        fields: ["authors", "doi", "pmid"],
      }],
    }));

    expect(result.ok).toBe(true);
    if (result.ok === false) return;
    expect(result.created).toBe(false);
    expect(result.reference).toMatchObject({
      id: "pmid-19322953",
      title: "Canonical methylphenidate study",
      authors: ["Markowitz JS", "DeVane CL", "Ramamoorthy S", "Zhu HJ"],
      doi: "10.1055/s-0028-1109182",
      pmid: "19322953",
    });
    expect(result.reference.metadataProvenance).toEqual([
      expect.objectContaining({ kind: "imported", source: "portal-reference-intake" }),
    ]);
  });

  it("fails closed when an overlapping PMID carries a conflicting DOI", () => {
    const stored = incomingReference({
      id: "pmid-19322953",
      title: "Stored work",
      authors: ["Stored Author"],
      doi: "10.1000/stored",
      pmid: "19322953",
    });

    const result = appendArticleReference(articleDocument([stored]), incomingReference({
      id: "incoming-conflict",
      title: "Conflicting work",
      authors: ["Incoming Author"],
      doi: "10.1000/incoming",
      pmid: "19322953",
    }));

    expect(result).toEqual({
      ok: false,
      reason: "Reference identity conflicts with stored reference pmid-19322953.",
    });
  });
});
