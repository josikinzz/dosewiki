import { describe, expect, it } from "vitest";
import {
  DEFAULT_PUBLIC_SITE_URL,
  PUBLIC_SITE,
  PUBLIC_LAUNCH_SITE_URL,
  buildCanonicalPath,
  buildPublicPageMetadata,
  buildPublicSitemapEntry,
  buildSiteAssetUrl,
  buildSiteUrl,
  getPublicSite,
  getPublicSiteUrl,
  getPublicRoutePath,
} from "./publicSite";
import { SITE_FLAVOR_CONFIG, SITE_FLAVOR_CONFIGS } from "../../src/config/siteFlavor";

const EFFECT_INDEX_SITE = getPublicSite(SITE_FLAVOR_CONFIGS.effectindex, {});
/**
 * The dose.wiki identity, pinned explicitly rather than read from the ambient flavor, so
 * these assertions describe dose.wiki on an Effect Index build too.
 */
const DOSEWIKI_SITE = getPublicSite(SITE_FLAVOR_CONFIGS.dosewiki, {});

describe("public site identity", () => {
  it("builds canonical and absolute URLs from one site source", () => {
    // The ambient exports track whichever flavor this build was compiled against.
    expect(PUBLIC_SITE.url).toBe(DEFAULT_PUBLIC_SITE_URL);
    expect(DEFAULT_PUBLIC_SITE_URL).toBe(SITE_FLAVOR_CONFIG.defaultSiteUrl);
    expect(PUBLIC_LAUNCH_SITE_URL).toBe(SITE_FLAVOR_CONFIG.launchSiteUrl);
    expect(buildCanonicalPath("effects/visual-drifting")).toBe("/effects/visual-drifting");
    expect(buildSiteUrl("/effects/visual-drifting", DOSEWIKI_SITE)).toBe(
      "https://dose.wiki/effects/visual-drifting",
    );
    expect(buildSiteAssetUrl("/icon-512.png", DOSEWIKI_SITE)).toBe(
      "https://dose.wiki/icon-512.png",
    );
    expect(
      buildSiteAssetUrl(
        "https://dosewiki-media.gremblinzuwu.workers.dev/media/sha256/ab/card.jpg",
        DOSEWIKI_SITE,
      ),
    ).toBe("https://dosewiki-media.gremblinzuwu.workers.dev/media/sha256/ab/card.jpg");
  });

  it("uses the launched public domain as the canonical fallback", () => {
    expect(
      getPublicSiteUrl(
        { NEXT_PUBLIC_SITE_URL: SITE_FLAVOR_CONFIGS.dosewiki.launchSiteUrl },
        SITE_FLAVOR_CONFIGS.dosewiki,
      ),
    ).toBe("https://dose.wiki");
    expect(getPublicSiteUrl({ NEXT_PUBLIC_SITE_URL: "not-a-url" }, SITE_FLAVOR_CONFIGS.dosewiki)).toBe(
      "https://dose.wiki",
    );
  });

  it("builds public route paths for representative route families", () => {
    expect(getPublicRoutePath({ family: "substance", params: { slug: "lsd" } })).toBe("/lsd");
    expect(getPublicRoutePath({ family: "effect", params: { effectSlug: "visual-drifting" } })).toBe(
      "/effects/visual-drifting",
    );
    expect(
      getPublicRoutePath({
        family: "psychoactiveSummary",
        params: { summaryPath: ["psychedelic", "visual"] },
      }),
    ).toBe("/psychoactive/psychedelic/visual");
    expect(getPublicRoutePath({ family: "report", params: { slug: "first-trip" } })).toBe("/reports/first-trip");
    expect(getPublicRoutePath({ family: "contributor", params: { profileKey: "ADA LOVELACE" } })).toBe(
      "/contributors/ada%20lovelace",
    );
    expect(
      getPublicRoutePath({
        family: "mechanismQualifier",
        params: { mechanismSlug: "serotonin-5-ht2a", qualifierSlug: "partial-agonist" },
      }),
    ).toBe("/mechanism/serotonin-5-ht2a/partial-agonist");
  });

  it("uses the same canonical contributor casing for metadata paths and public hrefs", async () => {
    const { publicHref } = await import("../../src/utils/publicHref");

    const routePath = getPublicRoutePath({
      family: "contributor",
      params: { profileKey: "Ada@Example.COM" },
    });

    expect(routePath).toBe("/contributors/ada%40example.com");
    expect(publicHref.contributor("Ada@Example.COM")).toBe(routePath);
  });

  it("builds page metadata with matching canonical, Open Graph, Twitter, and robots behavior", () => {
    const metadata = buildPublicPageMetadata({
      title: "Visual drifting",
      description: "Browse subjective effect details in dose.wiki.",
      route: { family: "effect", params: { effectSlug: "visual-drifting" } },
      noIndex: true,
    }, DOSEWIKI_SITE);

    expect(metadata.title).toBe("Visual drifting - dose.wiki");
    expect(metadata.openGraph?.title).toBe("Visual drifting - dose.wiki");
    expect(metadata.twitter?.title).toBe("Visual drifting - dose.wiki");
    expect(metadata.alternates?.canonical).toBe("https://dose.wiki/effects/visual-drifting");
    expect(metadata.openGraph?.url).toBe("https://dose.wiki/effects/visual-drifting");
    expect(metadata.openGraph?.images).toEqual([
      {
        url: "https://dose.wiki/icon-512.png",
        width: 512,
        height: 512,
        alt: "dose.wiki logo",
      },
    ]);
    expect(metadata.twitter?.images).toEqual(["https://dose.wiki/icon-512.png"]);
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });

  it("swaps in a per-page social image while keeping twitter.card as summary", () => {
    const metadata = buildPublicPageMetadata({
      title: "LSD",
      description: "LSD substance profile covering dosage, duration, and subjective effects.",
      route: { family: "substance", params: { slug: "lsd" } },
      socialImage: {
        path: "/images/social/substances/lsd.0123456789abcdef.png",
        width: 1200,
        height: 1200,
        alt: "LSD substance guide",
      },
    }, DOSEWIKI_SITE);

    expect(metadata.openGraph?.images).toEqual([
      {
        url: "https://dose.wiki/images/social/substances/lsd.0123456789abcdef.png",
        width: 1200,
        height: 1200,
        alt: "LSD substance guide",
      },
    ]);
    expect(metadata.twitter?.images).toEqual([
      "https://dose.wiki/images/social/substances/lsd.0123456789abcdef.png",
    ]);
    expect(metadata.twitter).toMatchObject({ card: "summary" });
  });

  it("emits the bare suffix as the whole title for the homepage's empty page name", () => {
    const metadata = buildPublicPageMetadata(
      { title: "", description: "Homepage.", pathname: "/" },
      DOSEWIKI_SITE,
    );

    expect(metadata.title).toBe("dose.wiki");
    expect(metadata.openGraph?.title).toBe("dose.wiki");
    expect(metadata.twitter?.title).toBe("dose.wiki");
  });

  it("keeps metadata descriptions within snippet-friendly bounds across surfaces", () => {
    const longDescription =
      "LSD substance profile covering dosage, duration, subjective effects, interactions, tolerance, harm potential, legality, references, and additional context for launch search previews.";
    const metadata = buildPublicPageMetadata({
      title: "LSD",
      description: longDescription.repeat(2),
      route: { family: "substance", params: { slug: "lsd" } },
    });

    expect(String(metadata.description).length).toBeLessThanOrEqual(180);
    expect(String(metadata.description).length).toBeGreaterThan(100);
    expect(metadata.description).toMatch(/\.\.\.$/);
    expect(metadata.openGraph?.description).toBe(metadata.description);
    expect(metadata.twitter?.description).toBe(metadata.description);
  });

  it("adds site context to very short metadata descriptions", () => {
    const metadata = buildPublicPageMetadata({
      title: "Reports",
      description: "Browse trip reports in dose.wiki.",
      route: { family: "reports" },
    });

    expect(String(metadata.description).length).toBeGreaterThanOrEqual(50);
    expect(metadata.description).toContain("route context");
    expect(metadata.openGraph?.description).toBe(metadata.description);
    expect(metadata.twitter?.description).toBe(metadata.description);
  });

  it("uses the same absolute URL source for sitemap entries", () => {
    expect(buildPublicSitemapEntry("/reports/first-trip", DOSEWIKI_SITE)).toEqual({
      url: "https://dose.wiki/reports/first-trip",
      changeFrequency: "weekly",
      priority: 0.6,
    });
  });
});

describe("public site identity under the Effect Index flavor", () => {
  it("derives the identity from the flavor config", () => {
    expect(EFFECT_INDEX_SITE).toEqual({
      flavor: "effectindex",
      name: "Effect Index",
      titleSuffix: "Effect Index",
      url: "https://effectindex.com",
      description:
        "A resource dedicated to establishing the field of formalised subjective effect documentation.",
      logoPath: "/effectindex/icon.png",
      socialCard: { path: "/effectindex/social-card.png", width: 600, height: 315 },
    });
  });

  it("lets an explicit site URL override the flavor default", () => {
    expect(
      getPublicSiteUrl({ NEXT_PUBLIC_SITE_URL: "https://preview.effectindex.com/" }, SITE_FLAVOR_CONFIGS.effectindex),
    ).toBe("https://preview.effectindex.com");
    expect(getPublicSiteUrl({}, SITE_FLAVOR_CONFIGS.effectindex)).toBe("https://effectindex.com");
    expect(getPublicSiteUrl({ NEXT_PUBLIC_SITE_URL: "not-a-url" }, SITE_FLAVOR_CONFIGS.effectindex)).toBe(
      "https://effectindex.com",
    );
  });

  it("builds canonical, Open Graph, and Twitter metadata against the Effect Index identity", () => {
    const metadata = buildPublicPageMetadata(
      {
        title: "Visual drifting",
        description:
          "Drifting is a subjective effect documented across the Subjective Effect Index with replications and references.",
        route: { family: "effect", params: { effectSlug: "visual-drifting" } },
      },
      EFFECT_INDEX_SITE,
    );

    expect(metadata.title).toBe("Visual drifting - Effect Index");
    expect(metadata.openGraph?.title).toBe("Visual drifting - Effect Index");
    expect(metadata.twitter?.title).toBe("Visual drifting - Effect Index");
    expect(metadata.alternates?.canonical).toBe("https://effectindex.com/effects/visual-drifting");
    expect(metadata.openGraph?.url).toBe("https://effectindex.com/effects/visual-drifting");
    expect(metadata.openGraph && "siteName" in metadata.openGraph ? metadata.openGraph.siteName : null).toBe(
      "Effect Index",
    );
    expect(metadata.openGraph?.images).toEqual([
      {
        url: "https://effectindex.com/effectindex/social-card.png",
        width: 600,
        height: 315,
        alt: "Effect Index logo",
      },
    ]);
    expect(metadata.twitter?.images).toEqual(["https://effectindex.com/effectindex/social-card.png"]);
  });

  it("pads short descriptions with the Effect Index name rather than dose.wiki", () => {
    const metadata = buildPublicPageMetadata(
      { title: "Reports", description: "Browse trip reports.", route: { family: "reports" } },
      EFFECT_INDEX_SITE,
    );

    expect(metadata.description).toBe(
      "Browse trip reports. Explore related Effect Index records, sources, and route context.",
    );
    expect(metadata.description).not.toContain("dose.wiki");
  });

  it("bases sitemap entries on the Effect Index origin", () => {
    expect(buildPublicSitemapEntry("/reports/first-trip", EFFECT_INDEX_SITE)).toEqual({
      url: "https://effectindex.com/reports/first-trip",
      changeFrequency: "weekly",
      priority: 0.6,
    });
    expect(buildSiteUrl("/effects", EFFECT_INDEX_SITE)).toBe("https://effectindex.com/effects");
    expect(buildSiteAssetUrl("/effectindex/icon.png", EFFECT_INDEX_SITE)).toBe(
      "https://effectindex.com/effectindex/icon.png",
    );
  });
});
