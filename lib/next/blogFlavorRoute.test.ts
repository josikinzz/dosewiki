import { describe, expect, it } from "vitest";
import {
  SITE_FLAVOR_CONFIGS,
  isFlavorRouteEnabled,
  requireEffectIndexFlavor,
} from "../../src/config/siteFlavor";
import { getPublicRoutePath } from "../../src/utils/publicRouteIdentity";
import { FLAVOR_GATED_NOT_FOUND_PATH, isFlavorGatedRequestPath } from "./flavorGatedRoutes";
import { STATIC_PUBLIC_PATHS } from "./publicRoutePlan";
import { buildFlavorGatedSitemapPaths } from "./sitemap";

const effectindex = SITE_FLAVOR_CONFIGS.effectindex;
const dosewiki = SITE_FLAVOR_CONFIGS.dosewiki;

describe("blog flavor gating", () => {
  it("is owned by both publications, each serving its own corpus", () => {
    // dose.wiki serves the blog written in the /dev Blog tab (`kind: "blog"` rows of
    // `effectIndexArticles`); Effect Index serves the frozen `effectIndexArchive`. The
    // route id being enabled on both is what keeps the middleware from 404ing either.
    expect(isFlavorRouteEnabled("blog", effectindex)).toBe(true);
    expect(isFlavorRouteEnabled("blog", dosewiki)).toBe(true);

    // The guard itself is unchanged; the blog pages no longer call it, because the
    // route now exists on both flavors and branches on `isEffectIndex` instead.
    expect(() => requireEffectIndexFlavor(effectindex)).not.toThrow();
    expect(() => requireEffectIndexFlavor(dosewiki)).toThrow();
  });

  it("no longer gates /blog at the request boundary on either flavor", () => {
    for (const pathname of ["/blog", "/blog/", "/blog/site-updates", "/blog/a/b"]) {
      expect(isFlavorGatedRequestPath(pathname, dosewiki)).toBe(false);
      expect(isFlavorGatedRequestPath(pathname, effectindex)).toBe(false);
    }

    // The still-gated Effect Index routes prove the boundary itself is intact.
    for (const pathname of ["/donate", "/contact", "/discord"]) {
      expect(isFlavorGatedRequestPath(pathname, dosewiki)).toBe(true);
      expect(isFlavorGatedRequestPath(pathname, effectindex)).toBe(false);
    }

    // Prefix matching must not catch unrelated routes that merely start with the letters.
    for (const pathname of ["/blogging", "/blogs", "/", "/articles", "/effects/blog"]) {
      expect(isFlavorGatedRequestPath(pathname, dosewiki)).toBe(false);
      expect(isFlavorGatedRequestPath(pathname, effectindex)).toBe(false);
    }

    // The rewrite target must be unroutable: one segment would be swallowed by the
    // root-level `[slug]` catch-all and render a substance page instead of a 404.
    expect(FLAVOR_GATED_NOT_FOUND_PATH.split("/").filter(Boolean).length).toBeGreaterThan(1);
  });

  it("builds the blog paths from the shared route vocabulary", () => {
    expect(getPublicRoutePath({ family: "blog" })).toBe("/blog");
    expect(getPublicRoutePath({ family: "blogPost", params: { slug: "site-updates" } })).toBe(
      "/blog/site-updates",
    );
    // Slugs are URL-encoded like every other public route segment.
    expect(getPublicRoutePath({ family: "blogPost", params: { slug: "a b" } })).toBe("/blog/a%20b");
  });
});

describe("sitemap flavor branch", () => {
  const input = { blogPostSlugs: ["site-updates", "welcome-to-the-effect-index"] };

  // The branch also carries the four static supporting pages; this suite owns the blog
  // slice of it only (`effectIndexSupportRoutes.test.ts` owns the rest).
  const blogPaths = (...args: Parameters<typeof buildFlavorGatedSitemapPaths>) =>
    buildFlavorGatedSitemapPaths(...args).filter((path) => path.startsWith("/blog"));

  it("appends the blog index and every post slug on the Effect Index flavor", () => {
    expect(blogPaths(input, effectindex)).toEqual([
      "/blog",
      "/blog/site-updates",
      "/blog/welcome-to-the-effect-index",
    ]);
  });

  it("appends dose.wiki's own posts on the dose.wiki flavor", () => {
    // Same builder, but the slugs it is handed come from the dose.wiki corpus — see
    // `loadFlavorGatedSitemapInput`, which reads the archive only on Effect Index.
    expect(blogPaths(input, dosewiki)).toEqual([
      "/blog",
      "/blog/site-updates",
      "/blog/welcome-to-the-effect-index",
    ]);
    // And nothing but the blog: the Effect Index support pages stay gated off.
    expect(buildFlavorGatedSitemapPaths({ blogPostSlugs: [] }, dosewiki)).toEqual(["/blog"]);
  });

  it("still lists the blog index on Effect Index when the archive read returns nothing", () => {
    expect(blogPaths({ blogPostSlugs: [] }, effectindex)).toEqual(["/blog"]);
    expect(blogPaths({ blogPostSlugs: ["", "ok"] }, effectindex)).toEqual(["/blog", "/blog/ok"]);
  });

  it("keeps the flavor-gated paths out of the shared static-path list", () => {
    // Anything added to STATIC_PUBLIC_PATHS would be sitemapped on both builds, including
    // the one where the route does not exist.
    expect(STATIC_PUBLIC_PATHS).not.toContain("/blog");
    for (const path of STATIC_PUBLIC_PATHS) {
      expect(path.startsWith("/blog")).toBe(false);
    }
  });
});
