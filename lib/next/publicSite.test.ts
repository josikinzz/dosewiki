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
  getPublicSiteUrl,
  getPublicRoutePath,
} from "./publicSite";

describe("public site identity", () => {
  it("builds canonical and absolute URLs from one site source", () => {
    expect(PUBLIC_SITE.url).toBe(DEFAULT_PUBLIC_SITE_URL);
    expect(buildCanonicalPath("effects/visual-drifting")).toBe("/effects/visual-drifting");
    expect(buildSiteUrl("/effects/visual-drifting")).toBe(
      "https://dosewiki-admin.vercel.app/effects/visual-drifting",
    );
    expect(buildSiteAssetUrl("/icon-512.png")).toBe("https://dosewiki-admin.vercel.app/icon-512.png");
  });

  it("allows launch deployments to opt into the public domain canonical base", () => {
    expect(getPublicSiteUrl({ NEXT_PUBLIC_SITE_URL: PUBLIC_LAUNCH_SITE_URL })).toBe("https://dose.wiki");
    expect(getPublicSiteUrl({ NEXT_PUBLIC_SITE_URL: "not-a-url" })).toBe(DEFAULT_PUBLIC_SITE_URL);
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
    });

    expect(metadata.alternates?.canonical).toBe("https://dosewiki-admin.vercel.app/effects/visual-drifting");
    expect(metadata.openGraph?.url).toBe("https://dosewiki-admin.vercel.app/effects/visual-drifting");
    expect(metadata.openGraph?.images).toEqual([
      {
        url: "https://dosewiki-admin.vercel.app/icon-512.png",
        width: 512,
        height: 512,
        alt: "dose.wiki logo",
      },
    ]);
    expect(metadata.twitter?.images).toEqual(["https://dosewiki-admin.vercel.app/icon-512.png"]);
    expect(metadata.robots).toEqual({ index: false, follow: false });
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
    expect(buildPublicSitemapEntry("/reports/first-trip")).toEqual({
      url: "https://dosewiki-admin.vercel.app/reports/first-trip",
      changeFrequency: "weekly",
      priority: 0.6,
    });
  });
});
