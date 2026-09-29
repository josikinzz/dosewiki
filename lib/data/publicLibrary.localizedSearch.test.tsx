import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { act, renderHook, waitFor } from "@testing-library/react";
import { buildSearchManifestIndex } from "../../src/data/builders/searchManifest";
import { projectLibraryInput, projectSubstanceSearchSummary } from "../../src/data/projections/substanceReadProjections";
import { createEmptyArticle } from "../../src/data/schema/defaults.generated";
import { segmentHash } from "../../scripts/translation/segment-manifest.mjs";
import type { SubstanceArticle } from "../../src/schema";

const external = vi.hoisted(() => ({
  articles: [] as Array<SubstanceArticle & { slug: string }>,
  effects: [] as Array<Record<string, unknown>>,
  translations: new Map<string, string>(),
  fullSubstanceReads: 0,
}));

// Replace database adapters and framework persistence, while exercising the
// actual public readers, library builder, locale projection and route handler.
vi.mock("./publicData.reads", () => ({
  getPublicDataReadAdapter: () => ({
    getRawSubstances: async () => external.articles.map(projectLibraryInput),
    getPublicSubstanceSearchSummaries: async () => external.articles.map(projectSubstanceSearchSummary),
    getPublicEffectSummariesBySlugs: async (slugs: string[]) => external.effects.filter((effect) => slugs.includes(String(effect.slug))),
    getPublicReportSearchSummaries: async () => [],
    getPublicSubstanceBySlug: async (slug: string) => {
      external.fullSubstanceReads += 1;
      return external.articles.find((article) => article.slug === slug) ?? null;
    },
    getPublicIndexLayoutByType: async () => null,
    getPublicEffectArticles: async () => external.effects,
    getPublicEffectBySlug: async (slug: string) =>
      external.effects.find((effect) => effect.slug === slug) ?? null,
    getPublicTripReportPreviews: async () => [],
    getPublicContributorProfiles: async () => [],
    getPublicContributorIdentities: async () => [],
  }),
}));

vi.mock("@server/postgres/runtime/backend", () => ({
  getPostgresClient: () => ({
    sql: async (query: string, [locale, hashes]: [string, string[]]) => {
      if (!query.includes('FROM "translationSegments"')) {
        throw new Error("Unexpected database read in search test");
      }
      return locale === "zh-Hans"
        ? hashes.flatMap((hash) => external.translations.has(hash)
          ? [{ hash, target: external.translations.get(hash) }]
          : [])
        : [];
    },
  }),
}));

vi.mock("next/cache", () => ({
  unstable_cache: (callback: (...args: unknown[]) => unknown) => callback,
}));

vi.mock("@server/http/nextRateLimit", () => ({
  enforceRateLimit: async () => null,
}));

vi.mock("next/navigation", () => ({
  useSelectedLayoutSegments: () => ["zh", "search"],
}));

const makeArticle = (title: string, slug: string, aliases: string[] = []): SubstanceArticle & { slug: string } => ({
  ...createEmptyArticle(),
  id: 1,
  title,
  slug,
  identification: {
    ...createEmptyArticle().identification,
    common_name: title,
    alternative_names: aliases,
  },
});

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("DATA_BACKEND", "postgres");
  vi.stubEnv("POSTGRES_POOLED_URL", "postgres://reader@127.0.0.1:5432/search_test");
  external.translations.clear();
  external.fullSubstanceReads = 0;
  external.translations.set(segmentHash("Geometry"), "几何结构");
  const article = makeArticle("Ketamine", "ketamine");
  article.subjective_effects.sensory.visual.subcategories = {
    patterns: { note: "", effects: [{ name: "Geometry", description: "" }] },
  };
  external.articles = [article];
  external.effects = [{
    slug: "geometry", name: "Geometry", summary: "Repeated visual patterns.",
    tags: [], featured: false, description_raw: "Interlocking tessellation.",
  }];
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("localized public search", () => {
  it("returns the browser's Chinese name match from the public suggestions API", async () => {
    const { getPublicSearchManifest } = await import("./publicLibrary");
    const { GET } = await import("../../src/app/api/search-suggestions/route");
    const browser = buildSearchManifestIndex(await getPublicSearchManifest("zh-Hans"));
    const response = await GET(new Request(
      "https://zh.dose.wiki/api/search-suggestions?q=几何结构&locale=zh-Hans",
    ));
    const { results } = await response.json();

    expect(browser.query("几何结构").map(({ id }) => id)).toEqual(["effect:geometry"]);
    expect(results).toEqual(browser.query("几何结构"));
  });

  it("uses explicit reviewed Chinese aliases in every locale without exposing hidden records", async () => {
    const hidden = makeArticle("Hidden medicine", "hidden-medicine", ["隐藏药物"]);
    hidden.index_categories = ["hidden"];
    const low = makeArticle("Low priority medicine", "low-medicine", ["低优先药物"]);
    low.priority = "low";
    external.articles = [
      makeArticle("Ketamine", "ketamine", ["氯胺酮"]),
      makeArticle("Caffeine", "caffeine", ["咖啡因"]),
      makeArticle("Sertraline", "sertraline", ["舍曲林"]),
      makeArticle("LSD", "lsd", ["麦角酸二乙酰胺", "麥角酸二乙醯胺"]),
      hidden,
      low,
    ];
    const { getPublicSearchManifest } = await import("./publicLibrary");
    const { GET } = await import("../../src/app/api/search-suggestions/route");
    const queries = [
      ["氯胺酮", "ketamine"],
      ["咖啡因", "caffeine"],
      ["舍曲林", "sertraline"],
      ["麦角酸二乙酰胺", "lsd"],
      ["麥角酸二乙醯胺", "lsd"],
    ];
    for (const locale of ["en", "zh-Hans"]) {
      const browser = buildSearchManifestIndex(await getPublicSearchManifest(locale));
      for (const [query, slug] of queries) {
        const response = await GET(new Request(
          `https://dose.wiki/api/search-suggestions?q=${encodeURIComponent(query)}&locale=${locale}`,
        ));
        const { results } = await response.json();
        expect(browser.query(query).map(({ id }) => id)).toEqual([`substance:${slug}`]);
        expect(results).toEqual(browser.query(query));
        expect(results[0].label).toBe(external.articles.find((article) => article.slug === slug)?.title);
      }
      for (const query of ["隐藏药物", "低优先药物"]) {
        const response = await GET(new Request(
          `https://dose.wiki/api/search-suggestions?q=${encodeURIComponent(query)}&locale=${locale}`,
        ));
        expect(browser.query(query)).toEqual([]);
        expect((await response.json()).results).toEqual([]);
      }
    }
  });

  it("renders a Chinese name match in the real localized SSR search page", async () => {
    const { default: LocalizedSearchPage } = await import("../../src/app/zh/search/page");
    const element = await LocalizedSearchPage({
      searchParams: Promise.resolve({ q: "几何结构" }),
    });
    const html = renderToStaticMarkup(element);
    expect(html).toContain('lang="zh-Hans"');
    expect(html).toContain('href="/effects/geometry"');
    expect(html).toContain("几何结构");
    expect(html).not.toContain("No matches found");
  });

  it("retains canonical English identity and server-only keyword breadth in Chinese search", async () => {
    const { getPublicSearchManifest, getPublicSearchSuggestions } = await import("./publicLibrary");
    const browser = buildSearchManifestIndex(await getPublicSearchManifest("zh-Hans"));
    expect(browser.query("Geometry")[0]).toMatchObject({
      id: "effect:geometry", label: "几何结构",
    });
    expect(await getPublicSearchSuggestions("Geometry", 20, "zh-Hans")).toEqual(browser.query("Geometry"));
    expect(browser.query("tessellation")).toEqual([]);
    expect((await getPublicSearchSuggestions("tessellation", 20, "zh-Hans")).map(({ id }) => id))
      .toEqual(["effect:geometry"]);
  });

  it("localizes exact raw summary leaves without loading full substance articles", async () => {
    external.articles[0].summary = "  An exact summary leaf [cite:1].\n";
    external.translations.set(segmentHash(external.articles[0].summary), "  精确摘要 [cite:1]。\n");
    const { getPublicSearchManifest, getPublicSearchSuggestions } = await import("./publicLibrary");
    const browser = buildSearchManifestIndex(await getPublicSearchManifest("zh-Hans"));
    const matches = await getPublicSearchSuggestions("Ketamine", 20, "zh-Hans");
    expect(matches[0]).toMatchObject({ id: "substance:ketamine", secondary: "精确摘要 。" });
    expect(browser.query("Ketamine")[0]).toMatchObject({
      id: "substance:ketamine", secondary: matches[0].secondary,
    });
    expect(external.fullSubstanceReads).toBe(0);
  });

  it.each([
    ["几何结构", "effect:geometry"],
    ["舍曲林", "substance:sertraline"],
  ])("retains %s through a delayed successful real API refinement", async (query, id) => {
    external.articles.push(makeArticle("Sertraline", "sertraline", ["舍曲林"]));
    const { GET: manifestGET } = await import("../../src/app/api/search-manifest/route");
    const { GET: suggestionsGET } = await import("../../src/app/api/search-suggestions/route");
    const { loadSearchManifestIndex } = await import("../../src/hooks/useSearchManifest");
    const { useGlobalSearchSuggestions } = await import("../../src/components/common/useGlobalSearchSuggestions");
    const { UiLocaleProvider } = await import("../../src/i18n/client");
    let resolveRefinement!: () => Promise<void>;
    let refinementStarted = false;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const request = new Request(new URL(String(input), "https://zh.dose.wiki"));
      if (request.url.includes("/api/search-manifest")) return manifestGET(request);
      if (!request.url.includes("/api/search-suggestions")) {
        throw new Error(`Unexpected fetch: ${request.url}`);
      }
      refinementStarted = true;
      return new Promise<Response>((resolve) => {
        resolveRefinement = async () => resolve(await suggestionsGET(request));
      });
    }));
    await loadSearchManifestIndex("zh-Hans");
    const { result } = renderHook(
      () => useGlobalSearchSuggestions({ isActiveSearch: true, query }),
      { wrapper: ({ children }) => <UiLocaleProvider locale="zh-Hans">{children}</UiLocaleProvider> },
    );
    expect(result.current.suggestions.map((match) => match.id)).toEqual([id]);
    expect(refinementStarted).toBe(false);
    await waitFor(() => expect(refinementStarted).toBe(true));
    expect(result.current.suggestions.map((match) => match.id)).toEqual([id]);
    await act(resolveRefinement);
    await waitFor(() => expect(result.current.isUpdatingSuggestions).toBe(false));
    expect(result.current.suggestions.map((match) => match.id)).toEqual([id]);
  });
});
