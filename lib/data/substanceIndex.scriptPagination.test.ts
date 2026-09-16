import { describe, expect, it, vi } from "vitest";
import {
  clampScriptCorpusPageSize,
  getFullDocumentPage,
  getReferenceMetadataPage,
} from "../../server/substanceIndex";
import { fullArticleWithDosage } from "../../src/test/fixtures/articles";

// Postgres registered functions keep the original handler on `_handler`; there is
// no in-repo Postgres runtime harness, so the handler is exercised directly.
const handlerOf = (fn: unknown) =>
  (fn as { _handler: (ctx: never, args: unknown) => Promise<unknown> })._handler;

function createCtx(page: unknown[]) {
  const paginate = vi.fn(async (opts: { numItems: number }) => ({
    page,
    continueCursor: null,
    isDone: true,
    numItems: opts.numItems,
  }));
  const collect = vi.fn(async () => {
    throw new Error("script pages must not collect");
  });
  return { ctx: { db: { query: () => ({ paginate, collect }) } } as never, paginate, collect };
}

describe("trusted script substance pagination", () => {
  it("clamps every requested page size into [1, 32]", () => {
    expect(clampScriptCorpusPageSize(0)).toBe(1);
    expect(clampScriptCorpusPageSize(32)).toBe(32);
    expect(clampScriptCorpusPageSize(33)).toBe(32);
    expect(clampScriptCorpusPageSize(Number.NaN)).toBe(32);
  });

  it.each([
    ["getFullDocumentPage", getFullDocumentPage],
    ["getReferenceMetadataPage", getReferenceMetadataPage],
  ])("%s paginates at most 32 rows and never collects", async (_name, fn) => {
    const { ctx, paginate, collect } = createCtx([]);
    await handlerOf(fn)(ctx, { paginationOpts: { cursor: null, numItems: 5000 } });
    expect(paginate.mock.calls[0][0].numItems).toBe(32);
    expect(collect).not.toHaveBeenCalled();
  });

  it("getReferenceMetadataPage returns identity and provenance fields and no article prose", async () => {
    const article = {
      ...structuredClone(fullArticleWithDosage),
      references: [{
        ...structuredClone(fullArticleWithDosage.references[0]),
        id: "ref-1",
        doi: "10.1/x",
        metadataProvenance: [{ kind: "fetched", source: "crossref", fields: ["authors"] }],
      }],
    };
    const { ctx } = createCtx([article]);
    const result = (await handlerOf(getReferenceMetadataPage)(ctx, {
      paginationOpts: { cursor: null, numItems: 1 },
    })) as { page: Record<string, unknown>[] };
    const row = result.page[0];

    expect(Object.keys(row).sort()).toEqual(["references", "slug", "title"]);
    const references = row.references as Record<string, unknown>[];
    expect(references[0]).toMatchObject({
      id: "ref-1",
      doi: "10.1/x",
      metadataProvenance: expect.any(Array),
    });
    for (const prose of ["summary", "pharmacology", "harm_potential", "history_culture", "legality"]) {
      expect(row).not.toHaveProperty(prose);
    }
  });
});
