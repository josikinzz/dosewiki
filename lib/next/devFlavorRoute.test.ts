import { describe, expect, it } from "vitest";
import { SITE_FLAVOR_CONFIGS, isFlavorRouteEnabled } from "../../src/config/siteFlavor";
import { isFlavorGatedRequestPath } from "./flavorGatedRoutes";

const effectindex = SITE_FLAVOR_CONFIGS.effectindex;
const dosewiki = SITE_FLAVOR_CONFIGS.dosewiki;

/**
 * The editor shell is a dose.wiki-only surface. The Effect Index deployment is
 * credential-free and read-only (AGENTS.md), so the whole `/dev` prefix answers a real
 * 404 there instead of a sign-in redirect for a sign-in that cannot succeed.
 */
describe("the /dev editor shell flavor gate", () => {
  it("is a named flavor-gated route owned by dose.wiki alone", () => {
    expect(isFlavorRouteEnabled("dev", dosewiki)).toBe(true);
    expect(isFlavorRouteEnabled("dev", effectindex)).toBe(false);
  });

  it("gates the shell root, its utilities, and every tab route on Effect Index only", () => {
    for (const pathname of ["/dev", "/dev/", "/dev/kit", "/dev/themes", "/dev/articles/x"]) {
      expect(isFlavorGatedRequestPath(pathname, effectindex), pathname).toBe(true);
      expect(isFlavorGatedRequestPath(pathname, dosewiki), pathname).toBe(false);
    }
  });

  it("does not gate a path that merely starts with the same letters", () => {
    for (const pathname of ["/developers", "/devices"]) {
      expect(isFlavorGatedRequestPath(pathname, effectindex), pathname).toBe(false);
      expect(isFlavorGatedRequestPath(pathname, dosewiki), pathname).toBe(false);
    }
  });
});
