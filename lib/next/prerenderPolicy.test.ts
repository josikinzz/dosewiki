// @vitest-environment node
import { describe, expect, it } from "vitest";
import { LOCALE_CODES } from "../../src/i18n/localeRegistry.mjs";
import { resolvePrerenderPolicy, type PrerenderBuild } from "./prerenderPolicy";

const PUBLIC_DOSEWIKI: PrerenderBuild = { surface: "public", flavor: "dosewiki" };
const EDITOR_DOSEWIKI: PrerenderBuild = { surface: "editor", flavor: "dosewiki" };
const PUBLIC_EFFECTINDEX: PrerenderBuild = { surface: "public", flavor: "effectindex" };

describe("resolvePrerenderPolicy", () => {
  it("prerenders the high and normal tiers for English on the public dose.wiki build", () => {
    expect(resolvePrerenderPolicy("en", PUBLIC_DOSEWIKI)).toEqual(["high", "normal"]);
  });

  it("still prerenders every tier for the mirrors and the other artifacts (until their tickets land)", () => {
    for (const locale of LOCALE_CODES) {
      if (locale === "en") continue;
      expect(resolvePrerenderPolicy(locale, PUBLIC_DOSEWIKI)).toEqual(["high", "normal", "low"]);
    }
    for (const build of [EDITOR_DOSEWIKI, PUBLIC_EFFECTINDEX]) {
      expect(resolvePrerenderPolicy("en", build)).toEqual(["high", "normal", "low"]);
    }
  });

  it("returns a frozen tier list so callers cannot mutate the policy table", () => {
    const tiers = resolvePrerenderPolicy("en", PUBLIC_DOSEWIKI);
    expect(Object.isFrozen(tiers)).toBe(true);
  });
});
