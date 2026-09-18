import { describe, expect, it } from "vitest";

import { getPreset } from "@/features/theme-lab/palettePresets";
import {
  GRID,
  SWATCH_TOLERANCE,
  deltaEok,
  parseColor,
  read,
  toHex,
} from "@/test/fixtures/accentAppearanceGrid";
import {
  BASE_ACCENT_ID,
  BASE_ACCENT_PRO_SEEDS,
  BASE_ACCENT_SWATCH,
  LEGACY_ACCENT_TO_HUE,
  PRO_ACCENT_SEED_NAMES,
  isAccent,
} from "./accents";
import {
  ACCENT_ATTRIBUTE,
  accentDefaultProBlockSelector,
  buildAccentStylesheetCss,
} from "./accentStylesheet";
import { paletteTokenRole } from "./paletteOwnership";

/**
 * What remains of the accent axis, and the shape of what it emits.
 *
 * The axis is measured rather than asserted, and the measuring apparatus — the cascade
 * resolver, the colour maths and the resolved appearance grid — is
 * `src/test/fixtures/accentAppearanceGrid.ts`. The suite is split across three files:
 *
 * - this file — the base seeds, swatch honesty, and the legacy migration table.
 * - `accents.contrast.test.ts` — the canvas floors, ink-on-fill, and Pro's budgets.
 * - `accents.axis.test.ts` — containment and the generated stylesheet.
 */

/** The authored base brand hue, read off the sheet rather than restated. */
function baseBrandHue(): number {
  const match = /--h-brand:\s*(\d+)\s*;/.exec(read("src/styles/site-colors.css"));
  expect(match, "site-colors.css no longer declares --h-brand").not.toBeNull();
  return Number(match![1]);
}

/* -------------------------------------------------------------------------
 * The migration table.
 * ---------------------------------------------------------------------- */

describe("legacy accent migration", () => {
  it("keeps exactly the seven retired ids as vocabulary, in the settled order", () => {
    // Named rather than counted: a set that silently grew or lost a member would still satisfy
    // a length check. The order is the retired cog's menu order, kept stable because the table
    // is frozen history rather than a live registry.
    expect(Object.keys(LEGACY_ACCENT_TO_HUE)).toEqual([
      "default",
      "blue",
      "green",
      "red",
      "amber",
      "neutral",
      "teal",
    ]);
    for (const id of Object.keys(LEGACY_ACCENT_TO_HUE)) expect(isAccent(id)).toBe(true);
    // A colour scheme, a visual style and a retired surface id are the values most likely to
    // arrive by mistake from a mis-keyed storage read. None is an accent id.
    expect(isAccent("dark")).toBe(false);
    expect(isAccent("pro")).toBe(false);
    expect(isAccent("orchid")).toBe(false);
    expect(isAccent(null)).toBe(false);
  });

  it("maps every retired chromatic accent to its colourway's authored hue delta", () => {
    const base = baseBrandHue();

    // Each retired accent wore one Fun colourway, and the colourway's authored `--h-brand` is
    // the hue the reader actually saw. The migration hue is that angle minus the base's,
    // normalised — asserted against the authored seeds (which live on as the Theme Lab's
    // preset payloads) so the frozen table cannot silently disagree with what shipped.
    const WORE: Record<string, string> = {
      blue: "abyss",
      green: "canopy",
      red: "garnet",
      amber: "sunset",
      teal: "lagoon",
    };

    for (const [accentId, presetId] of Object.entries(WORE)) {
      const authored = Number(getPreset(presetId).overrides.dark["--h-brand"]);
      expect(Number.isFinite(authored), `${presetId} authors no --h-brand`).toBe(true);

      const expected = (((authored - base) % 360) + 360) % 360;
      const entry = LEGACY_ACCENT_TO_HUE[accentId as keyof typeof LEGACY_ACCENT_TO_HUE];

      expect(entry.hue, `${accentId}: expected ${authored} − ${base} mod 360`).toBe(expected);
      // A chromatic colourway is a rotation, never a grey: a zero shift here would migrate a
      // saved Blue reader onto the base plum.
      expect(entry.hue).toBeGreaterThan(0);
      expect(Number.isInteger(entry.hue)).toBe(true);
      expect(entry.hue).toBeLessThan(360);
      expect(entry.chroma).toBeUndefined();
    }
  });

  it("maps the base and the achromatic accent onto the axes' own vocabulary", () => {
    // The base accent is a zero rotation, not an absent row: the migration writes the mapped
    // value, so the table has to answer for every id the old storage key could hold.
    expect(LEGACY_ACCENT_TO_HUE.default).toEqual({ hue: 0 });
    // Neutral was never a hue — it wore Graphite, the near-zero-chroma colourway — so its heir
    // is saturation level 0. The chroma pin overrides a stored chroma level during migration;
    // a hue rotation of grey would answer nothing.
    expect(LEGACY_ACCENT_TO_HUE.neutral).toEqual({ hue: 0, chroma: 0 });
  });
});

/* -------------------------------------------------------------------------
 * The seeds.
 * ---------------------------------------------------------------------- */

describe("base accent seeds", () => {
  it("keys the base Pro block by the attribute's absence rather than by a value", () => {
    const css = buildAccentStylesheetCss();

    // The Fun half emits nothing, and that is not tidiness: Fun's authored palette IS the base
    // accent, so there is no override to make and a first Fun paint is already correct. The Pro
    // half does emit, because pro-theme.css seeds Effect Index's teal and dose.wiki's Pro has
    // to wear dose.wiki's hue. It is keyed by :not([data-accent]) — nothing writes the retired
    // attribute any more — so no selector in the sheet names an accent by value.
    for (const theme of ["light", "dark"]) {
      expect(css).toContain(accentDefaultProBlockSelector(theme));
    }
    expect(css).not.toContain(`${ACCENT_ATTRIBUTE}="`);
  });

  it("declares exactly the Pro seeds the authored palette declares", () => {
    // Derived from pro-theme.css, not from a wish list: --ei-fade is paper rather than accent,
    // so neither half carries it. --ei-accent-on-dark is authored
    // ONCE (pro-theme.css:134) under a selector list that already includes the dark root, so the
    // authored value is scheme-independent — but the base accent's blocks are per-scheme, so
    // both halves have to restate it or the dark half resolves the authored teal. This also
    // pins that the authored seed is never re-authored: Effect Index reads that literal.
    const skin = read("src/styles/pro-theme.css");
    expect(skin).toContain("--ei-accent-on-dark: #6fc4bb;");
    expect(skin.match(/--ei-accent-on-dark:/g)).toHaveLength(1);

    expect(Object.keys(BASE_ACCENT_PRO_SEEDS.light)).toEqual([...PRO_ACCENT_SEED_NAMES.light]);
    expect(Object.keys(BASE_ACCENT_PRO_SEEDS.dark)).toEqual([...PRO_ACCENT_SEED_NAMES.dark]);
    // One value per accent, not two: the chrome rails are charcoal in either scheme, so "the
    // accent as it appears on a dark bar" cannot vary by scheme.
    expect(BASE_ACCENT_PRO_SEEDS.light["--ei-accent-on-dark"]).toBe(
      BASE_ACCENT_PRO_SEEDS.dark["--ei-accent-on-dark"],
    );
  });

  it("emits no surface-owned tokens", () => {
    for (const match of buildAccentStylesheetCss().matchAll(/(--[a-z0-9-]+)\s*:/g)) {
      expect(paletteTokenRole(match[1]), match[1]).not.toBe("surface");
    }
  });
});

/* -------------------------------------------------------------------------
 * The swatch.
 * ---------------------------------------------------------------------- */

describe("swatch honesty", () => {
  it.each(GRID.filter((entry) => entry.visualStyle === "fun" && entry.theme === "dark"))(
    "advertises what $label actually paints",
    ({ tokens }) => {
      // Fun dark is the publication's opening appearance, so it is the one appearance a single
      // dot can honestly stand for. BASE_ACCENT_SWATCH is what the hue slider's zero-shift end
      // advertises; measuring it against the rendered token is what stops a hand-picked hex
      // from describing a page nobody renders.
      const rendered = parseColor(tokens["--theme-accent"]);
      const advertised = parseColor(BASE_ACCENT_SWATCH);
      const distance = deltaEok(advertised, rendered);

      expect(
        distance,
        `${BASE_ACCENT_ID}: swatch ${BASE_ACCENT_SWATCH} is ΔEok ${distance.toFixed(3)} from ` +
          `the rendered Fun-dark --theme-accent ${toHex(rendered)}`,
      ).toBeLessThanOrEqual(SWATCH_TOLERANCE);
    },
  );
});
