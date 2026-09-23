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

  it("prerenders nothing for the locale mirrors: ru, zh-Hans, and every other registered locale", () => {
    expect(resolvePrerenderPolicy("ru", PUBLIC_DOSEWIKI)).toEqual([]);
    expect(resolvePrerenderPolicy("zh-Hans", PUBLIC_DOSEWIKI)).toEqual([]);
    for (const locale of LOCALE_CODES) {
      if (locale === "en") continue;
      expect(resolvePrerenderPolicy(locale, PUBLIC_DOSEWIKI)).toEqual([]);
    }
  });

  it("prerenders nothing for a locale the table has never heard of", () => {
    expect(resolvePrerenderPolicy("xx" as never, PUBLIC_DOSEWIKI)).toEqual([]);
  });

  it("still prerenders every tier for the editor and Effect Index artifacts (until ticket 06 lands)", () => {
    for (const build of [EDITOR_DOSEWIKI, PUBLIC_EFFECTINDEX]) {
      expect(resolvePrerenderPolicy("en", build)).toEqual(["high", "normal", "low"]);
    }
  });

  it("returns a frozen tier list so callers cannot mutate the policy table", () => {
    const tiers = resolvePrerenderPolicy("en", PUBLIC_DOSEWIKI);
    expect(Object.isFrozen(tiers)).toBe(true);
  });
});
