import { describe, expect, it, vi } from "vitest";
import type { PublicRoutePlan } from "./publicRoutePlan";

describe("public sitemap adapter", () => {
  it("returns absolute URLs from planned public paths", async () => {
    const plan: PublicRoutePlan = {
      staticPaths: ["/"],
      families: {
        substances: [{ path: "/lsd", params: { slug: "lsd" } }],
        categories: [],
        effects: [],
        replications: [],
        replicationArtists: [],
        articles: [],
        effectCategories: [],
        psychoactiveSummaries: [],
        reports: [
          { path: "/reports/first-trip", params: { slug: "first-trip" } },
        ],
        contributors: [],
        mechanisms: [],
        mechanismQualifiers: [],
      },
    };

    vi.doMock("./publicRoutePlan", () => ({
      getPublicRoutePlan: async () => plan,
      getPublicRouteSitemapPaths: (routePlan: PublicRoutePlan) => [
        routePlan.staticPaths[0],
        "/lsd",
        "/reports/first-trip",
      ],
    }));

    vi.doMock("@server/data/publicData", () => ({
      getPublicEffectIndexPosts: vi.fn(async () => []),
      getPublishedEffectIndexArticles: vi.fn(async () => []),
    }));

    // Load after doMock so the adapter is evaluated against the isolated route
    // plan and deterministic empty blog corpus.
    const { buildSitemapEntries } = await import("./sitemap");
    const { getPublicSite } = await import("./publicSite");
    const { SITE_FLAVOR_CONFIGS } = await import("../../src/config/siteFlavor");
    // Pinned to dose.wiki — both the site identity and the flavor config — so the
    // assertions hold on an Effect Index build too. The flavor config is what decides
    // whether the flavor-gated branch (the blog) appends anything; the flavor branch
    // itself is covered by `sitemap.flavorBranch.test.ts`.
    const dosewikiSite = getPublicSite(SITE_FLAVOR_CONFIGS.dosewiki, {});

    expect(
      await buildSitemapEntries(dosewikiSite, SITE_FLAVOR_CONFIGS.dosewiki),
    ).toEqual([
      {
        url: "https://dose.wiki/",
        changeFrequency: "daily",
        priority: 1,
      },
      {
        url: "https://dose.wiki/lsd",
        changeFrequency: "weekly",
        priority: 0.8,
      },
      {
        url: "https://dose.wiki/reports/first-trip",
        changeFrequency: "weekly",
        priority: 0.6,
      },
      // dose.wiki owns /blog now too, so the flavor-gated branch appends its index
      // even when the build has no posts yet.
      {
        url: "https://dose.wiki/blog",
        changeFrequency: "weekly",
        priority: 0.8,
      },
    ]);
  });
});
