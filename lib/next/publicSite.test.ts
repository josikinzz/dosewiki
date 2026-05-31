import { describe, expect, it } from "vitest";
import {
  PUBLIC_SITE,
  buildCanonicalPath,
  buildPublicPageMetadata,
  buildPublicSitemapEntry,
  buildSiteAssetUrl,
  buildSiteUrl,
  getPublicRoutePath,
} from "./publicSite";

describe("public site identity", () => {
  it("builds canonical and absolute URLs from one site source", () => {
    expect(PUBLIC_SITE.url).toBe("https://dose.wiki");
    expect(buildCanonicalPath("effects/visual-drifting")).toBe("/effects/visual-drifting");
    expect(buildSiteUrl("/effects/visual-drifting")).toBe("https://dose.wiki/effects/visual-drifting");
    expect(buildSiteAssetUrl("/icon-512.png")).toBe("https://dose.wiki/icon-512.png");
  });

  it("builds public route paths for representative route families", () => {
    expect(getPublicRoutePath({ family: "substance", params: { slug: "lsd" } })).toBe("/lsd");
    expect(getPublicRoutePath({ family: "effect", params: { effectSlug: "visual-drifting" } })).toBe(
      "/effects/visual-drifting",
    );
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
    });

    expect(metadata.alternates?.canonical).toBe("/effects/visual-drifting");
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

  it("uses the same absolute URL source for sitemap entries", () => {
    expect(buildPublicSitemapEntry("/reports/first-trip")).toEqual({
      url: "https://dose.wiki/reports/first-trip",
      changeFrequency: "weekly",
      priority: 0.6,
    });
  });
});
