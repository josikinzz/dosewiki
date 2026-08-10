import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  `${process.cwd()}/convex/substanceIndex.ts`,
  "utf8",
);

function exportedQueryBlock(name: string): string {
  const start = source.indexOf(`export const ${name} = query({`);
  expect(start, `${name} should be exported`).toBeGreaterThanOrEqual(0);
  const nextExport = source.indexOf("\nexport const ", start + 1);
  return source.slice(start, nextExport === -1 ? source.length : nextExport);
}

describe("substanceIndex slug lookups", () => {
  it("fails getBySlug closed for missing or duplicate slug matches", () => {
    const block = exportedQueryBlock("getBySlug");

    expect(block).toContain('.withIndex("by_slug"');
    expect(block).toContain(".take(2)");
    expect(block).toContain("matches.length === 1 ? matches[0] : null");
    expect(block).not.toContain(".first()");
  });

  it("fails getPublicBySlug closed before projecting missing or duplicate matches", () => {
    const block = exportedQueryBlock("getPublicBySlug");

    expect(block).toContain('.withIndex("by_slug"');
    expect(block).toContain(".take(2)");
    expect(block).toContain(
      "matches.length === 1 ? projectPublicArticle(matches[0]) : null",
    );
    expect(block).not.toContain(".first()");
  });
});
