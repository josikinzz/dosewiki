import { describe, expect, it } from "vitest";

import { createMoleculeAssetCatalog } from "./moleculeAssets";

describe("molecule asset catalog", () => {
  const catalog = createMoleculeAssetCatalog({
    mappings: [
      {
        filename: "Matched Molecule.svg",
        articleId: 10,
        articleTitle: "Mapped Title",
        matchedField: "title",
        matchedValue: "Mapped Title",
      },
      {
        filename: "Matched Molecule.svg",
        articleId: 10,
        articleTitle: "Mapped Title",
        matchedField: "title",
        matchedValue: "Mapped Title",
        deduplicatedFrom: ["Matched Molecule Copy.svg"],
      },
      {
        filename: "Fallback Molecule.svg",
        articleId: 11,
        articleTitle: "Fallback Name",
        matchedField: "title",
        matchedValue: "Fallback Name",
        resolution: "exact",
      },
      {
        filename: "Stale Id Molecule.svg",
        articleId: 11,
        articleTitle: "Former Article",
        matchedField: "title",
        matchedValue: "Former Article",
      },
      {
        filename: "Value Match.svg",
        articleId: 12,
        articleTitle: "Different Article Title",
        matchedField: "substitutive_name",
        matchedValue: "Substitutive Match",
      },
      {
        filename: "",
        articleId: 13,
        articleTitle: "Invalid Filename",
        matchedField: "title",
        matchedValue: "Invalid Filename",
      },
      {
        filename: "Invalid Id.svg",
        articleId: Number.NaN,
        articleTitle: "Invalid Id",
        matchedField: "title",
        matchedValue: "Invalid Id",
      },
    ],
  });

  it("resolves ordered route-ready assets by article id", () => {
    const result = catalog.resolveArticle({ id: 10, title: "Mapped Title" });

    expect(result).toMatchObject({
      status: "resolved-by-article-id",
      matchedBy: "article-id",
      matchedValue: "10",
    });
    expect(result.assets).toEqual([
      {
        filename: "Matched Molecule.svg",
        url: "/molecules/Matched%20Molecule.svg",
        matchedField: "title",
        matchedValue: "Mapped Title",
      },
    ]);
  });

  it("falls back to article title candidates when id is missing", () => {
    const result = catalog.resolveArticle({ title: "fallback name" });

    expect(result.status).toBe("resolved-by-title");
    expect(result.matchedValue).toBe("fallback name");
    expect(result.assets[0]).toMatchObject({
      filename: "Fallback Molecule.svg",
      resolution: "exact",
      url: "/molecules/Fallback%20Molecule.svg",
    });
  });

  it("ignores stale article id mappings that do not match the current title", () => {
    const result = catalog.resolveArticle({ id: 11, title: "Fallback Name" });

    expect(result).toMatchObject({
      status: "resolved-by-article-id",
      matchedBy: "article-id",
      matchedValue: "11",
    });
    expect(result.assets).toHaveLength(1);
    expect(result.assets[0]?.filename).toBe("Fallback Molecule.svg");
  });

  it("does not resolve article id matches without a current title candidate", () => {
    expect(catalog.resolveArticle({ id: 11 })).toEqual({
      assets: [],
      status: "missing",
    });
  });

  it("uses identification fields as title candidates", () => {
    const result = catalog.resolveArticle({
      identification: {
        substitutive_name: "Substitutive Match",
      },
    });

    expect(result.status).toBe("resolved-by-title");
    expect(result.assets[0]?.url).toBe("/molecules/Value%20Match.svg");
  });

  it("returns missing for invalid or absent mappings", () => {
    expect(catalog.resolveArticle({ id: 13, title: "Invalid Filename" })).toEqual({
      assets: [],
      status: "missing",
    });
    expect(catalog.resolveArticle({ id: 999, title: "Unknown" })).toEqual({
      assets: [],
      status: "missing",
    });
  });
});
