import { afterEach, describe, expect, it, vi } from "vitest";
import { fullArticleWithDosage } from "../../src/test/fixtures/articles";
import { projectPublicArticle } from "../../convex/lib/substanceReadProjections";
import {
  getLibraryInput,
  getLookup,
  getLookupPage,
  getPublicCoverageInput,
  getPublicCoverageInputPage,
  getPublicLibraryInput,
  getPublicLibraryInputPage,
  getPublicLookup,
  getPublicLookupPage,
  getPublicMechanismRouteInput,
  getPublicMechanismRouteInputPage,
  getPublicPreviews,
  getPublicPreviewsPage,
  getSearchInput,
  getSearchInputPage,
  getTagRegistryPage,
  rejectRetiredRandomSample,
  rejectWholeCorpusProjection,
} from "../../convex/substanceIndex";

// Convex registered functions keep the original handler on `_handler`; there is
// no in-repo Convex runtime harness, so the handler is exercised directly.
const handlerOf = (fn: unknown) =>
  (fn as { _handler: (ctx: never, args: unknown) => Promise<unknown> })._handler;

/**
 * Fake db: the `substanceIndex` table pages one fixture article and refuses to
 * collect; every other table is the membership lookup `requireRole` performs,
 * which resolves the single delegated editor.
 */
function createPaginateCtx() {
  const paginate = vi.fn(async (opts: { cursor: string | null; numItems: number }) => ({
    page: [structuredClone(fullArticleWithDosage)],
    continueCursor: "next",
    isDone: false,
    numItems: opts.numItems,
  }));
  const collect = vi.fn(async () => {
    throw new Error("whole-corpus collect is forbidden on public pages");
  });
  const chain = { paginate, collect, withIndex: () => chain, order: () => chain };
  const membership = {
    withIndex: (
      _indexName: string,
      selector: (query: { eq: (field: string, value: string) => unknown }) => unknown,
    ) => {
      let email = "";
      selector({
        eq: (_field, value) => {
          email = value;
          return {};
        },
      });
      return {
        unique: vi.fn(async () => (email === "editor@example.com" ? { email, role: "editor" } : null)),
      };
    },
  };
  const query = vi.fn((table: string) => (table === "substanceIndex" ? chain : membership));
  return {
    ctx: { db: { query }, auth: { getUserIdentity: vi.fn(async () => null) } } as never,
    paginate,
    collect,
    query,
  };
}

describe("public substance corpus pagination", () => {
  afterEach(() => {
    delete process.env.CONVEX_ADMIN_KEY;
  });

  it.each([
    ["getPublicLookupPage", getPublicLookupPage],
    ["getPublicPreviewsPage", getPublicPreviewsPage],
    ["getPublicLibraryInputPage", getPublicLibraryInputPage],
    ["getPublicCoverageInputPage", getPublicCoverageInputPage],
    ["getPublicMechanismRouteInputPage", getPublicMechanismRouteInputPage],
  ])("%s paginates with the default 32, clamps an explicit limit to [1, 200], and never collects", async (_name, fn) => {
    const { ctx, paginate, collect } = createPaginateCtx();
    await handlerOf(fn)(ctx, {});
    await handlerOf(fn)(ctx, { limit: 5000, cursor: "c" });
    await handlerOf(fn)(ctx, { limit: 0 });
    expect(paginate.mock.calls.map(([opts]) => [opts.cursor, opts.numItems])).toEqual([
      [null, 32],
      ["c", 200],
      [null, 1],
    ]);
    expect(collect).not.toHaveBeenCalled();
  });

  it.each([
    ["getLookupPage", getLookupPage],
    ["getSearchInputPage", getSearchInputPage],
  ])("%s clamps paginationOpts.numItems to 200 and never collects", async (_name, fn) => {
    const { ctx, paginate, collect } = createPaginateCtx();
    await handlerOf(fn)(ctx, { paginationOpts: { cursor: null, numItems: 5000 } });
    expect(paginate.mock.calls[0][0].numItems).toBe(200);
    expect(collect).not.toHaveBeenCalled();
  });

  it("getTagRegistryPage clamps paginationOpts.numItems to 200 for a delegated editor and never collects", async () => {
    process.env.CONVEX_ADMIN_KEY = "secret";
    const { ctx, paginate, collect } = createPaginateCtx();
    await handlerOf(getTagRegistryPage)(ctx, {
      apiKey: "secret",
      actorEmail: "editor@example.com",
      paginationOpts: { cursor: null, numItems: 5000 },
    });
    expect(paginate.mock.calls[0][0].numItems).toBe(200);
    expect(collect).not.toHaveBeenCalled();
  });

  it("getLookupPage projects the editor lookup shape, not the public article", async () => {
    const { ctx } = createPaginateCtx();
    const result = (await handlerOf(getLookupPage)(ctx, {
      paginationOpts: { cursor: null, numItems: 1 },
    })) as { page: Record<string, unknown>[] };
    expect(result.page[0]).not.toHaveProperty("summary");
    expect(result.page[0]).toMatchObject({ slug: expect.any(String), name: expect.any(String) });
  });

  it.each([
    ["getLookup", getLookup],
    ["getPublicLookup", getPublicLookup],
    ["getPublicPreviews", getPublicPreviews],
    ["getLibraryInput", getLibraryInput],
    ["getPublicLibraryInput", getPublicLibraryInput],
    ["getPublicCoverageInput", getPublicCoverageInput],
    ["getSearchInput", getSearchInput],
    ["getPublicMechanismRouteInput", getPublicMechanismRouteInput],
  ])("%s rejects with BOUNDED_PAGINATION_REQUIRED before touching the database", async (_name, fn) => {
    const { ctx, query } = createPaginateCtx();
    await expect(handlerOf(fn)(ctx, {})).rejects.toMatchObject({
      data: { code: "BOUNDED_PAGINATION_REQUIRED" },
    });
    expect(query).not.toHaveBeenCalled();
  });

  it.each([
    ["rejectWholeCorpusProjection", rejectWholeCorpusProjection, "Whole-corpus substance operations are retired"],
    ["rejectRetiredRandomSample", rejectRetiredRandomSample, "The random-sample query is retired"],
  ])("returns the bounded-pagination error contract at runtime from %s", (_name, guard, message) => {
    expect(() => guard()).toThrow(message);
    try {
      guard();
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
