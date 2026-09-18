import { describe, expect, it } from "vitest";

import {
  articleHasStructuredCitationContract,
  findStructuredCitationArticles,
  formatStructuredCitationCompatibilityError,
} from "./source-citations-compat.mjs";

describe("source citations compatibility guard", () => {
  it("detects structured references-era data", () => {
    expect(articleHasStructuredCitationContract({
      references: [{ id: "pmid-12345" }],
    })).toBe(true);

    expect(articleHasStructuredCitationContract({
      dosage: {
        routes: [{ route: "Oral", reference_ids: ["pmid-12345"] }],
      },
    })).toBe(true);

    expect(articleHasStructuredCitationContract({
      duration: {
        routes: [{ route: "Oral", reference_ids: ["pmid-12345"] }],
      },
    })).toBe(true);

    expect(articleHasStructuredCitationContract({
      source_citations: [{ name: "Erowid", url: "https://example.test" }],
      citations: [],
    })).toBe(false);
  });

  it("reports incompatible articles by slug or title", () => {
    const articles = [
      { slug: "alpha", references: [{ id: "ref-1" }] },
      { title: "Beta", dosage: { routes: [{ reference_ids: ["ref-2"] }] } },
      { slug: "gamma", citations: [] },
    ];

    expect(findStructuredCitationArticles(articles)).toMatchObject([
      { slug: "alpha" },
      { title: "Beta" },
    ]);
    expect(formatStructuredCitationCompatibilityError(articles)).toContain("alpha, Beta");
  });
});
