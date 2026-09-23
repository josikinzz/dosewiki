// @vitest-environment node
import { describe, expect, it } from "vitest";
import { LOCALE_CODES } from "../../src/i18n/localeRegistry.mjs";
import { resolvePrerenderPolicy, type PrerenderBuild } from "./prerenderPolicy";

const PUBLIC_DOSEWIKI: PrerenderBuild = { surface: "public", flavor: "dosewiki" };
const EDITOR_DOSEWIKI: PrerenderBuild = { surface: "editor", flavor: "dosewiki" };
const PUBLIC_EFFECTINDEX: PrerenderBuild = { surface: "public", flavor: "effectindex" };

describe("resolvePrerenderPolicy", () => {
  it("prerenders every tier for every locale on every surface (prefactor, no behaviour change)", () => {
    for (const locale of LOCALE_CODES) {
      for (const build of [PUBLIC_DOSEWIKI, EDITOR_DOSEWIKI, PUBLIC_EFFECTINDEX]) {
        expect(resolvePrerenderPolicy(locale, build)).toEqual(["high", "normal", "low"]);
      }
    }
  });

  it("returns a frozen tier list so callers cannot mutate the policy table", () => {
    const tiers = resolvePrerenderPolicy("en", PUBLIC_DOSEWIKI);
    expect(Object.isFrozen(tiers)).toBe(true);
  });
});
