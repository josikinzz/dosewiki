import { describe, expect, it } from "vitest";
import {
  decodePublicApiCursor,
  encodePublicApiCursor,
  parsePublicApiLimit,
  projectPublicApiSubstanceDetail,
  projectPublicApiSubstancePreview,
} from "./v1";
import { fullArticleWithDosage } from "../../src/test/fixtures/articles";
import { parsePublicSubstanceRecord } from "../convex/publicData.substanceContract";

describe("public API v1 contract helpers", () => {
  it("round-trips opaque pagination cursors", () => {
    const cursor = encodePublicApiCursor(42);
    expect(cursor).not.toContain("42");
    expect(decodePublicApiCursor(cursor)).toBe(42);
    expect(decodePublicApiCursor("not-a-cursor")).toBeNull();
  });

  it("bounds page sizes", () => {
    expect(parsePublicApiLimit(null)).toBe(25);
    expect(parsePublicApiLimit("1")).toBe(1);
    expect(parsePublicApiLimit("100")).toBe(100);
    expect(parsePublicApiLimit("0")).toBeNull();
    expect(parsePublicApiLimit("101")).toBeNull();
    expect(parsePublicApiLimit("2.5")).toBeNull();
  });

  it("preserves the legacy pharmacology shape at the v1 detail boundary", () => {
    const article = parsePublicSubstanceRecord({
      ...fullArticleWithDosage,
      slug: "lsd",
    });
    expect(article).not.toBeNull();
    if (!article) throw new Error("Expected a valid public article fixture.");

    const detail = projectPublicApiSubstanceDetail(article);
    expect(detail.pharmacology).toMatchObject({
      receptor_profile: [
        { receptor: "5-HT2A", tag: "5-HT2A receptor agonist" },
      ],
    });
    expect(detail.pharmacology).not.toHaveProperty("binding_sites");
  });

  it("projects the stable substance preview shape", () => {
    expect(projectPublicApiSubstancePreview({
      slug: "mdma",
      title: "MDMA",
      summary: "Summary",
      priority: "high",
      indexCategories: ["entactogen"],
    })).toEqual({
      slug: "mdma",
      title: "MDMA",
      summary: "Summary",
      priority: "high",
      categories: ["entactogen"],
      url: "https://dose.wiki/mdma",
    });
  });
});
