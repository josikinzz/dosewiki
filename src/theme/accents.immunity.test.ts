import { describe, expect, it } from "vitest";

import { PALETTE_PRESETS } from "@/features/theme-lab/palettePresets";
import {
  GRID,
  type Rgb,
  parseColor,
  read,
  rgbToOklch,
} from "@/test/fixtures/accentAppearanceGrid";
import { ACCENTS, DEFAULT_ACCENT_ID } from "./accents";

/**
 * What an accent may not touch: the harm-reduction signal, and every literal still painted in
 * the authored brand band. The apparatus is `src/test/fixtures/accentAppearanceGrid.ts`.
 */

/* -------------------------------------------------------------------------
 * Semantic immunity.
 * ---------------------------------------------------------------------- */

const SITE_COLORS = read("src/styles/site-colors.css");
const SITE_COLOR_TOKENS = [...SITE_COLORS.matchAll(/^\s*(--[a-z0-9-]+):/gm)].map(
  (match) => match[1],
);

/**
 * The harm-reduction signal, enumerated out of `site-colors.css` rather than hand-listed, so a
 * token added to a family cannot slip the net. The patterns are the ones
 * `palettePresets.test.ts` already measures colourways against; an accent wears a colourway,
 * so it has to answer to the same list.
 *
 * The molecule CPK palette is the fourth harm-reduction surface and is deliberately absent:
 * it lives in `src/data/mappings/moleculePalette.ts` and paints structure SVGs served through
 * `<img>`, so no custom property reaches it and no accent can touch it.
 */
const IMMUNE_FAMILIES = {
  tierRamp: /^--theme-(?:dose|plateau)-tier-(?!fade$)/,
  inlineRamp:
    /^--theme-(?:success|warning|danger|evidence)-(?:bg|bg-strong|border|border-strong|text|text-strong|ring)$/,
  semanticCards: /^--theme-(?:semantic|interaction)-(?:danger|unsafe|caution)-card-/,
  semanticBadges: /^--theme-semantic-(?:danger|unsafe|caution|info|success)-badge-/,
} as const;

const immuneMembers = (family: keyof typeof IMMUNE_FAMILIES) => [
  ...new Set(SITE_COLOR_TOKENS.filter((token) => IMMUNE_FAMILIES[family].test(token))),
];

const IMMUNE = new Set(
  (Object.keys(IMMUNE_FAMILIES) as (keyof typeof IMMUNE_FAMILIES)[]).flatMap(immuneMembers),
);

/**
 * The safety re-tints an accent inherits from the colourway it wears, restated here rather than
 * allowed to arrive silently. These are the same two maps `palettePresets.test.ts` names, and
 * the reason they exist is that both colourways carry a brand hue sitting next to a
 * harm-reduction hue, so the safety signal has to step aside or the alarm and the brand differ
 * only by intensity.
 *
 * `garnet` (Red, brand 25) re-seats `--h-rose` from the authored 14 to 350, opening 35° between
 * a scarlet link and a danger callout, and re-pins the two danger literals in that family that
 * do not follow the seed. `sunset` (Amber, brand 45) re-seats `--h-gold` from 68 to 95 and moves
 * the one warning literal that does not follow `--c-amber`.
 *
 * Neither exemption is an accent's decision: the colourway ships these, and the accent reads
 * its override map at build time. Writing them down is what makes the inheritance deliberate.
 */
const SAFETY_RETINT_EXEMPTIONS: Record<string, readonly string[]> = {
  red: ["--theme-interaction-danger-card-primary", "--theme-semantic-danger-badge-text"],
  amber: ["--theme-warning-bg"],
};

describe("semantic immunity", () => {
  it("measures the family membership these assertions were written against", () => {
    expect(immuneMembers("tierRamp")).toHaveLength(10);
    expect(immuneMembers("inlineRamp")).toHaveLength(28);
    expect(immuneMembers("semanticCards")).toHaveLength(15);
    expect(immuneMembers("semanticBadges")).toHaveLength(25);
  });

  it.each(GRID)("keeps both tier ramps byte-identical under $label", ({ label, tokens, baseline }) => {
    // The dose and plateau ramps hard-code their hue numbers instead of reading --h-green,
    // --h-rose and friends, which is exactly what makes "byte-identical" literally true here:
    // no seed and no --c-* scale can reach them, so no accent can either.
    for (const token of immuneMembers("tierRamp")) {
      expect(tokens[token], `${label} re-tinted ${token}`).toBe(baseline[token]);
    }
  });

  it("lets no accent restate a safety signal it has not named", () => {
    // Declaration-level, matching how colourway immunity is already measured: an accent must
    // not name an immune token at all, except the ones its colourway re-tints on purpose.
    for (const accent of ACCENTS) {
      const preset = PALETTE_PRESETS.find((candidate) => candidate.id === accent.funPresetId);
      const declared = [
        ...Object.keys(preset?.overrides.dark ?? {}),
        ...Object.keys(preset?.overrides.light ?? {}),
        ...Object.keys(accent.pro?.dark ?? {}),
        ...Object.keys(accent.pro?.light ?? {}),
      ];
      const allowed = SAFETY_RETINT_EXEMPTIONS[accent.id] ?? [];

      expect(
        declared.filter((token) => IMMUNE.has(token) && !allowed.includes(token)),
        `${accent.id} restates a harm-reduction token; name the exemption or drop the override`,
      ).toEqual([]);
    }
  });

  it("exercises every named safety-retint exemption", () => {
    // A stale exemption is a hole nobody is watching. Each token named above has to still be
    // immune, and still be restated by the colourway the accent wears — otherwise the colourway
    // has moved on and the exemption is protecting nothing.
    for (const [accentId, tokens] of Object.entries(SAFETY_RETINT_EXEMPTIONS)) {
      const accent = ACCENTS.find((candidate) => candidate.id === accentId);
      expect(accent, `${accentId} is not an accent`).toBeDefined();
      const preset = PALETTE_PRESETS.find((candidate) => candidate.id === accent!.funPresetId);

      for (const token of tokens) {
        expect(IMMUNE.has(token), `${token} is no longer immune; drop the exemption`).toBe(true);
        expect(
          { ...preset!.overrides.light, ...preset!.overrides.dark },
          `${accent!.funPresetId} no longer restates ${token}; drop the exemption`,
        ).toHaveProperty(token);
      }
    }
  });

  it("keeps every accent's brand hue clear of the safety hues it sits beside", () => {
    // The guard the two exemptions above are buying, measured rather than hoped for. An accent's
    // Fun half re-seats --h-brand; if a harm-reduction family shares that angle, an alarm and a
    // link become the same colour. Both halves of the fix are the colourway's: it either moves
    // the safety seed away or it was already clear. This asserts the separation that remains.
    const AUTHORED_SAFETY_HUES = {
      "danger rose": "--h-rose",
      "unsafe orange": "--h-orange",
      "caution gold": "--h-gold",
      "success green": "--h-green",
    } as const;
    // The authored angles, read off site-colors.css rather than restated, so a re-seat there
    // moves this measurement too.
    const authoredHue = (seed: string) => {
      const match = new RegExp(`^\\s*${seed}:\\s*([\\d.]+);`, "m").exec(SITE_COLORS);
      expect(match, `${seed} is no longer declared in site-colors.css`).not.toBeNull();
      return Number.parseFloat(match![1]);
    };
    /**
     * The narrowest separation in the reviewed set, so anything tighter is a case nobody has
     * looked at yet. Amber sets it: Sunset's coral brand at 45 against its own burnt-vermilion
     * unsafe at 35. Ten degrees would be too little on its own, and it is not on its own — the
     * two differ by a large value step as well, which is the axis a hue check cannot see. Every
     * other pair in the set clears 23°.
     */
    const MIN_SAFETY_SEPARATION = 10;
    const separation = (a: number, b: number) => {
      const distance = Math.abs(a - b) % 360;
      return Math.min(distance, 360 - distance);
    };

    for (const accent of ACCENTS) {
      if (!accent.funPresetId) continue;
      const preset = PALETTE_PRESETS.find((candidate) => candidate.id === accent.funPresetId)!;
      const seeds = { ...preset.overrides.light, ...preset.overrides.dark };
      const brand = Number.parseFloat(seeds["--h-brand"]);
      expect(brand, `${accent.id} wears a colourway that re-seats no brand hue`).not.toBeNaN();

      for (const [family, seed] of Object.entries(AUTHORED_SAFETY_HUES)) {
        const effective = seeds[seed] ? Number.parseFloat(seeds[seed]) : authoredHue(seed);
        const measured = separation(brand, effective);

        expect(
          measured,
          `${accent.id}: brand ${brand} sits ${measured.toFixed(0)}° from ${family} at ` +
            `${effective} — too close for an alarm to read as an alarm`,
        ).toBeGreaterThanOrEqual(MIN_SAFETY_SEPARATION);
      }
    }
  });

  it("keeps the tier ramps structurally immune rather than merely untouched", () => {
    // The byte-identical assertion above is a measurement; this is the reason it can never fail.
    // Both ramps hard-code their hue numbers and reach no var() at all, so no --h-* seed and no
    // --c-* scale can reach them. An accent cannot re-tint a dose bar even by accident, and if
    // someone rewrites a ramp step to read a seed this is the assertion that stops them.
    const declarations = [...SITE_COLORS.matchAll(/^\s*(--[a-z0-9-]+):\s*([^;]+);/gm)].filter(
      ([, token]) => IMMUNE_FAMILIES.tierRamp.test(token),
    );

    expect(declarations.length).toBeGreaterThan(0);
    for (const [, token, value] of declarations) {
      expect(value, `${token} reaches a var() and is no longer structurally immune`).not.toContain(
        "var(",
      );
    }
  });

  it.each(GRID.filter((entry) => entry.visualStyle === "pro"))(
    "leaves every harm-reduction token untouched on $label",
    ({ label, tokens, baseline }) => {
      // Pro is where this is absolute: the accent only re-seats --ei-*, and pro-theme.css
      // declares no safety token at all, so all 78 must be byte-identical. It is also the
      // second assertion that catches a dropped Fun guard — an unguarded accent leaked
      // --theme-success-* onto a Pro page.
      const moved = [...IMMUNE].filter(
        (token) => baseline[token] !== undefined && baseline[token] !== tokens[token],
      );
      expect(moved, `${label} re-tinted ${moved.join(", ")}`).toEqual([]);
    },
  );
});

/* -------------------------------------------------------------------------
 * The leak list.
 * ---------------------------------------------------------------------- */

/** The authored `--h-brand`, and the band around it a leak would sit in. */
const BRAND_HUE = 326;
const BRAND_BAND = 25;
/**
 * Below this chroma a brand-band colour is a tinted grey rather than brand paint. The one
 * token it excludes is `--theme-review-progress-track-bg`, a near-neutral /dev track at
 * chroma 0.024-0.030 that Pro never rebinds; treating it as accent paint would demand every
 * accent restate an editor-only token that reads as grey on screen.
 */
const BRAND_CHROMA_FLOOR = 0.05;

/**
 * Named exemption, on the same terms as the floor exemption in `accents.contrast.test.ts`.
 *
 * `--theme-doc-domain-*` is a five-colour CATEGORICAL palette — blue 235, green 165, orange
 * 54, plum 350, gold following `--h-brand` — where hue is identity, the same reason the CPK
 * molecule palette is immune. Two members sit in the brand band, and on Pro neither moves
 * because Pro rebinds neither, so an accent cannot reach them without collapsing two
 * documentation domains onto one colour.
 */
const LEAK_EXEMPTION = /^--theme-doc-domain-/;

/**
 * One accent-specific exemption, on the same terms, and deliberately keyed by accent so it
 * cannot excuse the same token anywhere else.
 *
 * `--theme-home-glow-top` is the upper of the two soft radial washes behind the homepage hero.
 * Its authored dark value is `rgba(126, 34, 206, 0.13)` — the base palette's **violet**, not its
 * brand fuchsia — and that violet measures hue 301.9, which is **24.1° from `--h-brand` 326**.
 * The band is 25°, so it is caught by 0.9°: a boundary artefact of a hue heuristic, not brand
 * paint. Narrowing the band to 24 to make this one datum fit would silently stop catching real
 * leaks between 24° and 25°, so the band stays where it is and the token is named instead.
 *
 * Amber is the only accent that needs it, because Sunset is the only colourway that restates the
 * authored value verbatim rather than re-seating it. That is Sunset's identity, not an omission:
 * it is "coral horizon over **dusk violet**", so the top wash is the palette's own second
 * colour and moving it would delete the sunset. Canopy, Garnet and Graphite all re-seat the same
 * token, which is why the assertion still bites for Green, Red and Neutral.
 */
const ACCENT_LEAK_EXEMPTIONS: Record<string, readonly string[]> = {
  amber: ["--theme-home-glow-top"],
};

const brandBandColours = (value: string) =>
  [
    ...value.matchAll(
      /#[0-9a-fA-F]{3,8}\b|oklch\([^()]*(?:\([^()]*\)[^()]*)*\)|rgba?\([^()]*(?:\([^()]*\)[^()]*)*\)/g,
    ),
  ].filter((match) => {
    let colour: Rgb;
    try {
      colour = parseColor(match[0]);
    } catch {
      return false;
    }
    const [, chroma, hue] = rgbToOklch(colour);
    const distance = Math.abs(hue - BRAND_HUE) % 360;
    return chroma >= BRAND_CHROMA_FLOOR && Math.min(distance, 360 - distance) <= BRAND_BAND;
  });

describe("brand-band leaks", () => {
  it.each(GRID.filter((entry) => entry.accent.id !== DEFAULT_ACCENT_ID))(
    "leaves no brand-band literal at the default value under $label",
    ({ label, accent, tokens, baseline }) => {
      // #115 made every brand-coloured literal in the Fun palette read an --h-* seed, so a
      // colourway that re-seats the brand moves the whole page. This is that guarantee, stated
      // from the other end: any token painted in the authored brand band has to have moved.
      const allowed = ACCENT_LEAK_EXEMPTIONS[accent.id] ?? [];
      const leaks = Object.keys(baseline).filter(
        (token) =>
          !LEAK_EXEMPTION.test(token) &&
          !allowed.includes(token) &&
          brandBandColours(baseline[token]).length > 0 &&
          baseline[token] === tokens[token],
      );

      expect(leaks, `${label} left ${leaks.join(", ")} in the authored brand band`).toEqual([]);
    },
  );

  it("exercises the named leak exemption", () => {
    const exempted = GRID.filter((entry) => entry.accent.id !== DEFAULT_ACCENT_ID).flatMap(
      (entry) =>
        Object.keys(entry.baseline).filter(
          (token) =>
            LEAK_EXEMPTION.test(token) &&
            brandBandColours(entry.baseline[token]).length > 0 &&
            entry.baseline[token] === entry.tokens[token],
        ),
    );

    expect(exempted.length, "no token needs the doc-domain exemption; drop it").toBeGreaterThan(0);
  });

  it("exercises every named accent leak exemption", () => {
    // Each exemption has to still describe a token that really is in the band and really has not
    // moved for that accent — otherwise the colourway has changed and the hole should close.
    for (const [accentId, tokens] of Object.entries(ACCENT_LEAK_EXEMPTIONS)) {
      for (const token of tokens) {
        const stuck = GRID.filter(
          (entry) =>
            entry.accent.id === accentId &&
            brandBandColours(entry.baseline[token] ?? "").length > 0 &&
            entry.baseline[token] === entry.tokens[token],
        );

        expect(
          stuck.length,
          `${accentId} now moves ${token}, or it left the brand band; drop the exemption`,
        ).toBeGreaterThan(0);
      }
    }
  });
});
