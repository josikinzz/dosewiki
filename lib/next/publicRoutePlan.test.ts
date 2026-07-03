import { describe, expect, it, vi } from "vitest";
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

const createFixturePlan = () =>
  buildPublicRoutePlan({
    substances: [
      { slug: "lsd", priority: "high" },
      { slug: "lsd", priority: "high" },
      { slug: "mdma", priority: "normal" },
      { slug: "low-detail", priority: "low" },
    ],
    categories: [{ key: "classic-psychedelics" }, { key: "classic-psychedelics" }],
    effects: [{ slug: "visual-drifting" }],
    reports: [{ slug: "first-trip" }],
    contributorKeys: ["Ada Lovelace", "ada@example.com", "Ada Lovelace"],
    library: {
      allSubstanceRecords: [
        {
          chemicalClasses: ["Lysergamide", "Phenethylamine", "Lysergamide"],
          psychoactiveClasses: ["Psychedelic", "Entactogen"],
        },
        {
          chemicalClasses: ["Substituted Tryptamine"],
          psychoactiveClasses: ["Psychedelic"],
        },
      ],
      mechanismSummaries: [
        { slug: "serotonin-5-ht2a", name: "5-HT2A", total: 2 },
        { slug: "dopamine", name: "Dopamine", total: 1 },
      ],
      getChemicalClassDetail: (slug: string) => {
        if (slug === "phenethylamine") {
          return null;
        }

        return { slug, label: slug, total: 1, drugs: [], type: "chemical" };
      },
      getPsychoactiveClassDetail: (slug: string) => {
        if (slug === "entactogen") {
          return null;
        }

        return { slug, label: slug, total: 1, drugs: [], type: "psychoactive" };
      },
      getMechanismDetail: (mechanismSlug: string) => {
        if (mechanismSlug === "serotonin-5-ht2a") {
          return {
            defaultQualifierKey: "primary",
            qualifiers: [
              { key: "primary", label: "Primary", total: 1, groups: [] },
              { key: "partial-agonist", label: "Partial agonist", total: 1, groups: [] },
            ],
          };
        }

        return null;
      },
    } as never,
  });

describe("public route plan", () => {
  it("centralizes static parameter shapes and matching route paths", () => {
    const plan = createFixturePlan();

    expect(plan.staticPaths).toContain("/mantras");
    expect(getPublicRouteParams(plan, "substances")).toEqual([
      { slug: "lsd" },
      { slug: "mdma" },
      { slug: "low-detail" },
    ]);
    expect(plan.families.substances.map((entry) => entry.path)).toEqual(["/lsd", "/mdma", "/low-detail"]);
    expect(getPublicRouteParams(plan, "categories")).toEqual([{ categoryKey: "classic-psychedelics" }]);
    expect(plan.families.categories.map((entry) => entry.path)).toEqual(["/category/classic-psychedelics"]);
    expect(getPublicRouteParams(plan, "effects")).toEqual([{ effectSlug: "visual-drifting" }]);
    expect(plan.families.effects.map((entry) => entry.path)).toEqual(["/effects/visual-drifting"]);
    expect(getPublicRouteParams(plan, "reports")).toEqual([{ slug: "first-trip" }]);
    expect(plan.families.reports.map((entry) => entry.path)).toEqual(["/reports/first-trip"]);
  });

  it("owns effect category routes and contributor key encoding", () => {
    const plan = createFixturePlan();

    expect(getPublicRouteParams(plan, "effectCategories")).toContainEqual({ categorySlug: "visual-effects" });
    expect(plan.families.effectCategories.map((entry) => entry.path)).toContain("/effects/category/visual-effects");
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
      { mechanismSlug: "serotonin-5-ht2a" },
      { mechanismSlug: "dopamine" },
    ]);
    expect(getPublicRouteParams(plan, "mechanismQualifiers")).toEqual([
      { mechanismSlug: "serotonin-5-ht2a", qualifierSlug: "primary" },
      { mechanismSlug: "serotonin-5-ht2a", qualifierSlug: "partial-agonist" },
    ]);
    expect(getPublicRouteSitemapPaths(plan)).toContain("/mechanism/serotonin-5-ht2a/partial-agonist");
    expect(getPublicRouteSitemapPaths(plan)).not.toContain("/mechanism/serotonin-5-ht2a/primary");
  });

  it("keeps low-priority substance routes available but out of the sitemap", () => {
    const plan = createFixturePlan();

    expect(getPublicRouteParams(plan, "substances")).toContainEqual({ slug: "low-detail" });
    expect(getPublicRouteSitemapPaths(plan)).toContain("/lsd");
    expect(getPublicRouteSitemapPaths(plan)).not.toContain("/low-detail");
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
        effectCategories: [],
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

    expect(await buildSitemapEntries()).toEqual([
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
