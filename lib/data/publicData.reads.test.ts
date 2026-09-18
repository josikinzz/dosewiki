import { describe, expect, it, vi } from "vitest";
import { PostgresError } from "@server/postgres/runtime/values";
import { fullArticleWithDosage } from "../../src/test/fixtures/articles";
import {
  createDataPublicDataReadAdapter,
  projectPublicEffectPreviews,
  projectPublicSubstanceLibraryRecord,
  projectPublicSubstancePreviews,
  projectPublicSubstanceRecord,
} from "./publicData.reads";
import { publicDataReadCatalog } from "./publicData.readCatalog";
import type { SubstanceRecord } from "./publicData.shared";

vi.mock("server-only", () => ({}));

describe("public data read adapter", () => {

  it("owns public effect preview projection and ordering", () => {
    expect(
      projectPublicEffectPreviews([
        {
          name: "Zeta",
          slug: "zeta",
          summary: "Long ".repeat(80),
          tags: ["visual"],
        },
        {
          name: "Alpha",
          slug: "alpha",
          summary: "Short summary",
          featured: true,
          tags: [],
        },
      ]),
    ).toEqual([
      {
        name: "Alpha",
        slug: "alpha",
        summary: "Short summary",
        featured: true,
        tags: [],
      },
      {
        name: "Zeta",
        slug: "zeta",
        summary: expect.stringMatching(/…$/),
        featured: false,
        tags: ["visual"],
      },
    ]);
  });

  it("owns public substance preview projection and ordering", () => {
    expect(
      projectPublicSubstancePreviews([
        {
          id: 2,
          title: "Zed Drug",
          priority: "normal",
          index_categories: ["other"],
          summary: "Long ".repeat(80),
        },
        {
          id: 1,
          title: "LSD",
          slug: "lsd",
          priority: "high",
          index_categories: ["psychedelic"],
          summary: "Acid",
        },
      ] as SubstanceRecord[]),
    ).toEqual([
      {
        title: "LSD",
        slug: "lsd",
        summary: "Acid",
        priority: "high",
        indexCategories: ["psychedelic"],
      },
      {
        title: "Zed Drug",
        slug: "zed-drug",
        summary: expect.stringMatching(/…$/),
        priority: "normal",
        indexCategories: ["other"],
      },
    ]);
  });

  it("drains public substance pages in source order and sorts previews only after the full drain", async () => {
    const queryCalls: Array<[string, Record<string, unknown>]> = [];
    const query = async <Result, Args extends Record<string, unknown>>(name: string, args: Args): Promise<Result> => {
      queryCalls.push([name, args]);
      if (args.cursor === "next") {
        return {
          items: [{ title: "Alpha", slug: "alpha", summary: "A", priority: "high", indexCategories: [] }],
          cursor: "done",
          isDone: true,
        } as Result;
      }
      return {
        items: [{ title: "Zeta", slug: "zeta", summary: "Z", priority: "low", indexCategories: [] }],
        cursor: "next",
        isDone: false,
      } as Result;
    };

    await expect(
      createDataPublicDataReadAdapter(query).getPublicSubstancePreviews(),
    ).resolves.toEqual([
      expect.objectContaining({ title: "Alpha" }),
      expect.objectContaining({ title: "Zeta" }),
    ]);
    expect(queryCalls).toEqual([
      ["substanceIndex:getPublicPreviewsPage", { limit: 32 }],
      ["substanceIndex:getPublicPreviewsPage", { cursor: "next", limit: 32 }],
    ]);
  });

  it("drains the public replication catalog through bounded gallery pages", async () => {
    const queryCalls: Array<[string, Record<string, unknown>]> = [];
    const query = async <Result, Args extends Record<string, unknown>>(
      name: string,
      args: Args,
    ): Promise<Result> => {
      queryCalls.push([name, args]);
      if (args.cursor === "replication-next") {
        return {
          items: [{ _id: "2", slug: "second", artist: "B", type: "image", format: "webp", url: "https://x/2", created_at: "2026" }],
          cursor: "done",
          isDone: true,
        } as Result;
      }
      return {
        items: [{ _id: "1", slug: "first", artist: "A", type: "image", format: "webp", url: "https://x/1", created_at: "2026" }],
        cursor: "replication-next",
        isDone: false,
      } as Result;
    };

    await expect(
      createDataPublicDataReadAdapter(query).getPublicReplications(),
    ).resolves.toEqual([
      expect.objectContaining({ slug: "first" }),
      expect.objectContaining({ slug: "second" }),
    ]);
    expect(queryCalls).toEqual([
      ["replications:getPublicGalleryPage", { limit: 64 }],
      ["replications:getPublicGalleryPage", { cursor: "replication-next", limit: 64 }],
    ]);
    expect(
      queryCalls.some(([name]) => name === "replications:getPublicReplications"),
    ).toBe(false);
  });

  it("fails closed when a required public page returns a malformed payload", async () => {
    const calls: string[] = [];
    const query = async <Result>(name: string): Promise<Result> => {
      calls.push(name);
      return { items: [], cursor: "done", isDone: "yes" } as Result;
    };

    await expect(
      createDataPublicDataReadAdapter(query).getPublicCoverageSubstances(),
    ).rejects.toThrow("returned an invalid payload");
    expect(calls).toEqual(["substanceIndex:getPublicCoverageInputPage"]);
  });

  it("fails closed when a public corpus cursor enters a longer cycle", async () => {
    const cursors = ["A", "B", "A"];
    let callIndex = 0;
    const query = async <Result>(): Promise<Result> => ({
      items: [],
      cursor: cursors[callIndex++],
      isDone: false,
    }) as Result;

    await expect(
      createDataPublicDataReadAdapter(query).getPublicSubstanceLookup(),
    ).rejects.toThrow("did not advance");
    expect(callIndex).toBe(3);
  });

  it("fails closed when standard public pagination exceeds page or row bounds", async () => {
    let pageCall = 0;
    const endlessQuery = async <Result>(): Promise<Result> => ({
      items: [],
      cursor: `cursor-${pageCall++}`,
      isDone: false,
    }) as Result;
    await expect(
      createDataPublicDataReadAdapter(endlessQuery).getPublicSubstanceLookup(),
    ).rejects.toThrow("exceeded maxPages (512)");

    const oversizedQuery = async <Result>(): Promise<Result> => ({
      items: Array.from({ length: 20_001 }, () => ({})),
      cursor: "done",
      isDone: true,
    }) as Result;
    await expect(
      createDataPublicDataReadAdapter(oversizedQuery).getPublicSubstanceLookup(),
    ).rejects.toThrow("exceeded maxRows (20000)");
  });

  it("fails closed on About-preview cursor cycles and page or row bound exhaustion", async () => {
    const cursors = ["A", "B", "A"];
    let cycleCall = 0;
    const cycleQuery = async <Result>(): Promise<Result> => ({
      items: [],
      cursor: cursors[cycleCall++],
      isDone: false,
    }) as Result;
    await expect(
      createDataPublicDataReadAdapter(cycleQuery).getPublicAboutPreviewSubstances(),
    ).rejects.toThrow("did not advance");
    expect(cycleCall).toBe(3);

    let pageCall = 0;
    const endlessQuery = async <Result>(): Promise<Result> => ({
      items: [],
      cursor: `cursor-${pageCall++}`,
      isDone: false,
    }) as Result;
    await expect(
      createDataPublicDataReadAdapter(endlessQuery).getPublicAboutPreviewSubstances(),
    ).rejects.toThrow("exceeded maxPages (128)");

    const oversizedQuery = async <Result>(): Promise<Result> => ({
      items: Array.from({ length: 8_193 }, () => ({})),
      cursor: "done",
      isDone: true,
    }) as Result;
    await expect(
      createDataPublicDataReadAdapter(oversizedQuery).getPublicAboutPreviewSubstances(),
    ).rejects.toThrow("exceeded maxRows (8192)");
  });

  it("fails closed when required paginated public functions are missing", async () => {
    const calls: string[] = [];
    const query = async <Result>(name: string): Promise<Result> => {
      calls.push(name);
      throw new Error(`[DATA Q(${name})] Could not find public function`);
    };
    const adapter = createDataPublicDataReadAdapter(query);
    const reads = [
      () => adapter.getRawSubstances(),
      () => adapter.getPublicCoverageSubstances(),
      () => adapter.getPublicMechanismRouteInput(),
      () => adapter.getPublicAboutPreviewSubstances(),
      () => adapter.getPublicSubstanceLookup(),
      () => adapter.getPublicSubstancePreviews(),
    ];

    for (const read of reads) {
      await expect(read()).rejects.toThrow("Could not find public function");
    }

    expect(calls).toEqual([
      "substanceIndex:getPublicLibraryInputPage",
      "substanceIndex:getPublicCoverageInputPage",
      "substanceIndex:getPublicMechanismRouteInputPage",
      "substanceIndex:getPublicAboutPreviewCandidates",
      "substanceIndex:getPublicLookupPage",
      "substanceIndex:getPublicPreviewsPage",
    ]);
  });

  it("omits stored reference provenance from raw-compatibility public records", () => {
    const result = projectPublicSubstanceRecord({
      id: 1,
      title: "LSD",
      slug: "lsd",
      priority: "high",
      index_categories: [],
      references: [{
        id: "ref-1",
        type: "journal",
        title: "Reference",
        authors: ["Author"],
        sourceType: "journal",
        quality: "inspected",
        metadataProvenance: [{ kind: "fetched", source: "crossref", fields: ["authors"] }],
      }],
    } as unknown as SubstanceRecord);

    expect(result.references?.[0]).not.toHaveProperty("metadataProvenance");
    expect(result.references?.[0]).toMatchObject({ id: "ref-1", authors: ["Author"] });
  });

  it("reduces structured references in server library records without exposing editorial review", () => {
    const result = projectPublicSubstanceLibraryRecord({
      id: 1,
      title: "LSD",
      slug: "lsd",
      priority: "high",
      index_categories: ["psychedelic"],
      summary: "Acid",
      references: [
        {
          id: "ref-1",
          type: "webpage",
          title: "Reference One",
          authors: [],
          url: "https://example.test/ref-1",
          sourceType: "unknown",
          quality: "fallback",
        },
      ],
      editorial_review: {
        status: "approved",
        notes: "internal",
      },
    } as unknown as SubstanceRecord);

    expect(result.references).toEqual([
      {
        url: "https://example.test/ref-1",
      },
    ]);
    expect(result).not.toHaveProperty("legality");
    expect(result).not.toHaveProperty("history_culture");
    expect(result).not.toHaveProperty("comparisons");
    expect(result).not.toHaveProperty("editorial_review");
  });

  it("surfaces generic production Server Error without attempting a whole-corpus fallback", async () => {
    const queryCalls: Array<[string, Record<string, unknown>]> = [];
    const query = async <Result, Args extends Record<string, unknown>>(name: string, args: Args): Promise<Result> => {
      queryCalls.push([name, args]);
      throw new Error(`[DATA Q(${name})] Server Error`);
    };
    const adapter = createDataPublicDataReadAdapter(query);

    await expect(adapter.getRawSubstances()).rejects.toThrow("Server Error");
    await expect(adapter.getPublicAboutPreviewSubstances()).rejects.toThrow("Server Error");

    expect(queryCalls).toEqual([
      ["substanceIndex:getPublicLibraryInputPage", { limit: 32 }],
      ["substanceIndex:getPublicAboutPreviewCandidates", { limit: 64 }],
    ]);
    expect(queryCalls.some(([name]) => name === "substanceIndex:getAll")).toBe(false);
  });

  it("keeps paginated library reads alive when one projected row has malformed nested content", async () => {
    const storedRows = [
      {
        ...structuredClone(fullArticleWithDosage),
        slug: "lsd",
        priority: "high" as const,
      } as SubstanceRecord,
      {
        ...structuredClone(fullArticleWithDosage),
        id: 2,
        title: "Malformed nested row",
        slug: "malformed-nested-row",
        references: { unexpected: "record" },
        dosage: { routes: [null] },
        duration: { routes: [false] },
        pharmacology: null,
      } as unknown as SubstanceRecord,
    ];
    const query = async <Result>(name: string): Promise<Result> => {
      expect(name).toBe("substanceIndex:getPublicLibraryInputPage");
      return {
        items: storedRows.map(projectPublicSubstanceLibraryRecord),
        cursor: "done",
        isDone: true,
      } as Result;
    };

    const records = await createDataPublicDataReadAdapter(query).getRawSubstances();

    expect(records.map(({ title }) => title)).toEqual([
      "LSD",
      "Malformed nested row",
    ]);
  });

  it("rejects archive failures instead of turning them into cacheable absence", async () => {
    const failure = new Error("Server Error");
    const adapter = createDataPublicDataReadAdapter(async () => {
      throw failure;
    });

    await expect(adapter.getPublicEffectIndexPosts()).rejects.toBe(failure);
    await expect(adapter.getPublicEffectIndexPostBySlug("new-post")).rejects.toBe(failure);
  });

  it("preserves authoritative empty archive and missing-post responses", async () => {
    const adapter = createDataPublicDataReadAdapter(async <Result>(name: string): Promise<Result> =>
      (name === "effectIndexArchive:listPosts" ? [] : null) as Result,
    );

    await expect(adapter.getPublicEffectIndexPosts()).resolves.toEqual([]);
    await expect(adapter.getPublicEffectIndexPostBySlug("missing")).resolves.toBeNull();
  });

  it("does not use stale-deployment fallbacks for ordinary Postgres query failures", async () => {
    const query = async <Result>(name: string): Promise<Result> => {
      throw new Error(`[DATA Q(${name})] Validation failed`);
    };
    const adapter = createDataPublicDataReadAdapter(query);

    await expect(adapter.getPublicSubstanceLookup()).rejects.toThrow("Validation failed");
  });

  it("fails closed on explicit missing-function errors for required public projections", async () => {
    const calls: string[] = [];
    const query = async <Result>(name: string): Promise<Result> => {
      calls.push(name);
      throw new Error(`[DATA Q(${name})] Could not find public function`);
    };
    const adapter = createDataPublicDataReadAdapter(query);
    const reads = [
      () => adapter.getPublicSubstanceBySlug("lsd"),
      () => adapter.getPublicEffects(),
      () => adapter.getPublicEffectBySlug("respiratory-depression"),
      () => adapter.getPublicEffectArticles(),
      () => adapter.getPublicEffectsByCategory("physical"),
    ];

    for (const read of reads) {
      await expect(read()).rejects.toThrow("Could not find public function");
    }

    expect(calls).toEqual([
      "substanceIndex:getPublicBySlug",
      "subjectiveEffects:getPublicPreviews",
      "subjectiveEffects:getPublicBySlug",
      "subjectiveEffects:getPublicArticles",
      "subjectiveEffects:getPublicByCategory",
    ]);
  });

  it("contains no active calls to legacy whole-corpus public projections", () => {
    const catalogFunctionNames = Object.values(publicDataReadCatalog).map((entry) => entry.functionName);
    const forbiddenFunctionNames = [
      "substanceIndex:getPublicLibraryInput",
      "substanceIndex:getPublicCoverageInput",
      "substanceIndex:getPublicLookup",
      "substanceIndex:getPublicPreviews",
      "substanceIndex:getPublicMechanismRouteInput",
      "substanceIndex:getSearchInput",
      "substanceIndex:getAll",
      "substanceIndex:getBySlug",
      "subjectiveEffects:getAll",
      "subjectiveEffects:getBySlug",
      "subjectiveEffects:getByCategory",
      "replications:getPublicReplications",
    ];

    expect(catalogFunctionNames.filter((name) => forbiddenFunctionNames.includes(name))).toEqual([]);
  });
});

it("maps gallery index readiness to fallback without hiding unrelated errors", async () => {
  const notReady = createDataPublicDataReadAdapter(async () => {
    throw new PostgresError({ code: "SUBSTANCE_GALLERY_INDEX_NOT_READY" });
  });
  expect(await notReady.getPublicSubstanceGallery("lsd")).toBeNull();

  const failed = createDataPublicDataReadAdapter(async () => {
    throw new PostgresError({ code: "DATABASE_FAILURE" });
  });
  await expect(failed.getPublicSubstanceGallery("lsd")).rejects.toThrow();
});
