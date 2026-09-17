import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// /docs/how publishes the prompts the pipeline actually runs. It reads them from
// their source-of-truth files at build time rather than holding copies, so the
// published page cannot drift from the pipeline. These tests guard that property:
// they fail if a prompt is added without being published, if a source file moves,
// or if someone pastes prompt bodies back into the page.

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..", "..");
const PAGE = readFileSync(path.join(REPO_ROOT, "src/app/docs/how/page.tsx"), "utf8");

const EXTRACTION_DIR = "content/prompts/extraction";
const SECTION_DIR = "content/prompts/sections";

/** Slugs the page lists, taken from the literal arrays it builds its <details> from. */
function slugsFrom(arrayName: string): string[] {
  const start = PAGE.indexOf(`const ${arrayName} = [`);
  expect(start, `${arrayName} array missing from page.tsx`).toBeGreaterThan(-1);
  const end = PAGE.indexOf(".map(withSize)", start);
  expect(end, `${arrayName} is no longer built by mapping over a literal`).toBeGreaterThan(start);
  return [...PAGE.slice(start, end).matchAll(/slug:\s*"([^"]+)"/g)].map((m) => m[1]);
}

describe("/docs/how publishes every prompt the pipeline runs", () => {
  it("lists every extraction prompt on disk", () => {
    const onDisk = readdirSync(path.join(REPO_ROOT, EXTRACTION_DIR))
      .filter((f) => f.endsWith("-extraction.md"))
      .map((f) => f.replace("-extraction.md", ""))
      .sort();

    expect(onDisk.length).toBeGreaterThan(0);
    expect(slugsFrom("EXTRACTION_PROMPTS").sort()).toEqual(onDisk);
  });

  it("resolves every section prompt slug to a seed file", () => {
    const slugs = slugsFrom("SECTION_PROMPTS");
    expect(slugs.length).toBeGreaterThan(0);
    for (const slug of slugs) {
      expect(
        existsSync(path.join(REPO_ROOT, SECTION_DIR, `${slug}.md`)),
        `${SECTION_DIR}/${slug}.md is referenced by the page but does not exist`,
      ).toBe(true);
    }
  });

  it("holds no inlined copy of a prompt body", () => {
    // Every published prompt opens with a markdown H1. Finding one inside the page
    // means a prompt was pasted back in instead of being read from disk.
    expect(PAGE).not.toMatch(/`# [A-Z][^\n]*(Extraction|Section Generation)/);
  });
});
