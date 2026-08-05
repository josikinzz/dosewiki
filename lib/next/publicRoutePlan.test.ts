import { describe, expect, it, vi } from "vitest";
import {
  projectLibraryInput,
  projectLookup,
  projectMechanismRouteInput,
} from "../../convex/lib/substanceReadProjections";
import {
  parsePublicSubstanceLibraryInputRecords,
  parsePublicSubstanceRecords,
} from "../convex/publicData.substanceContract";
import { buildLibrary } from "../../src/data/builders/libraryBuilder";
import { parseManualConfig } from "../../src/data/builders/manualIndexLoader";
import type { SubstanceArticle } from "../../src/schema";
import { fullArticleWithDosage } from "../../src/test/fixtures/articles";
import {
  buildPublicRoutePlan,
  getPublicRouteParams,
  getPublicRouteSitemapPaths,
  type PublicRoutePlan,
} from "./publicRoutePlan";

vi.mock("server-only", () => ({}));
vi.mock("react", () => ({
  cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}));

const routeCacheMocks = vi.hoisted(() => ({
  unstableCache: vi.fn(
    <T extends (...args: never[]) => unknown>(
      fn: T,
      _keyParts?: string[],
      _options?: { tags?: string[] },
    ) => fn,
  ),
}));

vi.mock("next/cache", () => ({
  unstable_cache: routeCacheMocks.unstableCache,
}));

const createFixturePlan = () =>
  buildPublicRoutePlan({
    substances: [
      { slug: "lsd", priority: "high" },
      { slug: "lsd", priority: "high" },
      { slug: "mdma", priority: "normal" },
      { slug: "low-detail", priority: "low" },
      projectLookup({
        ...structuredClone(fullArticleWithDosage),
        slug: "hidden-for-now",
        priority: "hide_for_now",
      }),
    ],
    categories: [{ key: "classic-psychedelics" }, { key: "classic-psychedelics" }],
    effects: [{ slug: "visual-drifting" }],
    articles: [
      { slug: "lucid-dreaming", publication_status: "published" },
      { slug: "dxm", publication_status: "unlisted" },
    ],
    reports: [{ slug: "first-trip" }],
    contributorKeys: ["Ada Lovelace", "ada@example.com", "Ada Lovelace"],
    mechanismRouteInput: [
      {
        displayName: "Dopamine example",
        priority: "normal",
        indexCategories: [],
        mechanisms: [
          {
            label: "Dopamine",
            base: "Dopamine",
            slug: "dopamine",
          },
        ],
      },
      {
        displayName: "Serotonin example",
        priority: "normal",
        indexCategories: [],
        mechanisms: [
          {
            label: "Serotonin 5-HT2A (Primary)",
            base: "Serotonin 5-HT2A",
            slug: "serotonin-5-ht2a",
            qualifier: "Primary",
            qualifierSlug: "primary",
          },
          {
            label: "Serotonin 5-HT2A (Partial agonist)",
            base: "Serotonin 5-HT2A",
            slug: "serotonin-5-ht2a",
            qualifier: "Partial agonist",
            qualifierSlug: "partial-agonist",
          },
        ],
      },
    ],
  });

describe("public route plan", () => {
  it("data-caches the JSON-safe derived plan", () => {
    expect(routeCacheMocks.unstableCache).toHaveBeenCalledWith(
      expect.any(Function),
      ["convex-public-route-plan"],
      expect.objectContaining({
        tags: expect.arrayContaining([
          "convex-public",
          "convex-public:substances",
          "convex-public:layouts",
        ]),
      }),
    );
  });

  it("centralizes static parameter shapes and matching route paths", () => {
    const plan = createFixturePlan();

    expect(plan.staticPaths).toContain("/mantras");
    expect(plan.staticPaths).toContain("/replications");
    expect(plan.staticPaths).toContain("/replications/tutorials");
    expect(getPublicRouteParams(plan, "substances")).toEqual([
      { slug: "lsd" },
      { slug: "mdma" },
      { slug: "low-detail" },
      { slug: "hidden-for-now" },
    ]);
    expect(plan.families.substances.map((entry) => entry.path)).toEqual([
      "/lsd",
      "/mdma",
      "/low-detail",
      "/hidden-for-now",
    ]);
    expect(getPublicRouteParams(plan, "categories")).toEqual([{ categoryKey: "classic-psychedelics" }]);
    expect(plan.families.categories.map((entry) => entry.path)).toEqual(["/category/classic-psychedelics"]);
    expect(getPublicRouteParams(plan, "effects")).toEqual([{ effectSlug: "visual-drifting" }]);
    expect(plan.families.effects.map((entry) => entry.path)).toEqual(["/effects/visual-drifting"]);
    expect(getPublicRouteParams(plan, "psychoactiveSummaries")).toEqual([
      { summaryPath: ["psychedelic", "visual"] },
      { summaryPath: ["psychedelic", "cognitive"] },
      { summaryPath: ["psychedelic", "miscellaneous"] },
      { summaryPath: ["dissociative"] },
      { summaryPath: ["deliriant"] },
    ]);
    expect(
      plan.families.psychoactiveSummaries.map((entry) => entry.path),
    ).toEqual([
      "/psychoactive/psychedelic/visual",
      "/psychoactive/psychedelic/cognitive",
      "/psychoactive/psychedelic/miscellaneous",
      "/psychoactive/dissociative",
      "/psychoactive/deliriant",
    ]);
    expect(getPublicRouteParams(plan, "articles")).toEqual([
      { slug: "lucid-dreaming" },
      { slug: "dxm" },
    ]);
    expect(plan.families.articles.map((entry) => entry.path)).toEqual([
      "/articles/lucid-dreaming",
      "/articles/dxm",
    ]);
    expect(getPublicRouteParams(plan, "reports")).toEqual([{ slug: "first-trip" }]);
    expect(plan.families.reports.map((entry) => entry.path)).toEqual(["/reports/first-trip"]);
  });

  it("owns effect category routes and contributor key encoding", () => {
    const plan = createFixturePlan();

    expect(getPublicRouteParams(plan, "effectCategories")).toContainEqual({ categorySlug: "visual-effects" });
    expect(plan.families.effectCategories.map((entry) => entry.path)).toContain("/effects/category/visual-effects");
    expect(getPublicRouteSitemapPaths(plan)).toEqual(
      expect.arrayContaining([
        "/psychoactive/psychedelic/visual",
        "/psychoactive/psychedelic/cognitive",
        "/psychoactive/psychedelic/miscellaneous",
        "/psychoactive/dissociative",
        "/psychoactive/deliriant",
      ]),
    );
    expect(getPublicRouteParams(plan, "contributors")).toEqual([
      { profileKey: "ada%20lovelace" },
      { profileKey: "ada%40example.com" },
    ]);
    expect(plan.families.contributors.map((entry) => entry.path)).toEqual([
      "/contributors/ada%20lovelace",
      "/contributors/ada%40example.com",
    ]);
  });

  it("keeps mechanism default qualifiers available for static params but out of sitemap paths", () => {
    const plan = createFixturePlan();

    expect(getPublicRouteParams(plan, "mechanisms")).toEqual([
      { mechanismSlug: "dopamine" },
      { mechanismSlug: "serotonin-5-ht2a" },
    ]);
    expect(getPublicRouteParams(plan, "mechanismQualifiers")).toEqual([
      { mechanismSlug: "dopamine", qualifierSlug: "unqualified" },
      { mechanismSlug: "serotonin-5-ht2a", qualifierSlug: "partial-agonist" },
      { mechanismSlug: "serotonin-5-ht2a", qualifierSlug: "primary" },
    ]);
    expect(getPublicRouteSitemapPaths(plan)).toContain("/mechanism/serotonin-5-ht2a/primary");
    expect(getPublicRouteSitemapPaths(plan)).not.toContain("/mechanism/serotonin-5-ht2a/partial-agonist");
  });

  it("keeps direct-URL-only substance routes available but out of the sitemap", () => {
    const plan = createFixturePlan();

    expect(getPublicRouteParams(plan, "substances")).toContainEqual({ slug: "low-detail" });
    expect(getPublicRouteParams(plan, "substances")).toContainEqual({ slug: "hidden-for-now" });
    expect(getPublicRouteSitemapPaths(plan)).toContain("/lsd");
    expect(getPublicRouteSitemapPaths(plan)).not.toContain("/low-detail");
    expect(getPublicRouteSitemapPaths(plan)).not.toContain("/hidden-for-now");
  });

  it("keeps unlisted article routes available for static params but out of advertised paths", () => {
    const plan = createFixturePlan();

    expect(plan.staticPaths).toContain("/articles");
    expect(getPublicRouteParams(plan, "articles")).toContainEqual({ slug: "dxm" });
    expect(getPublicRouteSitemapPaths(plan)).toContain("/articles/lucid-dreaming");
    expect(getPublicRouteSitemapPaths(plan)).not.toContain("/articles/dxm");
  });
});

describe("mechanism route projection parity", () => {
  const createMechanismArticle = (
    id: number,
    title: string,
    mechanismTags: string[],
    overrides: Partial<SubstanceArticle> = {},
  ): SubstanceArticle => ({
    ...structuredClone(fullArticleWithDosage),
    id,
    title,
    priority: "normal",
    index_categories: [],
    identification: {
      ...structuredClone(fullArticleWithDosage.identification),
      common_name: title,
    },
    pharmacology: {
      ...structuredClone(fullArticleWithDosage.pharmacology),
      binding_sites: mechanismTags.map((tag) => ({
        target: tag,
        tag,
      })),
    },
    ...overrides,
  });

  it("matches the real library's ordered mechanism and qualifier route entries", () => {
    const articles = [
      createMechanismArticle(1, "Zeta example", [
        "Zeta receptor (beta)",
        "Zeta receptor",
      ]),
      createMechanismArticle(2, "Alpha example", [
        "Alpha target (partial agonist)",
        "Alpha target (full agonist)",
      ]),
      createMechanismArticle(3, "Hidden example", ["Hidden target"], {
        index_categories: ["Hidden!"],
      }),
      createMechanismArticle(4, "Low example", ["Low target"], {
        priority: "low",
      }),
      createMechanismArticle(5, "Obscure example", ["Obscure target"], {
        index_categories: ["Obscure!"],
      }),
      createMechanismArticle(6, "", ["Nameless target"], {
        identification: {
          ...structuredClone(fullArticleWithDosage.identification),
          common_name: "",
          substitutive_name: "",
          iupac_name: "",
        },
      }),
    ];
    const emptyConfig = parseManualConfig({
      version: 1,
      categories: [
        {
          key: "miscellaneous",
          label: "Miscellaneous",
          iconKey: "miscellaneous",
          drugs: [],
          sections: [],
        },
      ],
    });
    const library = buildLibrary(articles, {
      psychoactive: emptyConfig,
      chemical: emptyConfig,
      mechanism: emptyConfig,
    });

    const libraryMechanisms = library.mechanismSummaries.map(
      ({ slug: mechanismSlug }) => ({
        path: `/mechanism/${mechanismSlug}`,
        params: { mechanismSlug },
        includeInSitemap: undefined,
      }),
    );
    const libraryQualifiers = library.mechanismSummaries.flatMap(
      ({ slug: mechanismSlug }) => {
        const detail = library.getMechanismDetail(mechanismSlug);
        return (detail?.qualifiers ?? []).map(({ key: qualifierSlug }) => ({
          path: `/mechanism/${mechanismSlug}/${qualifierSlug}`,
          params: { mechanismSlug, qualifierSlug },
          includeInSitemap:
            qualifierSlug !== detail?.defaultQualifierKey,
        }));
      },
    );

    const projectedPlan = buildPublicRoutePlan({
      substances: [],
      categories: [],
      effects: [],
      articles: [],
      reports: [],
      contributorKeys: [],
      mechanismRouteInput: articles.map(projectMechanismRouteInput),
    });
    const projectedMechanisms = projectedPlan.families.mechanisms.map(
      (entry) => ({
        ...entry,
        includeInSitemap: entry.includeInSitemap,
      }),
    );

    expect(projectedMechanisms).toEqual(libraryMechanisms);
    expect(projectedPlan.families.mechanismQualifiers).toEqual(
      libraryQualifiers,
    );
  });

  it("canonicalizes legacy-only pharmacology consistently across library and route paths", () => {
    const {
      binding_sites: _canonicalBindingSites,
      ...legacyOnlyPharmacology
    } = structuredClone(fullArticleWithDosage.pharmacology);
    const legacyOnlyArticle = {
      ...createMechanismArticle(7, "Legacy-only example", []),
      slug: "legacy-only-example",
      pharmacology: {
        ...legacyOnlyPharmacology,
        mechanism_of_action: ["Dopamine releaser"],
        receptor_binding: { DAT: "releasing agent" },
        metabolism: "Hepatic metabolism.",
      },
    } as unknown as SubstanceArticle & {
      slug: string;
      pharmacology: SubstanceArticle["pharmacology"] & {
        mechanism_of_action: string[];
        receptor_binding: Record<string, string>;
        metabolism: string;
      };
    };
    const configs = {
      psychoactive: parseManualConfig({
        version: 1,
        categories: [
          {
            key: "miscellaneous",
            label: "Miscellaneous",
            iconKey: "miscellaneous",
            drugs: [],
            sections: [],
          },
        ],
      }),
      chemical: parseManualConfig({
        version: 1,
        categories: [
          {
            key: "miscellaneous",
            label: "Miscellaneous",
            iconKey: "miscellaneous",
            drugs: [],
            sections: [],
          },
        ],
      }),
      mechanism: parseManualConfig({
        version: 1,
        categories: [
          {
            key: "miscellaneous",
            label: "Miscellaneous",
            iconKey: "miscellaneous",
            drugs: [],
            sections: [],
          },
        ],
      }),
    };
    const fullArticles = parsePublicSubstanceRecords([legacyOnlyArticle]);
    const slimArticles = parsePublicSubstanceLibraryInputRecords([
      projectLibraryInput(legacyOnlyArticle),
    ]);
    const fullMechanisms = buildLibrary(
      fullArticles,
      configs,
    ).mechanismSummaries;
    const slimMechanisms = buildLibrary(
      slimArticles,
      configs,
    ).mechanismSummaries;
    const routePlan = buildPublicRoutePlan({
      substances: [],
      categories: [],
      effects: [],
      articles: [],
      reports: [],
      contributorKeys: [],
      mechanismRouteInput: [projectMechanismRouteInput(legacyOnlyArticle)],
    });

    expect(fullArticles[0]?.pharmacology).not.toHaveProperty(
      "mechanism_of_action",
    );
    expect(fullArticles[0]?.pharmacology.binding_sites).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ tag: "Dopamine releaser" }),
      ]),
    );
    expect(slimMechanisms).toEqual(fullMechanisms);
    expect(routePlan.families.mechanisms).toEqual(
      fullMechanisms.map(({ slug: mechanismSlug }) => ({
        path: `/mechanism/${mechanismSlug}`,
        params: { mechanismSlug },
      })),
    );
    expect(fullMechanisms).toEqual([
      { name: "Dopamine releaser", slug: "dopamine-releaser", total: 1 },
    ]);
  });
});

describe("public sitemap adapter", () => {
  it("returns absolute URLs from planned public paths", async () => {
    const plan: PublicRoutePlan = {
      staticPaths: ["/"],
      families: {
        substances: [{ path: "/lsd", params: { slug: "lsd" } }],
        categories: [],
        effects: [],
        articles: [],
        effectCategories: [],
        psychoactiveSummaries: [],
        reports: [{ path: "/reports/first-trip", params: { slug: "first-trip" } }],
        contributors: [],
        mechanisms: [],
        mechanismQualifiers: [],
      },
    };

    vi.doMock("./publicRoutePlan", () => ({
      getPublicRoutePlan: async () => plan,
      getPublicRouteSitemapPaths: (routePlan: PublicRoutePlan) => [routePlan.staticPaths[0], "/lsd", "/reports/first-trip"],
    }));

    const { buildSitemapEntries } = await import("./sitemap");
    const { getPublicSite } = await import("./publicSite");
    const { SITE_FLAVOR_CONFIGS } = await import("../../src/config/siteFlavor");
    // Pinned to dose.wiki — both the site identity and the flavor config — so the
    // assertions hold on an Effect Index build too. The flavor config is what decides
    // whether the flavor-gated branch (the blog) appends anything; the flavor branch
    // itself is covered by `blogFlavorRoute.test.ts`.
    const dosewikiSite = getPublicSite(SITE_FLAVOR_CONFIGS.dosewiki, {});

    expect(await buildSitemapEntries(dosewikiSite, SITE_FLAVOR_CONFIGS.dosewiki)).toEqual([
      {
        url: "https://dosewiki-admin.vercel.app/",
        changeFrequency: "daily",
        priority: 1,
      },
      {
        url: "https://dosewiki-admin.vercel.app/lsd",
        changeFrequency: "weekly",
        priority: 0.8,
      },
      {
        url: "https://dosewiki-admin.vercel.app/reports/first-trip",
        changeFrequency: "weekly",
        priority: 0.6,
      },
    ]);
  });
});
