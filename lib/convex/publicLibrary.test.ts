import { beforeEach, describe, expect, it, vi } from "vitest";
import { projectLibraryInput } from "../../convex/lib/substanceReadProjections";
import { fullArticleWithDosage } from "../../src/test/fixtures/articles";

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
  getRawSubstances: vi.fn(),
  getIndexLayoutByType: vi.fn(),
  getPublicEffectArticles: vi.fn(),
  getPublicReports: vi.fn(),
  getPublicContributorProfiles: vi.fn(),
  buildLibrary: vi.fn(),
  buildSearchIndex: vi.fn(),
}));

vi.mock("./publicData", () => ({
  PUBLIC_CONVEX_CACHE_REVALIDATE_SECONDS: 900,
  PUBLIC_CONVEX_CACHE_TAGS: {
    all: "convex-public",
    substances: "convex-public:substances",
    layouts: "convex-public:layouts",
    effects: "convex-public:effects",
    reports: "convex-public:reports",
    contributors: "convex-public:contributors",
  },
  getRawSubstances: mocks.getRawSubstances,
  getIndexLayoutByType: mocks.getIndexLayoutByType,
  getPublicEffectArticles: mocks.getPublicEffectArticles,
  getPublicReports: mocks.getPublicReports,
  getPublicContributorProfiles: mocks.getPublicContributorProfiles,
}));

vi.mock("../../src/data/builders/libraryBuilder", () => ({
  buildLibrary: mocks.buildLibrary,
}));

vi.mock("../../src/data/builders/search", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/data/builders/search")>();

  return {
    ...actual,
    buildSearchIndex: (input: Parameters<typeof actual.buildSearchIndex>[0]) => {
      mocks.buildSearchIndex(input);
      return actual.buildSearchIndex(input);
    },
  };
});

const createRecord = (name: string, slug: string, aliases: string[] = []) => ({
  name,
  slug,
  aliases,
  chemicalClasses: [],
  psychoactiveClasses: [],
  mechanisms: [],
  content: {
    categories: [],
    heroBadges: [],
    infoSections: [],
    subtitle: "",
  },
});

const createLibrary = (records: ReturnType<typeof createRecord>[]) => ({
  articles: [],
  allSubstanceRecords: records,
  substanceRecords: records,
  allSubstancesBySlug: new Map(),
  substanceBySlug: new Map(),
  interactionIndex: new Map(),
  dosageCategoryGroups: [],
  chemicalClassIndexGroups: [],
  mechanismIndexGroups: [],
  effectSummaries: [],
  mechanismSummaries: [],
  findCategoryByKey: () => undefined,
  normalizeCategoryKey: (value: string) => value.toLowerCase(),
  getCategoryDetail: () => null,
  getEffectDetail: () => null,
  getEffectSummary: () => undefined,
  getMechanismDetail: () => null,
  getMechanismSummary: () => undefined,
  getChemicalClassDetail: () => null,
  getPsychoactiveClassDetail: () => null,
  getTaxonomyRouteDetail: () => null,
  getTaxonomyRoutePath: () => null,
  getInteractionsForSubstance: () => undefined,
  buildCategoryGroupsForRecords: () => [],
});

describe("publicLibrary search index cache", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useRealTimers();
    cacheMocks.unstableCache.mockClear();
    mocks.getRawSubstances.mockReset();
    mocks.getIndexLayoutByType.mockReset();
    mocks.buildLibrary.mockReset();
    mocks.buildSearchIndex.mockClear();
    mocks.getRawSubstances.mockResolvedValue([]);
    mocks.getIndexLayoutByType.mockResolvedValue(null);
    mocks.getPublicReports.mockResolvedValue([]);
    mocks.getPublicEffectArticles.mockResolvedValue([]);
    mocks.getPublicContributorProfiles.mockResolvedValue([]);
  });

  it("builds the library from the slim public substance contract", async () => {
    const slimRecord = projectLibraryInput({
      ...structuredClone(fullArticleWithDosage),
      slug: "lsd",
    });
    const builtLibrary = createLibrary([]);
    mocks.getRawSubstances.mockResolvedValue([slimRecord]);
    mocks.buildLibrary.mockReturnValue(builtLibrary);

    const { getPublicLibrary } = await import("./publicLibrary");

    await expect(getPublicLibrary()).resolves.toBe(builtLibrary);
    expect(mocks.buildLibrary).toHaveBeenCalledWith(
      [slimRecord],
      expect.any(Object),
    );
    expect(slimRecord).not.toHaveProperty("legality");
    expect(slimRecord).not.toHaveProperty("history_culture");
    expect(slimRecord).not.toHaveProperty("comparisons");
  });

  it("reuses the built search index for searches against the same source inputs", async () => {
    mocks.buildLibrary.mockReturnValue(
      createLibrary([
        createRecord("LSD", "lsd"),
        createRecord("MDMA", "mdma"),
      ]),
    );

    const { getPublicSearchMatches } = await import("./publicLibrary");

    await expect(getPublicSearchMatches("lsd", 5)).resolves.toMatchObject([
      { label: "LSD", type: "substance" },
    ]);
    await expect(getPublicSearchMatches("mdma", 5)).resolves.toMatchObject([
      { label: "MDMA", type: "substance" },
    ]);

    expect(mocks.buildLibrary).toHaveBeenCalledTimes(1);
    expect(mocks.buildSearchIndex).toHaveBeenCalledTimes(1);
  });

  it("data-caches only the JSON-safe search manifest and suggestion wrappers", async () => {
    mocks.buildLibrary.mockReturnValue(createLibrary([]));

    const { getPublicSearchManifest, getPublicSearchIndex, getPublicLibrary } =
      await import("./publicLibrary");

    await getPublicSearchManifest();
    await getPublicSearchIndex();
    await getPublicLibrary();

    expect(
      cacheMocks.unstableCache.mock.calls.map((call) => call[1]),
    ).toEqual([
      ["convex-public-search-manifest"],
      ["convex-public-search-suggestions"],
    ]);
    expect(cacheMocks.unstableCache).toHaveBeenCalledWith(
      expect.any(Function),
      ["convex-public-search-manifest"],
      expect.objectContaining({
        tags: expect.arrayContaining([
          "convex-public",
          "convex-public:substances",
          "convex-public:effects",
        ]),
      }),
    );
    expect(cacheMocks.unstableCache).toHaveBeenCalledWith(
      expect.any(Function),
      ["convex-public-search-suggestions"],
      expect.objectContaining({
        tags: expect.arrayContaining([
          "convex-public",
          "convex-public:substances",
          "convex-public:effects",
        ]),
      }),
    );
  });

  it("serves suggestions as normalized JSON-safe projections", async () => {
    mocks.buildLibrary.mockReturnValue(
      createLibrary([createRecord("LSD", "lsd", ["Acid"])]),
    );

    const { getPublicSearchSuggestions } = await import("./publicLibrary");

    // Case and whitespace fold into one cache key without changing results.
    const suggestions = await getPublicSearchSuggestions("  LSD ", 5);
    expect(suggestions).toMatchObject([{ label: "LSD", type: "substance" }]);
    // Index internals must not leak into the cached, client-facing payload.
    expect(suggestions[0]).not.toHaveProperty("keywords");
    expect(suggestions[0]).not.toHaveProperty("score");

    await expect(getPublicSearchSuggestions("   ", 5)).resolves.toEqual([]);
    expect(mocks.buildLibrary).toHaveBeenCalledTimes(1);
  });

  it("rebuilds the search index when refreshed source inputs change", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-27T12:00:00Z"));
    mocks.buildLibrary
      .mockReturnValueOnce(createLibrary([createRecord("LSD", "lsd", ["Acid"])]))
      .mockReturnValueOnce(createLibrary([createRecord("LSD", "lsd", ["Acid", "Lucy"])]));

    const { getPublicSearchMatches } = await import("./publicLibrary");

    await expect(getPublicSearchMatches("acid", 5)).resolves.toMatchObject([
      { label: "LSD", type: "substance" },
    ]);

    vi.setSystemTime(new Date("2026-04-27T13:01:00Z"));

    await expect(getPublicSearchMatches("lucy", 5)).resolves.toMatchObject([
      { label: "LSD", type: "substance" },
    ]);

    expect(mocks.buildLibrary).toHaveBeenCalledTimes(2);
    expect(mocks.buildSearchIndex).toHaveBeenCalledTimes(2);
  });

  it("refreshes derived library and search data after explicit public-data invalidation", async () => {
    mocks.buildLibrary
      .mockReturnValueOnce(createLibrary([createRecord("LSD", "lsd", ["Acid"])]))
      .mockReturnValueOnce(createLibrary([createRecord("LSD", "lsd", ["Lucy"])]));

    const { getPublicSearchMatches, invalidatePublicDerivedDataCache } = await import("./publicLibrary");

    await expect(getPublicSearchMatches("acid", 5)).resolves.toMatchObject([
      { label: "LSD", type: "substance" },
    ]);

    invalidatePublicDerivedDataCache({ source: "test-write" });

    await expect(getPublicSearchMatches("lucy", 5)).resolves.toMatchObject([
      { label: "LSD", type: "substance" },
    ]);

    expect(mocks.buildLibrary).toHaveBeenCalledTimes(2);
    expect(mocks.buildSearchIndex).toHaveBeenCalledTimes(2);
  });

  it("includes report and profile records in the cached public search index", async () => {
    mocks.buildLibrary.mockReturnValue(createLibrary([]));
    mocks.getPublicReports.mockResolvedValue([
      {
        title: "A careful DMT evening",
        slug: "careful-dmt-evening",
        author: "Ada Lovelace",
        featured: true,
        substanceNames: ["DMT"],
        substances: [{ name: "DMT" }],
        introduction: "Dimethyltryptamine report notes.",
        tripDate: "2026-04-20",
        authorProfileKey: "ADA",
      },
    ]);
    mocks.getPublicContributorProfiles.mockResolvedValue([
      {
        key: "ADA",
        displayName: "Ada Lovelace",
        aliases: ["analytical engine"],
        bio: "Contributor focused on trip reports.",
        links: [],
        avatarUrl: null,
        hasCustomBio: true,
      },
    ]);

    const { getPublicSearchMatches } = await import("./publicLibrary");

    await expect(getPublicSearchMatches("ada", 5)).resolves.toMatchObject([
      { label: "Ada Lovelace", type: "profile" },
      { label: "A careful DMT evening", type: "report" },
    ]);
    expect(mocks.buildSearchIndex).toHaveBeenCalledWith(
      expect.objectContaining({
        reports: [expect.objectContaining({ slug: "careful-dmt-evening" })],
        profiles: [expect.objectContaining({ key: "ADA" })],
      }),
    );
  });
});
