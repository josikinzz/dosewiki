import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("react", () => ({
  cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}));

const mocks = vi.hoisted(() => ({
  getRawSubstances: vi.fn(),
  getIndexLayoutByType: vi.fn(),
  buildLibrary: vi.fn(),
  buildSearchIndex: vi.fn(),
}));

vi.mock("./publicData", () => ({
  getRawSubstances: mocks.getRawSubstances,
  getIndexLayoutByType: mocks.getIndexLayoutByType,
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
    mocks.getRawSubstances.mockReset();
    mocks.getIndexLayoutByType.mockReset();
    mocks.buildLibrary.mockReset();
    mocks.buildSearchIndex.mockClear();
    mocks.getRawSubstances.mockResolvedValue([]);
    mocks.getIndexLayoutByType.mockResolvedValue(null);
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
});
