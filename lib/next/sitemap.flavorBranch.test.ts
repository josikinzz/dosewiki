import { describe, expect, it } from "vitest";
import { SITE_FLAVOR_CONFIGS } from "../../src/config/siteFlavor";
import { getPublicRoutePath } from "../../src/utils/publicRouteIdentity";
import { STATIC_PUBLIC_PATHS } from "./publicRoutePlan";
import { buildFlavorGatedSitemapPaths } from "./sitemap";

const effectindex = SITE_FLAVOR_CONFIGS.effectindex;
const dosewiki = SITE_FLAVOR_CONFIGS.dosewiki;

const SUPPORT_PATHS = [
  "/donate",
  "/contact",
  "/discord",
  "/copyright-disclaimer",
  "/documentation-style-guide",
];
const FLAVOR_GATED_PATHS = ["/blog", ...SUPPORT_PATHS];

describe("buildFlavorGatedSitemapPaths", () => {
  const input = { blogPostSlugs: ["site-updates", "welcome-to-the-effect-index"] };

  it("lists the blog index, every post, and every support page on Effect Index", () => {
    expect(buildFlavorGatedSitemapPaths(input, effectindex)).toEqual([
      "/blog",
      "/blog/site-updates",
      "/blog/welcome-to-the-effect-index",
      ...SUPPORT_PATHS,
    ]);
  });

  it("lists only the blog on dose.wiki", () => {
    expect(buildFlavorGatedSitemapPaths(input, dosewiki)).toEqual([
      "/blog",
      "/blog/site-updates",
      "/blog/welcome-to-the-effect-index",
    ]);
    expect(buildFlavorGatedSitemapPaths({ blogPostSlugs: [] }, dosewiki)).toEqual(["/blog"]);
  });

  it("keeps the blog index when there are no posts and skips blank slugs", () => {
    expect(
      buildFlavorGatedSitemapPaths({ blogPostSlugs: ["", "ok"] }, effectindex).filter((path) =>
        path.startsWith("/blog"),
      ),
    ).toEqual(["/blog", "/blog/ok"]);
  });

  it("builds every path from the shared route vocabulary", () => {
    expect(getPublicRoutePath({ family: "blog" })).toBe("/blog");
    expect(getPublicRoutePath({ family: "blogPost", params: { slug: "a b" } })).toBe("/blog/a%20b");
    expect(getPublicRoutePath({ family: "donate" })).toBe("/donate");
    expect(getPublicRoutePath({ family: "contact" })).toBe("/contact");
    expect(getPublicRoutePath({ family: "discord" })).toBe("/discord");
    expect(getPublicRoutePath({ family: "copyrightDisclaimer" })).toBe("/copyright-disclaimer");
    expect(getPublicRoutePath({ family: "documentationStyleGuide" })).toBe(
      "/documentation-style-guide",
    );
  });

  it("keeps every flavor-gated path out of the static list both builds sitemap", () => {
    for (const path of FLAVOR_GATED_PATHS) {
      expect(STATIC_PUBLIC_PATHS, path).not.toContain(path);
    }
    for (const path of STATIC_PUBLIC_PATHS) {
      expect(path.startsWith("/blog"), path).toBe(false);
    }
  });
});
