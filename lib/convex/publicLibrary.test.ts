import { beforeEach, describe, expect, it, vi } from "vitest";
import { projectLibraryInput } from "../../src/data/projections/substanceReadProjections";
import { fullArticleWithDosage } from "../../src/test/fixtures/articles";

vi.mock("server-only", () => ({}));
vi.mock("react", () => ({
  cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
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

type TestSubstanceRecord = {
  name: string;
  slug: string;
  aliases: string[];
  chemicalClasses: string[];
  psychoactiveClasses: string[];
  mechanisms: string[];
  content: {
    categories: string[];
    heroBadges: string[];
    infoSections: string[];
    subtitle: string;
  };
};

type TestEffectSummary = {
  name: string;
  slug: string;
  total: number;
};

const createRecord = (name: string, slug: string, aliases: string[] = []): TestSubstanceRecord => ({
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

const createLibrary = (
  records: TestSubstanceRecord[],
  effectSummaries: TestEffectSummary[] = [],
) => ({
  articles: [],
  allSubstanceRecords: records,
  substanceRecords: records,
  allSubstancesBySlug: new Map(),
  substanceBySlug: new Map(),
  interactionIndex: new Map(),
  dosageCategoryGroups: [],
  chemicalClassIndexGroups: [],
  mechanismIndexGroups: [],
  effectSummaries,
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

const TRACERS_SUMMARY = [{ name: "Tracers", slug: "tracers", total: 1 }];

const createEffectArticle = (overrides: Record<string, unknown> = {}) => ({
  slug: "tracers",
  name: "Tracers",
  summary: "Trailing afterimages behind moving objects.",
  tags: ["visual"],
  featured: false,
  description_raw: "Tracer bodies stretch behind the hand.",
  ...overrides,
});

const createReport = (overrides: Record<string, unknown> = {}) => ({
  title: "A careful DMT evening",
  slug: "careful-dmt-evening",
  author: "Ada Lovelace",
  featured: true,
  substanceNames: ["DMT"],
  substances: [{ name: "DMT" }],
  introduction: "Dimethyltryptamine report notes.",
  tripDate: "2026-04-20",
  authorProfileKey: "ADA",
  ...overrides,
});

const createProfile = (overrides: Record<string, unknown> = {}) => ({
  key: "ADA",
  displayName: "Ada Lovelace",
  aliases: ["analytical engine"],
  bio: "Contributor focused on cartography.",
  links: [],
  avatarUrl: null,
  hasCustomBio: true,
  ...overrides,
});

describe("publicLibrary search index cache", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useRealTimers();
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
    mocks.getPublicReports.mockResolvedValue([createReport()]);
    mocks.getPublicContributorProfiles.mockResolvedValue([createProfile()]);

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

  it("rebuilds the search index for a same-count effect article edit", async () => {
    mocks.buildLibrary.mockReturnValue(createLibrary([], TRACERS_SUMMARY));
    mocks.getPublicEffectArticles.mockResolvedValue([createEffectArticle()]);

    const { getPublicSearchMatches } = await import("./publicLibrary");

    await expect(getPublicSearchMatches("afterimages", 5)).resolves.toMatchObject([
      { label: "Tracers", type: "effect" },
    ]);

    mocks.getPublicEffectArticles.mockResolvedValue([
      createEffectArticle({ summary: "Persistent smearing halos." }),
    ]);

    await expect(getPublicSearchMatches("halos", 5)).resolves.toMatchObject([
      { label: "Tracers", type: "effect" },
    ]);
    expect(mocks.buildSearchIndex).toHaveBeenCalledTimes(2);
  });

  it("rebuilds the search index for a same-count report edit", async () => {
    mocks.buildLibrary.mockReturnValue(createLibrary([]));
    mocks.getPublicReports.mockResolvedValue([createReport()]);

    const { getPublicSearchMatches } = await import("./publicLibrary");

    await expect(getPublicSearchMatches("careful", 5)).resolves.toMatchObject([
      { label: "A careful DMT evening", type: "report" },
    ]);

    mocks.getPublicReports.mockResolvedValue([
      createReport({ title: "A cautious DMT evening" }),
    ]);

    await expect(getPublicSearchMatches("cautious", 5)).resolves.toMatchObject([
      { label: "A cautious DMT evening", type: "report" },
    ]);
    expect(mocks.buildSearchIndex).toHaveBeenCalledTimes(2);
  });

  it("rebuilds the search index for a same-count contributor profile edit", async () => {
    mocks.buildLibrary.mockReturnValue(createLibrary([]));
    mocks.getPublicContributorProfiles.mockResolvedValue([createProfile()]);

    const { getPublicSearchMatches } = await import("./publicLibrary");

    await expect(getPublicSearchMatches("cartography", 5)).resolves.toMatchObject([
      { label: "Ada Lovelace", type: "profile" },
    ]);

    mocks.getPublicContributorProfiles.mockResolvedValue([
      createProfile({ bio: "Contributor focused on dosimetry." }),
    ]);

    await expect(getPublicSearchMatches("dosimetry", 5)).resolves.toMatchObject([
      { label: "Ada Lovelace", type: "profile" },
    ]);
    expect(mocks.buildSearchIndex).toHaveBeenCalledTimes(2);
  });

  it("reuses the cached index when equal corpora arrive as fresh rows", async () => {
    mocks.buildLibrary.mockReturnValue(createLibrary([], TRACERS_SUMMARY));
    // Fresh objects per read: reuse must come from row content, not identity.
    mocks.getPublicEffectArticles.mockImplementation(async () => [createEffectArticle()]);
    mocks.getPublicReports.mockImplementation(async () => [createReport()]);
    mocks.getPublicContributorProfiles.mockImplementation(async () => [createProfile()]);

    const { getPublicSearchIndex } = await import("./publicLibrary");

    const first = await getPublicSearchIndex();

    await expect(getPublicSearchIndex()).resolves.toBe(first);
    expect(mocks.buildSearchIndex).toHaveBeenCalledTimes(1);
  });

  it("separates equal-length corpora that differ only in row content", async () => {
    mocks.buildLibrary.mockReturnValue(createLibrary([], TRACERS_SUMMARY));
    mocks.getPublicEffectArticles.mockResolvedValue([createEffectArticle()]);
    mocks.getPublicReports.mockResolvedValue([createReport()]);
    mocks.getPublicContributorProfiles.mockResolvedValue([createProfile()]);

    const { getPublicSearchIndex } = await import("./publicLibrary");

    const first = await getPublicSearchIndex();

    // Every array keeps its length and every field keeps its byte count.
    mocks.getPublicEffectArticles.mockResolvedValue([
      createEffectArticle({ tags: ["haptic"] }),
    ]);
    mocks.getPublicReports.mockResolvedValue([
      createReport({ author: "Ida Lovelace" }),
    ]);
    mocks.getPublicContributorProfiles.mockResolvedValue([
      createProfile({ displayName: "Ida Lovelace" }),
    ]);

    const second = await getPublicSearchIndex();

    expect(second).not.toBe(first);
    expect(second.metadata.inputHash).not.toBe(first.metadata.inputHash);
    expect(mocks.buildSearchIndex).toHaveBeenCalledTimes(2);
  });
});
