import { describe, expect, it } from "vitest";
import { isDuplicateCitation, isStandardSource, normalizeCitationUrl } from "./citationRolePolicy.mjs";

describe("citation migration role policy", () => {
  it("classifies standard source domains consistently for local and Postgres migrations", () => {
    expect(isStandardSource("https://psychonautwiki.org/wiki/Ketamine")).toBe(true);
    expect(isStandardSource("https://erowid.org/chemicals/ketamine/")).toBe(true);
    expect(isStandardSource("https://go.drugbank.com/drugs/DB01221")).toBe(true);
    expect(isStandardSource("https://example.com/article")).toBe(false);
  });

  it("normalizes duplicate citation URLs for migration dedupe", () => {
    expect(normalizeCitationUrl("HTTPS://Example.com/path///")).toBe("https://example.com/path");
    expect(isDuplicateCitation(
      { url: "https://example.com/path/" },
      [{ url: "https://example.com/path" }],
    )).toBe(true);
  });
});
