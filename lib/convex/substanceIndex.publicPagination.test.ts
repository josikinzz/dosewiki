import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fullArticleWithDosage } from "../../src/test/fixtures/articles";
import { projectPublicArticle } from "../../convex/lib/substanceReadProjections";
import { rejectWholeCorpusProjection } from "../../convex/substanceIndex";

const source = readFileSync(
  `${process.cwd()}/convex/substanceIndex.ts`,
  "utf8",
);

const publicPageFunctions = [
  "getPublicLookupPage",
  "getPublicPreviewsPage",
  "getPublicLibraryInputPage",
  "getPublicCoverageInputPage",
  "getPublicMechanismRouteInputPage",
] as const;

const retiredWholeCorpusProjectionQueries = [
  "getLookup",
  "getPublicLookup",
  "getPublicPreviews",
  "getLibraryInput",
  "getPublicLibraryInput",
  "getPublicCoverageInput",
  "getSearchInput",
  "getPublicMechanismRouteInput",
] as const;

function exportedQueryBlock(name: string): string {
  const start = source.indexOf(`export const ${name} = query({`);
  expect(start).toBeGreaterThanOrEqual(0);
  const nextExport = source.indexOf("\nexport const ", start + 1);
  return source.slice(start, nextExport === -1 ? source.length : nextExport);
}

describe("public substance corpus pagination", () => {
  it("uses bounded paginate reads rather than collect for every additive page endpoint", () => {
    // Callers that ask for nothing still get the conservative default; only an
    // explicit request may climb to the ceiling, and it is still bounded.
    expect(source).toContain("const PUBLIC_CORPUS_PAGE_SIZE = 32;");
    expect(source).toContain("const PUBLIC_CORPUS_MAX_PAGE_SIZE = 200;");
    expect(source).toContain("Math.floor(requested ?? PUBLIC_CORPUS_PAGE_SIZE)");
    expect(source).toContain(
      "Math.min(Math.max(normalized, 1), PUBLIC_CORPUS_MAX_PAGE_SIZE)",
    );

    for (const name of publicPageFunctions) {
      const block = exportedQueryBlock(name);
      expect(block).toContain('.query("substanceIndex").paginate({');
      expect(block).toContain("clampPublicCorpusPageSize(args.limit)");
      expect(block).not.toContain(".collect()");
    }

    const editorBlock = exportedQueryBlock("getTagRegistryPage");
    expect(editorBlock).toContain("paginationOptsValidator");
    expect(editorBlock).toContain('.query("substanceIndex").paginate({');
    expect(editorBlock).toContain(
      "clampPublicCorpusPageSize(args.paginationOpts.numItems)",
    );
    expect(editorBlock).not.toContain(".collect()");

    const lookupBlock = exportedQueryBlock("getLookupPage");
    expect(lookupBlock).toContain("paginationOptsValidator");
    expect(lookupBlock).toContain('.query("substanceIndex").paginate({');
    expect(lookupBlock).toContain(
      "clampPublicCorpusPageSize(args.paginationOpts.numItems)",
    );
    expect(lookupBlock).toContain("result.page.map(projectEditorLookup)");
    expect(lookupBlock).not.toContain("projectPublicArticle");
    expect(lookupBlock).not.toContain(".collect()");

    // The slug page walks the by_slug index under a byte budget instead of
    // collecting the corpus or paging by a fixed 32-article window.
    const slugBlock = exportedQueryBlock("getPublicSlugsPage");
    expect(slugBlock).toContain('.withIndex("by_slug", (q) => q.gt("slug", cursor))');
    expect(slugBlock).toContain("PUBLIC_SLUG_PAGE_BYTE_BUDGET");
    expect(slugBlock).toContain("resolveSubstanceSlug(article)");
    expect(slugBlock).not.toContain(".collect()");
    expect(source).toContain("const PUBLIC_SLUG_PAGE_BYTE_BUDGET = 4 * 1024 * 1024;");

    const searchBlock = exportedQueryBlock("getSearchInputPage");
    expect(searchBlock).toContain("paginationOptsValidator");
    expect(searchBlock).toContain('.query("substanceIndex").paginate({');
    expect(searchBlock).toContain(
      "clampPublicCorpusPageSize(args.paginationOpts.numItems)",
    );
    expect(searchBlock).not.toContain(".collect()");
  });

  it("rejects every legacy whole-corpus projection before any database access", () => {
    for (const name of retiredWholeCorpusProjectionQueries) {
      const block = exportedQueryBlock(name);
      expect(block).toContain("rejectWholeCorpusProjection()");
      expect(block).not.toContain("ctx");
      expect(block).not.toContain(".db");
      expect(block).not.toContain(".query(");
      expect(block).not.toContain(".collect()");
      expect(block).not.toContain(".paginate(");
    }
  });

  it("returns the bounded-pagination error contract at runtime", () => {
    expect(() => rejectWholeCorpusProjection()).toThrow(
      "Whole-corpus substance operations are retired",
    );
    try {
      rejectWholeCorpusProjection();
    } catch (error) {
      expect(error).toMatchObject({
        data: { code: "BOUNDED_PAGINATION_REQUIRED" },
      });
    }
  });

  it("omits reference metadata provenance from the public full-article projection", () => {
    const projected = projectPublicArticle({
      ...structuredClone(fullArticleWithDosage),
      references: [{
        ...structuredClone(fullArticleWithDosage.references[0]),
        metadataProvenance: [{
          kind: "fetched",
          source: "crossref",
          fields: ["authors"],
        }],
      }],
    });

    expect(projected.references).toHaveLength(1);
    expect(projected.references[0]).not.toHaveProperty("metadataProvenance");
  });
});
