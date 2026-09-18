import { describe, expect, it } from "vitest";
import { SITE_FLAVOR_CONFIGS, isFlavorRouteEnabled } from "../../src/config/siteFlavor";
import { FLAVOR_GATED_NOT_FOUND_PATH, isFlavorGatedRequestPath } from "./flavorGatedRoutes";

const effectindex = SITE_FLAVOR_CONFIGS.effectindex;
const dosewiki = SITE_FLAVOR_CONFIGS.dosewiki;

/**
 * One row per URL prefix the middleware can 404. `gatedOn` lists the flavors that must
 * answer a real 404 for the prefix root, `prefix/`, and any deeper path.
 */
const GATED: readonly { prefix: string; gatedOn: readonly ("dosewiki" | "effectindex")[] }[] = [
  { prefix: "/blog", gatedOn: [] },
  { prefix: "/dev", gatedOn: ["effectindex"] },
  { prefix: "/donate", gatedOn: ["dosewiki"] },
  { prefix: "/contact", gatedOn: ["dosewiki"] },
  { prefix: "/discord", gatedOn: ["dosewiki"] },
  { prefix: "/copyright-disclaimer", gatedOn: ["dosewiki"] },
  { prefix: "/documentation-style-guide", gatedOn: ["dosewiki"] },
];

/** Paths that share leading letters with a gated prefix and must never be caught. */
const NEAR_MISSES = [
  "/blogging",
  "/blogs",
  "/developers",
  "/devices",
  "/discord-chat",
  "/donations",
  "/contacts",
  "/copyright",
  "/documentation-style-guides",
  "/",
  "/articles",
  "/effects/blog",
];

describe("isFlavorGatedRequestPath", () => {
  it.each(GATED)(
    "gates $prefix, its trailing-slash form, and deeper paths on $gatedOn only",
    ({ prefix, gatedOn }) => {
      for (const pathname of [prefix, `${prefix}/`, `${prefix}/anything`, `${prefix}/a/b`]) {
        expect(isFlavorGatedRequestPath(pathname, dosewiki), `${pathname} on dosewiki`).toBe(
          gatedOn.includes("dosewiki"),
        );
        expect(isFlavorGatedRequestPath(pathname, effectindex), `${pathname} on effectindex`).toBe(
          gatedOn.includes("effectindex"),
        );
      }
    },
  );

  it.each(NEAR_MISSES)("does not gate %s on either flavor", (pathname) => {
    expect(isFlavorGatedRequestPath(pathname, dosewiki)).toBe(false);
    expect(isFlavorGatedRequestPath(pathname, effectindex)).toBe(false);
  });

  it("owns the editor shell on dose.wiki alone and the support pages on Effect Index alone", () => {
    // The blog and donate ids are pinned in src/config/siteFlavor.test.ts; these are the rest.
    expect(isFlavorRouteEnabled("dev", dosewiki)).toBe(true);
    expect(isFlavorRouteEnabled("dev", effectindex)).toBe(false);
    for (const route of ["contact", "discord", "copyrightDisclaimer"] as const) {
      expect(isFlavorRouteEnabled(route, effectindex), route).toBe(true);
      expect(isFlavorRouteEnabled(route, dosewiki), route).toBe(false);
    }
  });

  it("rewrites to a two-segment path the root [slug] catch-all cannot swallow", () => {
    expect(FLAVOR_GATED_NOT_FOUND_PATH.split("/").filter(Boolean).length).toBeGreaterThan(1);
  });
});
