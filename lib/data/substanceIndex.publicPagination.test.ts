import { afterEach, describe, expect, it, vi } from "vitest";
import { fullArticleWithDosage } from "../../src/test/fixtures/articles";
import { projectPublicArticle } from "../../src/data/projections/substanceReadProjections";
import { buildSubstanceRecord } from "../../src/data/builders/contentBuilder";
import { buildEffectData } from "../../src/data/builders/libraryBuilderTaxonomy";
import type { SubstanceEffectMembershipInput } from "../../src/data/projections/substanceReadProjections";
import { documentToRow } from "../postgres/documentCodec";
import { PostgresDatabaseReader } from "../postgres/runtime/db";
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
} from "../../server/substanceIndex";

vi.mock("server-only", () => ({}));

// Postgres registered functions keep the original handler on `_handler`; there is
// no in-repo Postgres runtime harness, so the handler is exercised directly.
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
    delete process.env.DATA_ADMIN_KEY;
  });

  it.each([
    ["getPublicLookupPage", getPublicLookupPage, "getPublicSubstanceLookupPage", {}],
    ["getPublicPreviewsPage", getPublicPreviewsPage, "getPublicSubstancePreviewsPage", {}],
    ["getPublicLibraryInputPage(effect-membership)", getPublicLibraryInputPage, "getPublicSubstanceEffectMembershipPage", { projection: "effect-membership" }],
  ])("%s bounds native reads and preserves continuation through the final page", async (_name, fn, method, args) => {
    const readPage = vi.fn(async (cursor: string | undefined, _limit: number) => ({
      rows: cursor === "next" ? [] : [structuredClone(fullArticleWithDosage)],
      cursor: cursor === "next" ? "" : "next",
      isDone: cursor === "next",
    }));
    const query = vi.fn(() => {
      throw new Error("compact public pages must not load full article documents");
    });
    const ctx = { db: { [method]: readPage, query } } as never;
    const first = await handlerOf(fn)(ctx, args) as {
      items: Record<string, unknown>[];
      cursor: string;
      isDone: boolean;
    };
    expect(first).toMatchObject({
      items: [{ slug: "lsd" }],
      cursor: "next",
      isDone: false,
    });
    expect(first.items[0]).not.toHaveProperty("editorial_review");
    const last = await handlerOf(fn)(ctx, { ...args, limit: 5000, cursor: first.cursor });
    expect(last).toEqual({ items: [], cursor: "", isDone: true });
    await handlerOf(fn)(ctx, { ...args, limit: 0 });
    expect(readPage.mock.calls).toEqual([
      [undefined, 32],
      ["next", 200],
      [undefined, 1],
    ]);
    expect(query).not.toHaveBeenCalled();
  });

  it("reads lossless effect membership without body columns and keeps tied-time page boundaries and visibility flags", async () => {
    const articles = Array.from({ length: 33 }, (_, index) => ({
      ...structuredClone(fullArticleWithDosage),
      _id: `substance-${String(index).padStart(2, "0")}`,
      _creationTime: 17,
      id: index,
      title: index === 32 ? "Last Substance" : `Substance ${index}`,
      slug: index === 0 ? "canonical-first" : undefined,
      priority: index === 0 ? "hide_for_now" as const : index === 32 ? "low" as const : null,
      index_categories: index === 0 ? ["Hidden", "Psychedelics"] : ["Psychedelics"],
      identification: {
        ...structuredClone(fullArticleWithDosage.identification),
        common_name: `Substance ${index}`,
      },
      subjective_effects: {
        ...structuredClone(fullArticleWithDosage.subjective_effects),
        cognitive: {
          future_group_not_in_schema: {
            note: "Retain unknown nested groups.",
            effects: [{ name: "Euphoria", description: "" }, { name: "Stimulation and sedation", description: "" }],
          },
        },
        physical: {
          other_future_group: { note: "", effects: [{ name: "Euphoria", description: "" }] },
        },
      },
      summary: "ARTICLE BODY MUST NOT BE TRANSPORTED",
    }));
    const stored = articles.map((article) => documentToRow("substanceIndex", article).row);
    const selectedFields: string[][] = [];
    const sqlQuery = vi.fn(async (sql: string, params: unknown[] = []) => {
      const select = sql.slice("SELECT ".length, sql.indexOf(' FROM "substanceIndex"'));
      const fields = select.split(", ").map((column) => /^"([^"]+)"/.exec(column)![1]);
      selectedFields.push(fields);
      const start = params.length === 3 ? stored.findIndex((row) => row._id === params[1]) + 1 : 0;
      const rows = stored.slice(start, start + Number(params[params.length - 1])).map((row) =>
        Object.fromEntries(fields.map((field) => [field, row[field]])));
      return { rows, rowCount: rows.length };
    });
    const db = new PostgresDatabaseReader({ query: sqlQuery, statements: 0 }, new Map());
    const ctx = { db } as never;
    type Page = { items: SubstanceEffectMembershipInput[]; cursor: string; isDone: boolean };
    const first = await handlerOf(getPublicLibraryInputPage)(ctx, { projection: "effect-membership" }) as Page;
    const last = await handlerOf(getPublicLibraryInputPage)(ctx, {
      projection: "effect-membership", cursor: first.cursor,
    }) as Page;

    expect(first.items.map((item) => item.id)).toEqual(Array.from({ length: 32 }, (_, index) => index));
    expect(last.items.map((item) => item.id)).toEqual([32]);
    expect(first.isDone).toBe(false);
    expect(last.isDone).toBe(true);
    expect(first.items[0]).toMatchObject({ slug: "canonical-first", priority: "low", index_categories: ["Hidden", "Psychedelics"] });
    expect(first.items[1].priority).toBe("normal");
    expect(last.items[0]).toMatchObject({ slug: "last-substance", priority: "low" });
    expect(first.items[0].identification.botanical_name).toBeNull();
    const records = [...first.items, ...last.items].map((item) => buildSubstanceRecord({ ...fullArticleWithDosage, ...item })!);
    expect(records[0].isHidden).toBe(true);
    expect(records[32].isDirectUrlOnly).toBe(true);
    const { effectMap } = buildEffectData(records);
    expect(effectMap.get("cognitive-euphoria")?.records.size).toBe(33);
    expect(effectMap.get("physical-euphoria")?.records.size).toBe(33);
    expect(effectMap.has("stimulation-and-sedation")).toBe(false);
    const fields = ["_id", "_creationTime", "id", "title", "slug", "priority",
      "index_categories", "identification", "classification", "subjective_effects"];
    expect(selectedFields).toEqual([fields, fields]);
    expect(sqlQuery.mock.calls.map(([, params]) => params)).toEqual([[33], [17, "substance-31", 33]]);
    expect(sqlQuery.mock.calls[1][0]).toContain('WHERE ("_creationTime", "_id" COLLATE "C") > ($1, $2::text COLLATE "C")');
    expect(sqlQuery.mock.calls[1][0]).toContain('ORDER BY "_creationTime" ASC, "_id" COLLATE "C" ASC');
  });

  it("continues an empty generic pagination cursor without dropping the initial native range", async () => {
    const sqlQuery = vi.fn(async (_sql: string, _params?: unknown[]) => ({ rows: [], rowCount: 0 }));
    const db = new PostgresDatabaseReader({ query: sqlQuery, statements: 0 }, new Map());
    await expect(db.getPublicSubstanceEffectMembershipPage(undefined, 32))
      .resolves.toEqual({ rows: [], cursor: "{}", isDone: true });
    await expect(db.getPublicSubstanceEffectMembershipPage("{}", 32))
      .resolves.toEqual({ rows: [], cursor: "{}", isDone: true });
    expect(sqlQuery.mock.calls.map(([, params]) => params)).toEqual([[33], [33]]);
  });

  it("propagates native effect membership query failures without full-document fallback", async () => {
    const sqlQuery = vi.fn().mockRejectedValue(new Error("native read failed"));
    const db = new PostgresDatabaseReader({ query: sqlQuery, statements: 0 }, new Map());
    const genericQuery = vi.spyOn(db, "query");
    await expect(handlerOf(getPublicLibraryInputPage)({ db } as never, {
      projection: "effect-membership",
    })).rejects.toThrow("native read failed");
    expect(genericQuery).not.toHaveBeenCalled();
    expect(sqlQuery).toHaveBeenCalledTimes(1);
  });

  it("getPublicLibraryInputPage paginates with bounded defaults and never collects", async () => {
    const { ctx, paginate, collect } = createPaginateCtx();
    await handlerOf(getPublicLibraryInputPage)(ctx, {});
    await handlerOf(getPublicLibraryInputPage)(ctx, { limit: 5000, cursor: "c" });
    await handlerOf(getPublicLibraryInputPage)(ctx, { limit: 0 });
    expect(paginate.mock.calls.map(([opts]) => [opts.cursor, opts.numItems])).toEqual([
      [null, 32],
      ["c", 200],
      [null, 1],
    ]);
    expect(collect).not.toHaveBeenCalled();
  });

  it("getPublicCoverageInputPage uses the native compact coverage projection and preserves its cursor", async () => {
    const getPublicSubstanceCoveragePage = vi.fn().mockResolvedValue({
      rows: [structuredClone(fullArticleWithDosage)],
      cursor: "coverage-next",
      isDone: false,
    });
    const query = vi.fn(() => {
      throw new Error("coverage must not load full article documents");
    });
    const result = await handlerOf(getPublicCoverageInputPage)(
      { db: { getPublicSubstanceCoveragePage, query } } as never,
      { cursor: "coverage-cursor", limit: 5000 },
    ) as { items: Record<string, unknown>[]; cursor: string; isDone: boolean };

    expect(getPublicSubstanceCoveragePage).toHaveBeenCalledWith("coverage-cursor", 200);
    expect(result).toMatchObject({
      cursor: "coverage-next",
      isDone: false,
      items: [{ slug: "lsd" }],
    });
    expect(query).not.toHaveBeenCalled();
  });

  it("getPublicMechanismRouteInputPage returns the complete native mechanism projection in one call", async () => {
    const getPublicSubstanceMechanismRows = vi.fn().mockResolvedValue([
      structuredClone(fullArticleWithDosage),
    ]);
    const query = vi.fn(() => {
      throw new Error("mechanisms must not load full article documents");
    });
    const result = await handlerOf(getPublicMechanismRouteInputPage)(
      { db: { getPublicSubstanceMechanismRows, query } } as never,
      { cursor: "ignored", limit: 1 },
    ) as { items: Record<string, unknown>[]; cursor: string; isDone: boolean };

    expect(getPublicSubstanceMechanismRows).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      cursor: "",
      isDone: true,
      items: [{
        displayName: "LSD",
        priority: "normal",
        indexCategories: ["Psychedelics", "Research Chemicals"],
        mechanisms: expect.any(Array),
      }],
    });
    expect(query).not.toHaveBeenCalled();
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
    process.env.DATA_ADMIN_KEY = "secret";
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
    ["rejectWholeCorpusProjection", rejectWholeCorpusProjection],
    ["rejectRetiredRandomSample", rejectRetiredRandomSample],
  ])("returns the bounded-pagination error contract at runtime from %s", (_name, guard) => {
    expect.assertions(1);
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
