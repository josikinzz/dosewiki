import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fullArticleWithDosage } from "../../src/test/fixtures/articles";
import { projectLibraryInput } from "../../src/data/projections/substanceReadProjections";

beforeEach(() => {
  vi.stubEnv("DATA_BACKEND", "postgres");
  vi.stubEnv("POSTGRES_POOLED_URL", "postgres://localhost/dosewiki_test");
  vi.stubEnv("POSTGRES_DIRECT_URL", undefined);
  vi.stubEnv("TARGET_POSTGRES_URL", undefined);
});
afterEach(() => vi.unstubAllEnvs());

vi.mock("server-only", () => ({}));
vi.mock("react", () => ({
  cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}));

const cacheMocks = vi.hoisted(() => ({
  unstableCache: vi.fn(
    <T extends (...args: never[]) => unknown>(
      fn: T,
      _keyParts?: string[],
      _options?: { tags?: string[] },
    ) => fn,
  ),
}));

vi.mock("next/cache", () => ({
  unstable_cache: cacheMocks.unstableCache,
}));

const mocks = vi.hoisted(() => ({
  queryData: vi.fn(),
}));

vi.mock("./serverClient", () => ({
  queryData: mocks.queryData,
}));

describe("public substance data adapters", () => {
  beforeEach(() => {
    vi.resetModules();
    cacheMocks.unstableCache.mockClear();
    mocks.queryData.mockReset();
  });


  it("combines every slug page into a sorted deduplicated result", async () => {
    mocks.queryData
      .mockResolvedValueOnce({ items: ["mdma", "lsd"], cursor: "lsd", isDone: false })
      .mockResolvedValueOnce({ items: ["2c-b", "lsd"], cursor: "", isDone: true });

    const { getPublicSubstanceSlugs } = await import("./publicData.substances");

    await expect(getPublicSubstanceSlugs()).resolves.toEqual(["2c-b", "lsd", "mdma"]);
    expect(mocks.queryData).toHaveBeenCalledTimes(2);

  });

  it("falls back to the preview drain for slugs while getPublicSlugsPage failed", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.queryData.mockImplementation(async (name: string) => {
      if (name === "substanceIndex:getPublicSlugsPage") {
        throw new Error("Could not find public function for 'substanceIndex:getPublicSlugsPage'.");
      }
      if (name === "substanceIndex:getPublicPreviewsPage") {
        return {
          items: [
            { slug: "mdma", title: "MDMA", priority: "normal", summary: "", indexCategories: [] },
            { slug: "lsd", title: "LSD", priority: "high", summary: "", indexCategories: [] },
          ],
          cursor: "",
          isDone: true,
        };
      }
      throw new Error(`unexpected query ${name}`);
    });

    const { getPublicSubstanceSlugs } = await import("./publicData.substances");

    await expect(getPublicSubstanceSlugs()).resolves.toEqual(["lsd", "mdma"]);
    expect(mocks.queryData).toHaveBeenCalledWith(
      "substanceIndex:getPublicPreviewsPage",
      { limit: 32 },
    );
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("getPublicSlugsPage failed"));
    warn.mockRestore();
  });

  it("reads the slim mechanism route projection without loading library input", async () => {
    mocks.queryData.mockResolvedValueOnce({
      items: [{
        displayName: "LSD",
        priority: "normal",
        indexCategories: [],
        mechanisms: [],
      }],
      cursor: "done",
      isDone: true,
    });

    const { getPublicMechanismRouteInput } = await import(
      "./publicData.substances"
    );

    await expect(getPublicMechanismRouteInput()).resolves.toEqual([
      expect.objectContaining({ displayName: "LSD" }),
    ]);
    expect(mocks.queryData).toHaveBeenCalledWith(
      "substanceIndex:getPublicMechanismRouteInputPage",
      { limit: 32 },
    );
  });

  it("validates paginated about candidates before filtering and taking 12", async () => {
    const validCandidates = Array.from({ length: 13 }, (_, index) => ({
      ...structuredClone(fullArticleWithDosage),
      id: index + 100,
      title: `Candidate ${index + 1}`,
      slug: `candidate-${index + 1}`,
      priority: "normal",
      identification: {
        ...structuredClone(fullArticleWithDosage.identification),
        common_name: `Candidate ${index + 1}`,
      },
    }));
    mocks.queryData.mockResolvedValueOnce({
      items: [
        {
          title: "Malformed",
          slug: "malformed",
          classification: { psychoactive_class: "Psychedelic" },
        },
        {
          ...structuredClone(fullArticleWithDosage),
          id: 99,
          title: "Low priority",
          slug: "low-priority",
          priority: "low",
        },
        ...validCandidates,
      ],
      cursor: "done",
      isDone: true,
    });

    const { getPublicAboutPreviewSubstances } = await import(
      "./publicData.substances"
    );

    const result = await getPublicAboutPreviewSubstances();

    expect(result).toHaveLength(12);
    expect(result.map((article) => article.title)).toEqual(
      validCandidates.slice(0, 12).map((article) => article.title),
    );
    expect(mocks.queryData).toHaveBeenCalledWith(
      "substanceIndex:getPublicAboutPreviewCandidates",
      { limit: 64 },
    );
  });

  it("continues reading about candidates until it finds 12 valid non-low records", async () => {
    const lowPriorityCandidates = Array.from({ length: 64 }, (_, index) => ({
      ...structuredClone(fullArticleWithDosage),
      id: index + 200,
      title: `Low candidate ${index + 1}`,
      slug: `low-candidate-${index + 1}`,
      priority: "low",
    }));
    const validCandidates = Array.from({ length: 12 }, (_, index) => ({
      ...structuredClone(fullArticleWithDosage),
      id: index + 300,
      title: `Visible candidate ${index + 1}`,
      slug: `visible-candidate-${index + 1}`,
      priority: "normal",
      identification: {
        ...structuredClone(fullArticleWithDosage.identification),
        common_name: `Visible candidate ${index + 1}`,
      },
    }));
    mocks.queryData
      .mockResolvedValueOnce({
        items: lowPriorityCandidates,
        cursor: "page-2",
        isDone: false,
      })
      .mockResolvedValueOnce({
        items: validCandidates,
        cursor: "done",
        isDone: true,
      });

    const { getPublicAboutPreviewSubstances } = await import(
      "./publicData.substances"
    );

    await expect(
      getPublicAboutPreviewSubstances().then((records) =>
        records.map((record) => record.title),
      ),
    ).resolves.toEqual(validCandidates.map((record) => record.title));
    expect(mocks.queryData).toHaveBeenNthCalledWith(
      1,
      "substanceIndex:getPublicAboutPreviewCandidates",
      { limit: 64 },
    );
    expect(mocks.queryData).toHaveBeenNthCalledWith(
      2,
      "substanceIndex:getPublicAboutPreviewCandidates",
      { cursor: "page-2", limit: 64 },
    );
  });

  it("preserves complete article records for coverage analysis", async () => {
    const article = {
      ...structuredClone(fullArticleWithDosage),
      slug: "lsd",
    };
    mocks.queryData.mockResolvedValueOnce({
      items: [article],
      cursor: "done-1",
      isDone: true,
    });

    const { getPublicCoverageSubstances } = await import(
      "./publicData.substances"
    );

    const records = await getPublicCoverageSubstances();

    expect(records[0]).toMatchObject({
      legality: fullArticleWithDosage.legality,
      harm_potential: fullArticleWithDosage.harm_potential,
    });
    expect(records[0]).toHaveProperty("comparisons");
  });

  it("reads public list, lookup, and article data from projected substance queries", async () => {
    mocks.queryData
      .mockResolvedValueOnce({
        items: [{ slug: "lsd", name: "LSD", priority: "high" }],
        cursor: "lookup-done",
        isDone: true,
      })
      .mockResolvedValueOnce({
        items: [{ title: "LSD", slug: "lsd", summary: "Acid", priority: "high", indexCategories: [] }],
        cursor: "previews-done",
        isDone: true,
      })
      .mockResolvedValueOnce({ ...fullArticleWithDosage, slug: "lsd" });

    const {
      getPublicSubstanceBySlug,
      getPublicSubstanceLookup,
      getPublicSubstances,
    } = await import("./publicData.substances");

    await expect(getPublicSubstanceLookup()).resolves.toEqual([
      { slug: "lsd", name: "LSD", priority: "high" },
    ]);
    await expect(getPublicSubstances()).resolves.toHaveLength(1);
    await expect(getPublicSubstanceBySlug("lsd")).resolves.toMatchObject({ slug: "lsd" });

    expect(mocks.queryData).toHaveBeenNthCalledWith(
      1,
      "substanceIndex:getPublicLookupPage",
      { limit: 200 },
    );
    expect(mocks.queryData).toHaveBeenNthCalledWith(
      2,
      "substanceIndex:getPublicPreviewsPage",
      { limit: 32 },
    );
    expect(mocks.queryData).toHaveBeenNthCalledWith(3, "substanceIndex:getPublicBySlug", { slug: "lsd" });
  });

  it("filters malformed public library records returned from Postgres", async () => {
    mocks.queryData.mockResolvedValueOnce({
      items: [
        projectLibraryInput({
          ...fullArticleWithDosage,
          slug: "lsd",
        }),
        {
          title: "Broken",
          slug: "broken",
          classification: { psychoactive_class: "Psychedelic" },
        },
      ],
      cursor: "done",
      isDone: true,
    });

    const { getRawSubstances } = await import("./publicData.substances");

    await expect(getRawSubstances()).resolves.toEqual([expect.objectContaining({ slug: "lsd" })]);
  });
});
