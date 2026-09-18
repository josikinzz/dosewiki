import { beforeEach, describe, expect, it, vi } from "vitest";
import { projectLibraryInput, projectSubstanceSearchSummary } from "../../src/data/projections/substanceReadProjections";
import { fullArticleWithDosage } from "../../src/test/fixtures/articles";

vi.mock("server-only", () => ({}));
vi.mock("react", () => ({
  cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}));


const mocks = vi.hoisted(() => ({
  getRawSubstances: vi.fn(),
  getPublicEffectMembershipInput: vi.fn(),
  getIndexLayoutByType: vi.fn(),
  getPublicEffectArticles: vi.fn(),
  getPublicReports: vi.fn(),
  getPublicContributorProfiles: vi.fn(),
  buildLibrary: vi.fn(),
  buildSearchIndex: vi.fn(),
  derivedRevision: { library: "library-revision-1", search: "search-revision-1" },
  getPublicSubstanceSearchSummaries: vi.fn(),
  getPublicEffectSummariesBySlugs: vi.fn(),
  getPublicReportSearchSummaries: vi.fn(),
  getLocalizedLeaves: vi.fn(),
}));

vi.mock("./publicData", () => ({
  PUBLIC_DATA_CACHE_REVALIDATE_SECONDS: 900,
  PUBLIC_DATA_CACHE_TAGS: {
    all: "data-public",
    substances: "data-public:substances",
    layouts: "data-public:layouts",
    effects: "data-public:effects",
    reports: "data-public:reports",
    contributors: "data-public:contributors",
  },
  getRawSubstances: mocks.getRawSubstances,
  getPublicEffectMembershipInput: mocks.getPublicEffectMembershipInput,
  getIndexLayoutByType: mocks.getIndexLayoutByType,
  getPublicEffectArticles: mocks.getPublicEffectArticles,
  getPublicReports: mocks.getPublicReports,
  getPublicContributorProfiles: mocks.getPublicContributorProfiles,
  getPublicSubstanceSearchSummaries: mocks.getPublicSubstanceSearchSummaries,
  getPublicEffectSummariesBySlugs: mocks.getPublicEffectSummariesBySlugs,
  getPublicReportSearchSummaries: mocks.getPublicReportSearchSummaries,
}));

vi.mock("../translation/localizedRecords", () => ({
  getLocalizedLeaves: mocks.getLocalizedLeaves,
}));

vi.mock("./publicData.cache", async (importOriginal) => ({
  ...await importOriginal<typeof import("./publicData.cache")>(),
  getPublicDerivedCacheIdentity: vi.fn(async (identity: "library" | "search") =>
    mocks.derivedRevision[identity]),
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
    mocks.getPublicEffectMembershipInput.mockReset();
    mocks.getIndexLayoutByType.mockReset();
    mocks.buildLibrary.mockReset();
    mocks.buildSearchIndex.mockClear();
    mocks.getRawSubstances.mockResolvedValue([]);
    mocks.getPublicEffectMembershipInput.mockResolvedValue([]);
    mocks.getIndexLayoutByType.mockResolvedValue(null);
    mocks.derivedRevision.library = "library-revision-1";
    mocks.derivedRevision.search = "search-revision-1";
    mocks.getPublicReports.mockResolvedValue([]);
    mocks.getPublicEffectArticles.mockResolvedValue([]);
    mocks.getPublicContributorProfiles.mockResolvedValue([]);
  });

  // Dynamic import: this suite reloads modules after vi.resetModules so
  // process-resident caches cannot leak between cases (existing convention here).
  it("localizes long raw summaries without changing canonical substance identity", async () => {
    const rawSummary = `  First line.\n\n${"Full source text with spacing.  ".repeat(20)}`;
    const translated = "Translated full summary";
    mocks.buildLibrary.mockReturnValue(createLibrary([createRecord("LSD", "lsd", ["Acid"])]));
    mocks.getPublicSubstanceSearchSummaries.mockResolvedValue([
      projectSubstanceSearchSummary({ ...structuredClone(fullArticleWithDosage), title: "LSD", slug: "lsd", summary: rawSummary }),
    ]);
    mocks.getPublicEffectSummariesBySlugs.mockResolvedValue([]);
    mocks.getPublicReportSearchSummaries.mockResolvedValue([]);
    mocks.getLocalizedLeaves.mockImplementation(async (leaves: string[]) =>
      new Map(leaves.filter((leaf) => leaf === rawSummary).map((leaf) => [leaf, translated])),
    );
    const { getPublicSearchSuggestions } = await import("./publicLibrary");
    await expect(getPublicSearchSuggestions("acid", 5, "zh")).resolves.toMatchObject([
      { label: "LSD", type: "substance", secondary: translated },
    ]);
  });

  it("renders a selected category without unrelated manual layouts", async () => {
    mocks.getRawSubstances.mockResolvedValue([
      projectLibraryInput({ ...structuredClone(fullArticleWithDosage), slug: "lsd" }),
    ]);
    mocks.getIndexLayoutByType.mockResolvedValue({
      version: 1,
      categories: [
        { key: "psychedelic", label: "Psychedelics", iconKey: "psychedelic", drugs: ["LSD"] },
      ],
    });
    // Reload after resetModules so process-resident caches cannot leak between cases.
    const { getPublicCategoryDetail } = await import("./publicLibrary");

    const detail = await getPublicCategoryDetail("psychedelic");

    expect(detail?.definition.key).toBe("psychedelic");
    expect(detail?.groups.flatMap((group) => group.drugs.map((drug) => drug.slug))).toEqual(["lsd"]);
  });

  it("keeps a late effect membership refresh from replacing a published generation", async () => {
    const row = projectLibraryInput({ ...structuredClone(fullArticleWithDosage), slug: "lsd" });
    row.subjective_effects.cognitive = { visual: { note: "", effects: [{ name: "Tracers", description: "" }] } };
    let release!: (rows: Array<typeof row>) => void;
    const promise = new Promise<Array<typeof row>>((resolve) => { release = resolve; });
    mocks.getPublicEffectMembershipInput
      .mockReturnValueOnce(promise)
      .mockResolvedValueOnce([]);
    // Reload the module after resetModules to isolate the process-resident cache.
    const { getPublicEffectDetail, invalidatePublicDerivedDataCache } = await import("./publicLibrary");
    const stale = getPublicEffectDetail("tracers");
    const coalesced = getPublicEffectDetail("tracers");
    await vi.waitFor(() => expect(mocks.getPublicEffectMembershipInput).toHaveBeenCalledTimes(1));
    invalidatePublicDerivedDataCache({ source: "test-write", targets: [{ kind: "article", slug: "lsd", dependency: "membership" }] });
    await expect(getPublicEffectDetail("tracers")).resolves.toBeNull();
    release([row]);
    await expect(stale).resolves.toMatchObject({ definition: { total: 1 } });
    await coalesced;
    await expect(getPublicEffectDetail("tracers")).resolves.toBeNull();
    expect(mocks.getPublicEffectMembershipInput).toHaveBeenCalledTimes(2);
    expect(mocks.getRawSubstances).not.toHaveBeenCalled();
  });

  it("recovers failed effect membership reads and observes shared publication revisions", async () => {
    const row = projectLibraryInput({ ...structuredClone(fullArticleWithDosage), slug: "lsd" });
    row.subjective_effects.cognitive = { visual: { note: "", effects: [{ name: "Tracers", description: "" }] } };
    mocks.getPublicEffectMembershipInput
      .mockRejectedValueOnce(new Error("temporary membership failure"))
      .mockResolvedValueOnce([row])
      .mockResolvedValueOnce([]);
    // Reload the module after resetModules to isolate the process-resident cache.
    const { getPublicEffectDetail } = await import("./publicLibrary");
    await expect(getPublicEffectDetail("tracers")).rejects.toThrow("temporary membership failure");
    await expect(getPublicEffectDetail("tracers")).resolves.toMatchObject({ definition: { total: 1 } });
    mocks.derivedRevision.library = "library-revision-2";
    await expect(getPublicEffectDetail("tracers")).resolves.toBeNull();
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

  it("retains derived membership data for a verified detail-only article publication", async () => {
    mocks.buildLibrary.mockReturnValue(createLibrary([createRecord("LSD", "lsd")]));
    const { getPublicLibrary, invalidatePublicDerivedDataCache } = await import("./publicLibrary");

    const first = await getPublicLibrary();
    invalidatePublicDerivedDataCache({
      source: "test-write",
      targets: [{ kind: "article", slug: "lsd", dependency: "detail" }],
    });

    await expect(getPublicLibrary()).resolves.toBe(first);
    expect(mocks.buildLibrary).toHaveBeenCalledTimes(1);
  });

  it("observes a shared derived revision changed by another application instance", async () => {
    mocks.buildLibrary
      .mockReturnValueOnce(createLibrary([createRecord("LSD", "lsd")]))
      .mockReturnValueOnce(createLibrary([createRecord("MDMA", "mdma")]));
    const { getPublicLibrary } = await import("./publicLibrary");

    await expect(getPublicLibrary()).resolves.toMatchObject({
      substanceRecords: [{ slug: "lsd" }],
    });
    mocks.derivedRevision.library = "library-revision-2";
    await expect(getPublicLibrary()).resolves.toMatchObject({
      substanceRecords: [{ slug: "mdma" }],
    });
    expect(mocks.buildLibrary).toHaveBeenCalledTimes(2);
  });

  it("coalesces concurrent library refreshes and does not cache stale in-flight results", async () => {
    let releaseFirst!: (records: TestSubstanceRecord[]) => void;
    const firstRead = new Promise<TestSubstanceRecord[]>((resolve) => {
      releaseFirst = resolve;
    });
    mocks.getRawSubstances
      .mockReturnValueOnce(firstRead)
      .mockResolvedValueOnce([createRecord("MDMA", "mdma")]);
    mocks.buildLibrary
      .mockImplementationOnce(() => createLibrary([createRecord("LSD", "lsd")]))
      .mockImplementationOnce(() => createLibrary([createRecord("MDMA", "mdma")]));
    const { getPublicLibrary, invalidatePublicDerivedDataCache } = await import("./publicLibrary");

    const staleA = getPublicLibrary();
    const staleB = getPublicLibrary();
    await vi.waitFor(() => expect(mocks.getRawSubstances).toHaveBeenCalledTimes(1));
    invalidatePublicDerivedDataCache({
      source: "test-write",
      targets: [{ kind: "article", slug: "lsd", dependency: "membership" }],
    });
    releaseFirst([createRecord("LSD", "lsd")]);
    await Promise.all([staleA, staleB]);

    const fresh = await getPublicLibrary();
    expect(fresh.substanceRecords[0]?.slug).toBe("mdma");
    expect(mocks.getRawSubstances).toHaveBeenCalledTimes(2);
  });

  it("clears failed in-flight library work so a later request can recover", async () => {
    mocks.getRawSubstances
      .mockRejectedValueOnce(new Error("temporary read failure"))
      .mockResolvedValueOnce([createRecord("LSD", "lsd")]);
    mocks.buildLibrary.mockReturnValue(createLibrary([createRecord("LSD", "lsd")]));
    const { getPublicLibrary } = await import("./publicLibrary");

    await expect(getPublicLibrary()).rejects.toThrow("temporary read failure");
    await expect(getPublicLibrary()).resolves.toMatchObject({
      substanceRecords: [{ slug: "lsd" }],
    });
    expect(mocks.getRawSubstances).toHaveBeenCalledTimes(2);
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
