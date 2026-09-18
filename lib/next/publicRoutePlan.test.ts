import { describe, expect, it, vi } from "vitest";
import { projectLookup } from "../../src/data/projections/substanceReadProjections";
import { fullArticleWithDosage } from "../../src/test/fixtures/articles";
import {
  buildPublicRoutePlan,
  getPublicRouteParams,
  getPublicRouteSitemapPaths,
} from "./publicRoutePlan";

vi.mock("server-only", () => ({}));
vi.mock("react", () => ({
  cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}));

vi.mock("next/cache", () => ({
  unstable_cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}));

const createFixturePlan = () =>
  buildPublicRoutePlan({
    substances: [
      { slug: "lsd", priority: "high" },
      { slug: "lsd", priority: "high" },
      { slug: "mdma", priority: "normal" },
      { slug: "lean", priority: "high" },
      { slug: "low-detail", priority: "low" },
      projectLookup({
        ...structuredClone(fullArticleWithDosage),
        slug: "hidden-for-now",
        priority: "hide_for_now",
      }),
    ],
    categories: [
      { key: "classic-psychedelics" },
      { key: "classic-psychedelics" },
    ],
    effects: [
      { slug: "visual-drifting" },
      { slug: "category" },
      { slug: "group" },
    ],
    replications: [
      {
        slug: "tree-bark-chelsea-morgan",
        url: "https://example.test/tree-bark.jpg",
      },
      {
        slug: "tree-bark-chelsea-morgan",
        url: "https://example.test/tree-bark.jpg",
      },
      { slug: "no-asset-yet", url: null },
      { slug: "audio", url: "https://example.test/shadow.jpg" },
    ],
    galleryReplications: [
      {
        url: "https://example.test/tree-bark.jpg",
        artist: "Chelsea Morgan",
        effect_slug: "tree-bark-texture",
      },
      // Same artist under a differently-cased credit line: one key, not two.
      {
        url: "https://example.test/wave.mp4",
        artist: "chelsea morgan",
        effect_slug: "visual-drifting",
      },
      // No resolved asset → the gallery never shows it → no focus URL.
      { url: null, artist: "Ghost", effect_slug: "ghost-effect" },
      {
        url: "https://example.test/anon.jpg",
        artist: "",
        effect_slug: "visual-drifting",
      },
    ],
    articles: [
      { slug: "lucid-dreaming", publication_status: "published" },
      { slug: "dxm", publication_status: "unlisted" },
    ],
    reports: [
      { slug: "first-trip" },
      { slug: "submit" },
      { slug: "group" },
    ],
    contributorDirectory: [
      { key: "Ada Lovelace", displayName: "Ada Lovelace", aliases: [] },
      { key: "ada@example.com", displayName: "Ada", aliases: [] },
      { key: "Ada Lovelace", displayName: "Ada Lovelace", aliases: [] },
      // Claims the credited artist below, so her /contributors page forwards
      // to the Artist Page and leaves the sitemap.
      { key: "CHELSEA", displayName: "Chelsea Morgan", aliases: [] },
    ],
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
  it("keeps blog rows off the article routes", () => {
    // `effectIndexArticles` holds both families. A blog post is served from
    // /blog/<slug>, so prerendering it at /articles/<slug> would publish the same
    // post at two URLs — and, with `dynamicParams = false` on both, bake the wrong
    // one. A row with no `kind` is an article, which is every legacy import.
    const plan = buildPublicRoutePlan({
      substances: [],
      categories: [],
      effects: [],
      replications: [],
      galleryReplications: [],
      articles: [
        { slug: "legacy-import", publication_status: "published" },
        {
          slug: "new-article",
          publication_status: "published",
          kind: "article",
        },
        { slug: "a-blog-post", publication_status: "published", kind: "blog" },
      ],
      reports: [],
      contributorDirectory: [],
      mechanismRouteInput: [],
    });

    expect(getPublicRouteParams(plan, "articles")).toEqual([
      { slug: "legacy-import" },
      { slug: "new-article" },
    ]);
    expect(
      plan.families.articles.some((entry) =>
        entry.path.includes("a-blog-post"),
      ),
    ).toBe(false);
  });


  it("centralizes static parameter shapes and matching route paths", () => {
    const plan = createFixturePlan();

    expect(plan.staticPaths).not.toContain("/mantras");
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
    expect(plan.families.substances.map((entry) => entry.path)).not.toContain(
      "/lean",
    );
    expect(getPublicRouteParams(plan, "categories")).toEqual([
      { categoryKey: "classic-psychedelics" },
    ]);
    expect(plan.families.categories.map((entry) => entry.path)).toEqual([
      "/category/classic-psychedelics",
    ]);
    expect(getPublicRouteParams(plan, "effects")).toEqual([
      { effectSlug: "visual-drifting" },
    ]);
    expect(plan.families.effects.map((entry) => entry.path)).toEqual([
      "/effects/visual-drifting",
    ]);
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
    expect(getPublicRouteParams(plan, "reports")).toEqual([
      { slug: "first-trip" },
    ]);
    expect(plan.families.reports.map((entry) => entry.path)).toEqual([
      "/reports/first-trip",
    ]);
  });

  it("routes replications with a resolved asset, dropping duplicates and reserved slugs", () => {
    const plan = createFixturePlan();

    // "no-asset-yet" would be a permalink to a broken image; "audio" would shadow
    // the static /replications/audio page.
    expect(getPublicRouteParams(plan, "replications")).toEqual([
      { slug: "tree-bark-chelsea-morgan" },
    ]);
    expect(plan.families.replications.map((entry) => entry.path)).toEqual([
      "/replications/tree-bark-chelsea-morgan",
    ]);
    expect(getPublicRouteSitemapPaths(plan)).toContain(
      "/replications/tree-bark-chelsea-morgan",
    );
  });

  it("derives focused artist routes from the displayable gallery feed", () => {
    const plan = createFixturePlan();

    // The visible corpus has one credited artist plus an unattributed row;
    // unresolved assets and former effect playlist paths are not advertised.
    expect(getPublicRouteParams(plan, "replicationArtists")).toEqual([
      { key: "chelsea-morgan" },
      { key: "unknown" },
    ]);
    expect(plan.families.replicationArtists.map((entry) => entry.path)).toEqual(
      ["/replications/artist/chelsea-morgan", "/replications/artist/unknown"],
    );
    expect(getPublicRouteSitemapPaths(plan)).toEqual(
      expect.arrayContaining([
        "/replications/artist/chelsea-morgan",
        "/replications/artist/unknown",
      ]),
    );
    expect(getPublicRouteSitemapPaths(plan)).not.toContain(
      "/replications/effect/tree-bark-texture",
    );
  });

  it("owns effect category routes and contributor key encoding", () => {
    const plan = createFixturePlan();

    expect(getPublicRouteParams(plan, "effectCategories")).toContainEqual({
      categorySlug: "visual-effects",
    });
    expect(plan.families.effectCategories.map((entry) => entry.path)).toContain(
      "/effects/category/visual-effects",
    );
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
      { profileKey: "chelsea" },
    ]);
    expect(plan.families.contributors.map((entry) => entry.path)).toEqual([
      "/contributors/ada%20lovelace",
      "/contributors/ada%40example.com",
      "/contributors/chelsea",
    ]);
    // Chelsea's profile claims the credited artist, so /contributors/chelsea
    // permanently forwards to /replications/artist/chelsea-morgan: it still
    // prerenders (a fast 301) but the sitemap advertises only the Artist Page.
    const sitemapPaths = getPublicRouteSitemapPaths(plan);
    expect(sitemapPaths).toContain("/contributors/ada%20lovelace");
    expect(sitemapPaths).toContain("/replications/artist/chelsea-morgan");
    expect(sitemapPaths).not.toContain("/contributors/chelsea");
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
    expect(getPublicRouteSitemapPaths(plan)).toContain(
      "/mechanism/serotonin-5-ht2a/primary",
    );
    expect(getPublicRouteSitemapPaths(plan)).not.toContain(
      "/mechanism/serotonin-5-ht2a/partial-agonist",
    );
  });

  it("keeps direct-URL-only substance routes available but out of the sitemap", () => {
    const plan = createFixturePlan();

    expect(getPublicRouteParams(plan, "substances")).toContainEqual({
      slug: "low-detail",
    });
    expect(getPublicRouteParams(plan, "substances")).toContainEqual({
      slug: "hidden-for-now",
    });
    expect(getPublicRouteSitemapPaths(plan)).toContain("/lsd");
    expect(getPublicRouteSitemapPaths(plan)).not.toContain("/low-detail");
    expect(getPublicRouteSitemapPaths(plan)).not.toContain("/hidden-for-now");
  });

  it("keeps unlisted article routes available for static params but out of advertised paths", () => {
    const plan = createFixturePlan();

    expect(plan.staticPaths).toContain("/articles");
    expect(getPublicRouteParams(plan, "articles")).toContainEqual({
      slug: "dxm",
    });
    expect(getPublicRouteSitemapPaths(plan)).toContain(
      "/articles/lucid-dreaming",
    );
    expect(getPublicRouteSitemapPaths(plan)).not.toContain("/articles/dxm");
  });
});
