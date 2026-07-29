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
  it("passes the guard through on Effect Index and raises not-found on dose.wiki", () => {
    expect(isFlavorRouteEnabled("blog", effectindex)).toBe(true);
    expect(isFlavorRouteEnabled("blog", dosewiki)).toBe(false);

    // The blog pages call this as their first statement, so dose.wiki 404s the route.
    expect(() => requireEffectIndexFlavor(effectindex)).not.toThrow();
    expect(() => requireEffectIndexFlavor(dosewiki)).toThrow();
  });

  it("gates every /blog path at the request boundary on dose.wiki only", () => {
    // The in-page guard renders the not-found body but cannot set a 404 status on a
    // statically prerendered route, so dose.wiki served /blog as a soft 404 (HTTP 200).
    for (const pathname of ["/blog", "/blog/", "/blog/site-updates", "/blog/a/b"]) {
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

  it("appends nothing on the dose.wiki flavor", () => {
    expect(buildFlavorGatedSitemapPaths(input, dosewiki)).toEqual([]);
    // Even with posts available, the flavor that 404s the route must not advertise it.
    expect(buildFlavorGatedSitemapPaths({ blogPostSlugs: [] }, dosewiki)).toEqual([]);
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
