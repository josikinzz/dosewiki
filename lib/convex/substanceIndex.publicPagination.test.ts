import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fullArticleWithDosage } from "../../src/test/fixtures/articles";
import { projectPublicArticle } from "../../convex/lib/substanceReadProjections";

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

function exportedQueryBlock(name: string): string {
  const start = source.indexOf(`export const ${name} = query({`);
  expect(start).toBeGreaterThanOrEqual(0);
  const nextExport = source.indexOf("\nexport const ", start + 1);
  return source.slice(start, nextExport === -1 ? source.length : nextExport);
}

describe("public substance corpus pagination", () => {
  it("uses bounded paginate reads rather than collect for every additive page endpoint", () => {
    expect(source).toContain("const PUBLIC_CORPUS_PAGE_SIZE = 32;");
    expect(source).toContain(
      "Math.min(Math.max(normalized, 1), PUBLIC_CORPUS_PAGE_SIZE)",
    );

    for (const name of publicPageFunctions) {
      const block = exportedQueryBlock(name);
      expect(block).toContain('.query("substanceIndex").paginate({');
      expect(block).toContain("clampPublicCorpusPageSize(args.limit)");
      expect(block).not.toContain(".collect()");
    }

    const editorBlock = exportedQueryBlock("getEditorPage");
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

    const searchBlock = exportedQueryBlock("getSearchInputPage");
    expect(searchBlock).toContain("paginationOptsValidator");
    expect(searchBlock).toContain('.query("substanceIndex").paginate({');
    expect(searchBlock).toContain(
      "clampPublicCorpusPageSize(args.paginationOpts.numItems)",
    );
    expect(searchBlock).not.toContain(".collect()");
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
