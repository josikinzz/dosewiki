import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  effectsIndexEmptyState,
  getCategoryRouteOutcome,
  getEffectsIndexRouteOutcome,
  getEffectCategoryRouteOutcome,
  getReportRouteOutcome,
  getReportsIndexRouteOutcome,
  getSearchEmptyState,
  getSearchRouteOutcome,
  getSubstanceRouteOutcome,
  getSubstancesLayoutRouteOutcome,
  reportsIndexEmptyState,
} from "./publicRouteOutcomes";

vi.mock("server-only", () => ({}));
vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");

  return {
    ...actual,
    cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
  };
});

const publicData = vi.hoisted(() => ({
  getPublicCategoryLayout: vi.fn(),
  getPublicDataOverview: vi.fn(),
  getPublicReports: vi.fn(),
  getPublicSubstanceLookup: vi.fn(),
  getPublicSubstances: vi.fn(),
  getPublicReportBySlug: vi.fn(),
  getPublicSubstanceBySlug: vi.fn(),
  getEffectsByCategory: vi.fn(),
  getPublicEffects: vi.fn(),
}));

const publicLibrary = vi.hoisted(() => ({
  getPublicCategoryDetail: vi.fn(),
  getPublicSearchMatches: vi.fn(),
  getPublicEffectDetail: vi.fn(),
}));

vi.mock("@server/convex/publicData", () => publicData);
vi.mock("@server/convex/publicLibrary", () => publicLibrary);

describe("public route outcomes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns substance found and not-found outcomes", async () => {
    publicData.getPublicSubstanceBySlug.mockResolvedValueOnce({
      slug: "lsd",
      title: "LSD",
      summary: "A psychedelic substance.",
    });

    await expect(getSubstanceRouteOutcome("lsd")).resolves.toMatchObject({
      route: "substance",
      state: "found",
      slug: "lsd",
      viewModel: {
        metadata: {
          title: "LSD",
          description: "A psychedelic substance.",
        },
      },
    });

    publicData.getPublicSubstanceBySlug.mockResolvedValueOnce(null);
    await expect(getSubstanceRouteOutcome("missing")).resolves.toEqual({
      route: "substance",
      state: "not-found",
      slug: "missing",
    });
  });

  it("returns category found and not-found outcomes", async () => {
    publicLibrary.getPublicCategoryDetail.mockResolvedValueOnce({
      definition: { name: "Psychedelics" },
      total: 12,
    });

    await expect(getCategoryRouteOutcome("psychedelics")).resolves.toEqual({
      route: "category",
      state: "found",
      categoryKey: "psychedelics",
      detail: {
        definition: { name: "Psychedelics" },
        total: 12,
      },
    });

    publicLibrary.getPublicCategoryDetail.mockResolvedValueOnce(null);
    await expect(getCategoryRouteOutcome("missing")).resolves.toEqual({
      route: "category",
      state: "not-found",
      categoryKey: "missing",
    });
  });

  it("returns report found and not-found outcomes", async () => {
    const substances = [{ slug: "lsd", title: "LSD" }];
    const report = { slug: "first-trip", title: "First trip" };
    publicData.getPublicReportBySlug.mockResolvedValueOnce(report);
    publicData.getPublicSubstances.mockResolvedValueOnce(substances);

    await expect(getReportRouteOutcome("first-trip")).resolves.toEqual({
      route: "report",
      state: "found",
      slug: "first-trip",
      report,
      substances,
    });

    publicData.getPublicReportBySlug.mockResolvedValueOnce(null);
    publicData.getPublicSubstances.mockResolvedValueOnce(substances);

    await expect(getReportRouteOutcome("missing")).resolves.toEqual({
      route: "report",
      state: "not-found",
      slug: "missing",
    });
  });

  it("names search ready and no-match outcomes separately", async () => {
    publicLibrary.getPublicSearchMatches.mockResolvedValueOnce([]);
    await expect(getSearchRouteOutcome("", 20)).resolves.toEqual({
      route: "search",
      state: "empty",
      query: "",
      results: [],
      emptyState: getSearchEmptyState(""),
    });

    publicLibrary.getPublicSearchMatches.mockResolvedValueOnce([]);
    await expect(getSearchRouteOutcome("not-a-match", 20)).resolves.toEqual({
      route: "search",
      state: "filtered-empty",
      query: "not-a-match",
      results: [],
      emptyState: getSearchEmptyState("not-a-match"),
    });
  });

  it("returns a found search outcome when matches exist", async () => {
    const results = [{ id: "substance:lsd", type: "substance", slug: "lsd", label: "LSD" }];
    publicLibrary.getPublicSearchMatches.mockResolvedValueOnce(results);

    await expect(getSearchRouteOutcome("lsd", 20)).resolves.toEqual({
      route: "search",
      state: "found",
      query: "lsd",
      results,
    });
  });

  it("keeps unavailable substances layout distinct from an empty valid route", async () => {
    publicData.getPublicCategoryLayout.mockResolvedValueOnce(null);
    publicData.getPublicSubstanceLookup.mockResolvedValueOnce([]);

    await expect(getSubstancesLayoutRouteOutcome()).resolves.toEqual({
      route: "substances",
      state: "unavailable",
      reason: "category-layout-unavailable",
    });
  });

  it("returns a substances layout found outcome when layout data is available", async () => {
    const layout = { groups: [] };
    const substances = [{ slug: "lsd", title: "LSD" }];
    publicData.getPublicCategoryLayout.mockResolvedValueOnce(layout);
    publicData.getPublicSubstanceLookup.mockResolvedValueOnce(substances);

    await expect(getSubstancesLayoutRouteOutcome()).resolves.toEqual({
      route: "substances",
      state: "found",
      layout,
      substances,
    });
  });

  it("keeps canonical effect category routes valid when no effects are mapped yet", async () => {
    publicData.getEffectsByCategory.mockResolvedValueOnce([]);

    await expect(getEffectCategoryRouteOutcome("visual-effects")).resolves.toEqual({
      route: "effects-category",
      state: "found",
      categorySlug: "visual-effects",
      effects: [],
    });
  });

  it("returns effect category not-found for unknown slugs", async () => {
    await expect(getEffectCategoryRouteOutcome("not-real")).resolves.toEqual({
      route: "effects-category",
      state: "not-found",
      categorySlug: "not-real",
    });
    expect(publicData.getEffectsByCategory).not.toHaveBeenCalled();
  });

  it("returns an effect category found outcome when effects exist", async () => {
    const effects = [{ slug: "visuals", name: "Visuals", tags: ["sensory"] }];
    publicData.getEffectsByCategory.mockResolvedValueOnce(effects);

    await expect(getEffectCategoryRouteOutcome("visual-effects")).resolves.toEqual({
      route: "effects-category",
      state: "found",
      categorySlug: "visual-effects",
      effects,
    });
  });

  it("returns effects index found and empty outcomes", async () => {
    publicData.getPublicDataOverview.mockResolvedValueOnce({ effectCount: 1 });
    publicData.getPublicEffects.mockResolvedValueOnce([{ slug: "visuals", name: "Visuals", tags: ["sensory"] }]);

    await expect(getEffectsIndexRouteOutcome()).resolves.toMatchObject({
      route: "effects",
      state: "found",
      viewModel: {
        pageProps: {
          effects: [{ slug: "visuals", name: "Visuals", tags: ["sensory"] }],
        },
      },
    });

    publicData.getPublicDataOverview.mockResolvedValueOnce({ effectCount: 0 });
    publicData.getPublicEffects.mockResolvedValueOnce([]);

    await expect(getEffectsIndexRouteOutcome()).resolves.toMatchObject({
      route: "effects",
      state: "empty",
      emptyState: effectsIndexEmptyState,
      viewModel: {
        pageProps: {
          effects: [],
        },
      },
    });
  });

  it("returns reports index found and empty outcomes", async () => {
    publicData.getPublicDataOverview.mockResolvedValueOnce({ reportCount: 1 });
    publicData.getPublicReports.mockResolvedValueOnce([
      {
        slug: "first-trip",
        title: "First trip",
        featured: false,
        substanceNames: ["LSD"],
        author: "Anonymous",
        tripDate: "2026-01-01",
        authorAvatarUrl: null,
        authorProfileKey: "anonymous",
      },
    ]);

    await expect(getReportsIndexRouteOutcome()).resolves.toMatchObject({
      route: "reports",
      state: "found",
      viewModel: {
        pageProps: {
          reports: [{ slug: "first-trip", title: "First trip" }],
        },
      },
    });

    publicData.getPublicDataOverview.mockResolvedValueOnce({ reportCount: 0 });
    publicData.getPublicReports.mockResolvedValueOnce([]);

    await expect(getReportsIndexRouteOutcome()).resolves.toMatchObject({
      route: "reports",
      state: "empty",
      emptyState: reportsIndexEmptyState,
      viewModel: {
        pageProps: {
          reports: [],
        },
      },
    });
  });

  it("exports reusable empty-state view models for valid empty indexes", () => {
    expect(effectsIndexEmptyState).toMatchObject({
      badge: "No effects",
      title: "No effects found",
    });
    expect(reportsIndexEmptyState).toMatchObject({
      badge: "No reports yet",
      title: "No trip reports found",
    });
  });
});
