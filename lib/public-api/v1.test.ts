import { describe, expect, it } from "vitest";
import {
  decodePublicApiCursor,
  encodePublicApiCursor,
  parsePublicApiLimit,
  projectPublicApiSubstancePreview,
} from "./v1";

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
