import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";
import {
  SITE_FLAVOR_CONFIGS,
  isFlavorRouteEnabled,
  requireEffectIndexFlavor,
  type FlavorGatedRoute,
} from "../../src/config/siteFlavor";
import { getPublicRoutePath } from "../../src/utils/publicRouteIdentity";
import {
  EFFECT_INDEX_DISCORD_INVITE_URL,
  effectIndexLegacyRedirects,
} from "./effectIndexLegacyRedirects";
import { isFlavorGatedRequestPath } from "./flavorGatedRoutes";
import { STATIC_PUBLIC_PATHS } from "./publicRoutePlan";
import { buildFlavorGatedSitemapPaths } from "./sitemap";

const effectindex = SITE_FLAVOR_CONFIGS.effectindex;
const dosewiki = SITE_FLAVOR_CONFIGS.dosewiki;

/** The four supporting pages, paired with the route id each page's guard asks about. */
const SUPPORT_PAGES: readonly { route: FlavorGatedRoute; path: string }[] = [
  { route: "donate", path: "/donate" },
  { route: "contact", path: "/contact" },
  { route: "discord", path: "/discord" },
  { route: "copyrightDisclaimer", path: "/copyright-disclaimer" },
];

describe("Effect Index supporting page routes", () => {
  it("builds each path from the shared route vocabulary", () => {
    expect(getPublicRoutePath({ family: "donate" })).toBe("/donate");
    expect(getPublicRoutePath({ family: "contact" })).toBe("/contact");
    expect(getPublicRoutePath({ family: "discord" })).toBe("/discord");
    expect(getPublicRoutePath({ family: "copyrightDisclaimer" })).toBe("/copyright-disclaimer");
  });

  it("enables every supporting route on Effect Index and none on dose.wiki", () => {
    for (const { route } of SUPPORT_PAGES) {
      expect(isFlavorRouteEnabled(route, effectindex)).toBe(true);
      expect(isFlavorRouteEnabled(route, dosewiki)).toBe(false);
    }

    // The guard each page calls as its first statement.
    expect(() => requireEffectIndexFlavor(effectindex)).not.toThrow();
    expect(() => requireEffectIndexFlavor(dosewiki)).toThrow();
  });

  it("gates each path at the request boundary on dose.wiki only", () => {
    for (const { path } of SUPPORT_PAGES) {
      for (const pathname of [path, `${path}/`, `${path}/anything`]) {
        expect(isFlavorGatedRequestPath(pathname, dosewiki)).toBe(true);
        expect(isFlavorGatedRequestPath(pathname, effectindex)).toBe(false);
      }
    }
  });

  it("does not gate paths that merely start with the same letters", () => {
    // `/discord-chat` is a legacy redirect, not part of the `/discord` route.
    for (const pathname of ["/discord-chat", "/donations", "/contacts", "/copyright"]) {
      expect(isFlavorGatedRequestPath(pathname, dosewiki)).toBe(false);
      expect(isFlavorGatedRequestPath(pathname, effectindex)).toBe(false);
    }
  });
});

describe("the documentation style guide route", () => {
  const path = "/documentation-style-guide";

  it("builds its path from the shared route vocabulary", () => {
    expect(getPublicRoutePath({ family: "documentationStyleGuide" })).toBe(path);
  });

  it("is gated at the request boundary on dose.wiki only", () => {
    // Gated on the flavor rather than on a FlavorGatedRoute id: the page's only audience is
    // Effect Index, and `FlavorGatedRoute` lives in a config this change does not own.
    for (const pathname of [path, `${path}/`, `${path}/anything`]) {
      expect(isFlavorGatedRequestPath(pathname, dosewiki)).toBe(true);
      expect(isFlavorGatedRequestPath(pathname, effectindex)).toBe(false);
    }
  });

  it("does not gate a path that merely starts with the same letters", () => {
    expect(isFlavorGatedRequestPath("/documentation-style-guides", dosewiki)).toBe(false);
  });

  it("is listed in the Effect Index sitemap and in neither build's shared static paths", () => {
    expect(buildFlavorGatedSitemapPaths({ blogPostSlugs: [] }, effectindex)).toContain(path);
    expect(STATIC_PUBLIC_PATHS).not.toContain(path);
  });
});

describe("Effect Index supporting pages in the sitemap", () => {
  const input = { blogPostSlugs: [] };

  it("appends all four paths on the Effect Index flavor", () => {
    const paths = buildFlavorGatedSitemapPaths(input, effectindex);

    for (const { path } of SUPPORT_PAGES) {
      expect(paths).toContain(path);
    }
  });

  it("appends none of them on the dose.wiki flavor", () => {
    expect(buildFlavorGatedSitemapPaths(input, dosewiki)).toEqual([]);
  });

  it("keeps them out of the shared static-path list that both builds sitemap", () => {
    for (const { path } of SUPPORT_PAGES) {
      expect(STATIC_PUBLIC_PATHS).not.toContain(path);
    }
  });
});

describe("Discord invite URL", () => {
  it("is the destination of the legacy /discord-chat redirect, not a second copy", () => {
    const entry = effectIndexLegacyRedirects.find(
      (redirect) => redirect.source === "/discord-chat",
    );

    expect(entry).toBeDefined();
    expect(EFFECT_INDEX_DISCORD_INVITE_URL).toBe(entry?.destination);
  });

  it("still reaches the Next config's redirect table after the extraction", async () => {
    const redirects = await nextConfig.redirects?.();

    expect(redirects).toContainEqual({
      source: "/discord-chat",
      destination: EFFECT_INDEX_DISCORD_INVITE_URL,
      permanent: true,
    });
  });
});
