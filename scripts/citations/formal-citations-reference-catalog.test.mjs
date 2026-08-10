import { describe, expect, it } from "vitest";

import { canonicalizeArticleReferences } from "./formal-citations-reference-catalog.mjs";

describe("formal citation reference catalog", () => {
  it("merges identity-equivalent aliases without changing the stored marker id", () => {
    const result = canonicalizeArticleReferences([
      {
        id: "pmid-19322953",
        type: "journal_article",
        title: "Canonical methylphenidate study",
        authors: ["Markowitz JS", "DeVane CL"],
        pmid: "19322953",
        sourceType: "primary_literature",
        quality: "high",
      },
      {
        id: "doi-10-1055-s-0028-1109182",
        type: "journal_article",
        title: "Conflicting cached title",
        authors: ["markowitz js", "Ramamoorthy S", "Zhu HJ"],
        pmid: "19322953",
        doi: "10.1055/s-0028-1109182",
        containerTitle: "Die Pharmazie",
        sourceType: "primary_literature",
        quality: "fallback",
      },
    ]);

    expect(result.references).toHaveLength(1);
    expect(result.references[0]).toMatchObject({
      id: "pmid-19322953",
      title: "Canonical methylphenidate study",
      authors: ["Markowitz JS", "DeVane CL", "Ramamoorthy S", "Zhu HJ"],
      doi: "10.1055/s-0028-1109182",
      containerTitle: "Die Pharmazie",
    });
    expect(result.remap.get("doi-10-1055-s-0028-1109182")).toBe("pmid-19322953");
  });

  it("keeps overlapping PMID aliases separate when their DOI values conflict", () => {
    const result = canonicalizeArticleReferences([{
      id: "stored-reference",
      type: "journal_article",
      title: "Stored work",
      authors: ["Stored Author"],
      doi: "10.1000/stored",
      pmid: "19322953",
      sourceType: "primary_literature",
      quality: "high",
    }, {
      id: "incoming-reference",
      type: "journal_article",
      title: "Incoming work",
      authors: ["Incoming Author"],
      doi: "10.1000/incoming",
      pmid: "19322953",
      sourceType: "primary_literature",
      quality: "high",
    }]);

    expect(result.references).toHaveLength(2);
    expect(result.remap.get("stored-reference")).toBe("stored-reference");
    expect(result.remap.get("incoming-reference")).toBe("incoming-reference");
  });
});
