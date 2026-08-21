import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ALL_TOKEN_IDS } from "./paletteTokens";
import { RADIUS_TOKEN_IDS, getLengthSpec, parseRem } from "./paletteTokensRadius";
import { ANGLE_MAX, HUE_TOKEN_IDS, parseAngle } from "./paletteTokensHues";
import {
  DEFAULT_PRESET_ID,
  PALETTE_PRESETS,
  PRESET_HUE_TOKEN_IDS,
  getPreset,
  isKnownPresetId,
  mergeOverrides,
} from "./palettePresets";

const KNOWN_IDS = new Set<string>([...ALL_TOKEN_IDS, ...PRESET_HUE_TOKEN_IDS]);
const THEMES = ["dark", "light"] as const;

describe("palettePresets definitions", () => {
  it("has unique ids and the default preset first with zero overrides", () => {
    const ids = PALETTE_PRESETS.map((preset) => preset.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[0]).toBe(DEFAULT_PRESET_ID);
    const fallback = getPreset(DEFAULT_PRESET_ID);
    expect(Object.keys(fallback.overrides.dark)).toHaveLength(0);
    expect(Object.keys(fallback.overrides.light)).toHaveLength(0);
  });

  it("only overrides registry tokens or whitelisted hue seeds", () => {
    for (const preset of PALETTE_PRESETS) {
      for (const themeName of THEMES) {
        for (const tokenId of Object.keys(preset.overrides[themeName])) {
          expect(KNOWN_IDS.has(tokenId), `${preset.id}/${themeName}: unknown token ${tokenId}`).toBe(
            true,
          );
        }
      }
    }
  });

  it("carries both themes with non-empty values in every non-default preset", () => {
    for (const preset of PALETTE_PRESETS) {
      for (const themeName of THEMES) {
        const map = preset.overrides[themeName];
        expect(map, `${preset.id} is missing the ${themeName} map`).toBeTruthy();
        if (preset.id !== DEFAULT_PRESET_ID) {
          expect(
            Object.keys(map).length,
            `${preset.id}/${themeName} should restyle this theme`,
          ).toBeGreaterThan(0);
        }
        for (const [tokenId, value] of Object.entries(map)) {
          expect(value.trim(), `${preset.id}/${themeName}/${tokenId} is empty`).not.toBe("");
        }
      }
    }
  });

  it("re-seats the brand seeds in every alternate look", () => {
    for (const preset of PALETTE_PRESETS) {
      if (preset.id === DEFAULT_PRESET_ID) continue;
      expect(preset.overrides.dark["--c-brand"]).toBeTruthy();
      expect(preset.overrides.light["--c-brand"]).toBeTruthy();
      expect(preset.overrides.dark["--c-accent"]).toBeTruthy();
    }
  });

  it("keeps any preset radius value inside what the slider can express", () => {
    // The radius group is a length axis, not a color one: a preset that ships a
    // value the slider cannot reach would leave the visitor unable to drag back
    // to the look they are wearing.
    const radiusIds = new Set(RADIUS_TOKEN_IDS);
    for (const preset of PALETTE_PRESETS) {
      for (const themeName of THEMES) {
        for (const [tokenId, value] of Object.entries(preset.overrides[themeName])) {
          if (!radiusIds.has(tokenId)) continue;
          const rem = parseRem(value);
          expect(rem, `${preset.id}/${themeName}/${tokenId} must be a plain length`).not.toBeNull();
          const spec = getLengthSpec(tokenId)!;
          expect(rem!).toBeGreaterThanOrEqual(spec.min);
          expect(rem!).toBeLessThanOrEqual(spec.max);
        }
      }
    }
  });

  it("keeps every preset hue seed inside the circle the control can express", () => {
    // The hue group is an angle axis: a preset that shipped an unparseable or
    // out-of-range seed would leave the visitor unable to nudge back to the
    // look they are wearing, and would break delete-on-equal against it.
    const hueIds = new Set(HUE_TOKEN_IDS);
    for (const preset of PALETTE_PRESETS) {
      for (const themeName of THEMES) {
        for (const [tokenId, value] of Object.entries(preset.overrides[themeName])) {
          if (!hueIds.has(tokenId)) continue;
          const degrees = parseAngle(value);
          expect(degrees, `${preset.id}/${themeName}/${tokenId} must be a plain angle`).not.toBeNull();
          expect(degrees!).toBeGreaterThanOrEqual(0);
          expect(degrees!).toBeLessThan(ANGLE_MAX);
          // Stored exactly as the control writes them, so a paste-back or a
          // revert compares equal instead of leaving a redundant edit.
          expect(value.trim()).toBe(value);
        }
      }
    }
  });

  it("re-seats the brand hue in every alternate look, in both themes", () => {
    // Hue seeds are theme-independent in the stylesheet, so a preset that only
    // re-hued one theme would half-apply — and the whole-theme re-hue control
    // diverges from these values, so they have to be there to diverge from.
    for (const preset of PALETTE_PRESETS) {
      if (preset.id === DEFAULT_PRESET_ID) continue;
      for (const themeName of THEMES) {
        expect(
          preset.overrides[themeName]["--h-brand"],
          `${preset.id}/${themeName} should re-seat the brand hue`,
        ).toBeTruthy();
      }
    }
  });

  it("re-seats the whole brand seed group wherever it re-seats the brand hue", () => {
    // --h-brand never travels alone in a colourway. --h-plum and --h-text carry
    // its surfaces and ink; --h-violet carries a secondary surface-local
    // decorative hue. Selected controls and inline references deliberately do not
    // consume --h-violet: the independent Accent axis owns those recipes.
    const SEED_GROUP = ["--h-plum", "--h-text", "--h-violet"] as const;
    for (const preset of PALETTE_PRESETS) {
      for (const themeName of THEMES) {
        const overrides = preset.overrides[themeName];
        if (!overrides["--h-brand"]) continue;
        for (const seed of SEED_GROUP) {
          expect(
            overrides[seed],
            `${preset.id}/${themeName} re-seats --h-brand and must also re-seat ${seed}`,
          ).toBeTruthy();
        }
      }
    }
  });

  it("ships the five ordered swatch hexes the surface tint is read out of", () => {
    for (const preset of PALETTE_PRESETS) {
      for (const themeName of THEMES) {
        // `src/theme/surfaces.ts` reads index 1 as the surface tint, so the tuple
        // has to be the documented canvas/panel/text/brand/accent order and not
        // some shorter list that happens to start the same way.
        const strip = preset.swatch[themeName];
        expect(strip, `${preset.id}/${themeName} swatch strip`).toHaveLength(5);
        for (const hex of strip) {
          expect(hex).toMatch(/^#[0-9a-f]{6}$/i);
        }
      }
    }
  });

  it("merges with user edits winning per token, per theme", () => {
    const base = {
      dark: { "--a": "base-dark-a", "--b": "base-dark-b" },
      light: { "--a": "base-light-a" },
    };
    const user = { dark: { "--b": "user-dark-b" }, light: { "--c": "user-light-c" } };
    const merged = mergeOverrides(base, user);
    expect(merged.dark).toEqual({ "--a": "base-dark-a", "--b": "user-dark-b" });
    expect(merged.light).toEqual({ "--a": "base-light-a", "--c": "user-light-c" });
    // Inputs are not mutated.
    expect(base.dark["--b"]).toBe("base-dark-b");
    expect(user.dark).toEqual({ "--b": "user-dark-b" });
  });

  it("degrades unknown preset ids to the default", () => {
    expect(isKnownPresetId("abyss")).toBe(true);
    expect(isKnownPresetId("not-a-preset")).toBe(false);
    expect(isKnownPresetId(null)).toBe(false);
    expect(getPreset("not-a-preset").id).toBe(DEFAULT_PRESET_ID);
    expect(getPreset(undefined).id).toBe(DEFAULT_PRESET_ID);
    expect(getPreset("sunset").id).toBe("sunset");
  });
});

/* -------------------------------------------------------------------------
 * Harm-reduction immunity.
 *
 * A colourway dresses the page; it must never restate a safety signal. The
 * families below are the signal: the dose and plateau tier ramps, the inline
 * success / warning / danger / evidence ramp, and the semantic cards and
 * badges. Membership is measured out of site-colors.css rather than trusted
 * from a hand-kept list, so a token added to a family cannot slip the net.
 *
 * The molecule CPK palette is the fourth harm-reduction surface and is
 * deliberately absent from this suite: it lives in
 * src/data/mappings/moleculePalette.ts and paints structure SVGs served
 * through <img>, so no custom property reaches it and no colourway can touch
 * it. There is nothing here to assert.
 * ---------------------------------------------------------------------- */

const SITE_COLORS = readFileSync(resolve(process.cwd(), "src/styles/site-colors.css"), "utf8");
const DECLARATIONS = [...SITE_COLORS.matchAll(/^\s*(--[a-z0-9-]+):\s*([^;]*);/gm)].map(
  (match) => ({ id: match[1], value: match[2].trim() }),
);

const FAMILIES = {
  // `-fade` is out on purpose: it is the tinted grey wash *behind* a tier bar,
  // not a tier. Its chroma is 0.02 in dark and 0.004 in light, and it is
  // seeded off --h-brand so the wash follows the page. The ten below are the
  // signal, and they are the only members that must never move.
  tierRamp: /^--theme-(?:dose|plateau)-tier-(?!fade$)/,
  inlineRamp:
    /^--theme-(?:success|warning|danger|evidence)-(?:bg|bg-strong|border|border-strong|text|text-strong|ring)$/,
  semanticCards: /^--theme-(?:semantic|interaction)-(?:danger|unsafe|caution)-card-/,
  // The neutral badge is out: it is chrome borrowed from the frosted-control
  // recipe, carries no safety meaning, and its glow is seeded off --h-text so
  // it follows the page ink.
  semanticBadges: /^--theme-semantic-(?:danger|unsafe|caution|info|success)-badge-/,
} as const;

/** Membership as measured when the exemptions below were written. */
const MEASURED_SIZES: Record<keyof typeof FAMILIES, number> = {
  tierRamp: 10,
  inlineRamp: 28,
  semanticCards: 15,
  semanticBadges: 25,
};

function membersOf(family: keyof typeof FAMILIES): string[] {
  const pattern = FAMILIES[family];
  return [...new Set(DECLARATIONS.map((d) => d.id).filter((id) => pattern.test(id)))].sort();
}

const IMMUNE = new Set(
  (Object.keys(FAMILIES) as (keyof typeof FAMILIES)[]).flatMap((family) => membersOf(family)),
);

/**
 * Named, deliberate exceptions. Each covers a colourway whose *brand* lands on
 * top of a safety hue, where leaving the signal alone would be the unsafe
 * choice. Loosening an assertion instead of naming the case here is forbidden:
 * the point of the list is that adding to it is a decision someone has to
 * write down.
 *
 * DANGER_RETINT — Garnet's scarlet brand is a red a rose danger would blur into,
 * so it re-seats --h-rose to 350 and moves danger to magenta-pink: an alarm then
 * differs from the brand by hue, not only by intensity. These two tokens are the
 * hand-tuned literals in that family that do not follow --h-rose, so Garnet has
 * to re-pin them or the callout panel and the chip text stay rose while the rest
 * of the family moves.
 *
 * CAUTION_GOLD — Sunset re-seats --h-gold to 95 and swaps the amber scale for
 * yellow-gold, so brand coral, gold caution and burnt unsafe stay three distinct
 * steps. --theme-warning-bg is the one hand-tuned literal in the warning ramp
 * that does not follow --c-amber, so a wash derived from gold has to move with
 * the gold or it stops matching its own family: the caution panel would keep an
 * orange-brown fill under gold text.
 */
const DANGER_RETINT = [
  "--theme-interaction-danger-card-primary",
  "--theme-semantic-danger-badge-text",
] as const;
const CAUTION_GOLD = ["--theme-warning-bg"] as const;
const EXEMPTIONS: Record<string, readonly string[]> = {
  garnet: DANGER_RETINT,
  sunset: CAUTION_GOLD,
};

describe("harm-reduction immunity", () => {
  it("measures the family membership the exemptions were written against", () => {
    for (const family of Object.keys(MEASURED_SIZES) as (keyof typeof FAMILIES)[]) {
      expect(membersOf(family), `${family} membership moved`).toHaveLength(
        MEASURED_SIZES[family],
      );
    }
  });

  it("keeps both tier ramps byte-identical in every colourway", () => {
    // The ramps hard-code their hue numbers (165 / 235 / 82 / 54 / 16) instead
    // of reading --h-green, --h-cyan, --h-yellow, --h-orange or --h-rose. That
    // is not an oversight: a seed reference would let Canopy or Garnet re-tint
    // a dose bar. No var() at all means no seed and no --c-* scale can reach
    // them, which is what makes "byte-identical" literally true here.
    const ramp = new Set(membersOf("tierRamp"));
    const declared = DECLARATIONS.filter((d) => ramp.has(d.id));
    expect(declared.length).toBe(ramp.size * 2); // one dark block, one light
    for (const { id, value } of declared) {
      expect(value, `${id} must not reach a custom property`).not.toContain("var(");
    }
    for (const preset of PALETTE_PRESETS) {
      for (const themeName of THEMES) {
        for (const tokenId of Object.keys(preset.overrides[themeName])) {
          expect(
            ramp.has(tokenId),
            `${preset.id}/${themeName} must not re-tint the tier ramp (${tokenId})`,
          ).toBe(false);
        }
      }
    }
  });

  it("lets no colourway restate a safety signal outside the named exemptions", () => {
    const used = new Set<string>();
    for (const preset of PALETTE_PRESETS) {
      const allowed = new Set(EXEMPTIONS[preset.id] ?? []);
      for (const themeName of THEMES) {
        for (const tokenId of Object.keys(preset.overrides[themeName])) {
          if (!IMMUNE.has(tokenId)) continue;
          expect(
            allowed.has(tokenId),
            `${preset.id}/${themeName} re-tints ${tokenId}; name the exemption or drop the override`,
          ).toBe(true);
          used.add(`${preset.id}|${tokenId}`);
        }
      }
    }
    // A stale exemption is a hole nobody is watching, so every entry must be
    // one a colourway actually exercises.
    for (const [presetId, tokenIds] of Object.entries(EXEMPTIONS)) {
      for (const tokenId of tokenIds) {
        expect(used.has(`${presetId}|${tokenId}`), `${presetId} no longer needs ${tokenId}`).toBe(
          true,
        );
      }
    }
  });
});
