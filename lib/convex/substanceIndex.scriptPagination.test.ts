import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(`${process.cwd()}/convex/substanceIndex.ts`, "utf8");

function exportedQueryBlock(name: string): string {
  const start = source.indexOf(`export const ${name} = query({`);
  expect(start).toBeGreaterThanOrEqual(0);
  const nextExport = source.indexOf("\nexport const ", start + 1);
  return source.slice(start, nextExport === -1 ? source.length : nextExport);
}

describe("trusted script substance pagination", () => {
  it("clamps full-document and reference-metadata pages to 32", () => {
    expect(source).toContain("const SCRIPT_CORPUS_PAGE_SIZE = 32;");
    expect(source).toContain("Math.min(Math.max(normalized, 1), SCRIPT_CORPUS_PAGE_SIZE)");
    for (const name of ["getFullDocumentPage", "getReferenceMetadataPage"]) {
      const block = exportedQueryBlock(name);
      expect(block).toContain('.query("substanceIndex").paginate({');
      expect(block).toContain("clampScriptCorpusPageSize(args.paginationOpts.numItems)");
      expect(block).not.toContain(".collect()");
    }
  });

  it("keeps the reference planning projection bounded to identity and provenance fields", () => {
    const blockStart = source.indexOf("function pickDefinedReferenceMetadata");
    const blockEnd = source.indexOf("export const getReferenceMetadataPage", blockStart);
    const block = source.slice(blockStart, blockEnd);
    for (const field of ["slug", "title", "references"]) {
      expect(block).toContain(`${field}:`);
    }
    for (const field of ["id", "doi", "pmid", "isbn", "url", "authors", "metadataProvenance"]) {
      expect(block).toContain(`"${field}"`);
    }
    for (const proseField of ["summary", "pharmacology", "harm_potential", "history_culture", "legality"]) {
      expect(block).not.toContain(`${proseField}:`);
    }
  });
});
