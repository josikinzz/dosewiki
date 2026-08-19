import { describe, expect, it } from "vitest";

import {
  GRID,
  SWATCH_TOLERANCE,
  deltaEok,
  parseColor,
  read,
  toHex,
} from "@/test/fixtures/accentAppearanceGrid";
import { ACCENTS, BASE_ACCENT_ID, PRO_ACCENT_SEED_NAMES, getAccent, isAccent } from "./accents";
import {
  ACCENT_ATTRIBUTE,
  ACCENT_STYLESHEET_PATH,
  accentDefaultProBlockSelector,
  accentFunBlockSelector,
  buildAccentStylesheetCss,
} from "./accentStylesheet";
import { paletteTokenRole } from "./paletteOwnership";
import { ACCENT_STORAGE_KEY, BASE_ACCENT, SUPPORTED_ACCENTS } from "./index";

/**
 * The accent table, and the shape of what it emits.
 *
 * The axis is measured rather than asserted, and the measuring apparatus — the cascade
 * resolver, the colour maths and the resolved appearance grid — is
 * `src/test/fixtures/accentAppearanceGrid.ts`. The suite is split across four files by concern,
 * all reading that one grid:
 *
 * - this file — the table's structural invariants, the seed key-lists, and swatch honesty.
 * - `accents.contrast.test.ts` — the canvas floors, ink-on-fill, Pro's budgets, the grey floor.
 * - `accents.immunity.test.ts` — harm-reduction immunity and the brand-band leak list.
 * - `accents.axis.test.ts` — containment, the generated selectors, and the bootstrap.
 */

describe("accent table", () => {
  it("agrees with the manifest about which accents exist", () => {
    expect([...SUPPORTED_ACCENTS]).toEqual(ACCENTS.map((accent) => accent.id));
    // Seven, and the seven the contract settled, in order. Named rather than counted: a set that
    // silently grew or lost a member would still satisfy a length check. Order is load-bearing
    // twice over — it is the emission order in the generated sheet and the menu order in the cog
    // — so `default` leads and `teal`, the newest row, trails.
    expect(ACCENTS.map((accent) => accent.id)).toEqual([
      "default",
      "blue",
      "green",
      "red",
      "amber",
      "neutral",
      "teal",
    ]);
    expect(BASE_ACCENT).toBe(BASE_ACCENT_ID);
    expect(ACCENT_STORAGE_KEY).toBe("dosewiki-accent");
    expect(ACCENT_ATTRIBUTE).toBe("data-accent");
  });

  it("degrades an unknown accent to the default rather than erroring", () => {
    for (const accent of ACCENTS) expect(isAccent(accent.id)).toBe(true);
    // A colour scheme, a visual style and a surface are the three ids most likely to arrive here
    // by mistake, from a mis-keyed storage read or a hand-typed attribute. None is an accent, and
    // each has to land on the default rather than on a half-applied block. `orchid` is the sharp
    // one: it is a live id on the surface axis, written to the same root element, so a resolver
    // that accepted it would paint a colourway the cog never advertised on the accent row.
    expect(isAccent("dark")).toBe(false);
    expect(isAccent("pro")).toBe(false);
    expect(isAccent("orchid")).toBe(false);
    expect(getAccent("orchid").id).toBe(BASE_ACCENT_ID);
    expect(getAccent(null).id).toBe(BASE_ACCENT_ID);
    expect(getAccent("blue").funPresetId).toBe("abyss");
    expect(getAccent("green").funPresetId).toBe("canopy");
    expect(getAccent("red").funPresetId).toBe("garnet");
    expect(getAccent("amber").funPresetId).toBe("sunset");
    expect(getAccent("neutral").funPresetId).toBe("graphite");
    expect(getAccent("teal").funPresetId).toBe("lagoon");
  });
});

/* -------------------------------------------------------------------------
 * The seeds.
 * ---------------------------------------------------------------------- */

describe("accent seeds", () => {
  it("keys the default accent by the attribute's absence rather than by its id", () => {
    const defaultAccent = ACCENTS.find((accent) => accent.id === BASE_ACCENT_ID)!;
    const css = buildAccentStylesheetCss([defaultAccent]);

    // The Fun half still emits nothing, and that is not tidiness: Fun's authored palette IS the
    // default, so there is no override to make and a first Fun paint with no attribute is already
    // correct. `null` rather than a colourway id is what says so.
    expect(defaultAccent.funPresetId).toBeNull();
    for (const theme of ["light", "dark"]) {
      expect(css).not.toContain(accentFunBlockSelector(BASE_ACCENT_ID, theme));
    }

    // The Pro half does emit, because pro-theme.css seeds Effect Index's teal and dose.wiki's Pro
    // has to wear dose.wiki's hue. It is keyed by :not([data-accent]) — the absence the bootstrap
    // actually writes — so no selector anywhere in the sheet names a value for this accent.
    expect(defaultAccent.pro).not.toBeNull();
    for (const theme of ["light", "dark"]) {
      expect(css).toContain(accentDefaultProBlockSelector(theme));
    }
    expect(css).not.toContain(`${ACCENT_ATTRIBUTE}="`);
    expect(read(ACCENT_STYLESHEET_PATH)).not.toContain(`${ACCENT_ATTRIBUTE}="${BASE_ACCENT_ID}"`);
  });

  it("declares exactly the Pro seeds the authored palette declares", () => {
    // Derived from pro-theme.css, not from a wish list: --ei-fade and --ei-logo-ink are paper
    // and ink rather than accent, so neither half carries them. --ei-accent-on-dark is authored
    // ONCE (pro-theme.css:134) under a selector list that already includes the dark root, so the
    // authored value is scheme-independent — but an accent's blocks are per-scheme, so both
    // halves have to restate it or the dark half resolves the authored teal. This assertion also
    // pins that the authored seed is never re-authored: Effect Index reads that literal.
    const skin = read("src/styles/pro-theme.css");
    expect(skin).toContain("--ei-accent-on-dark: #6fc4bb;");
    expect(skin.match(/--ei-accent-on-dark:/g)).toHaveLength(1);

    for (const accent of ACCENTS) {
      if (!accent.pro) continue;
      expect(Object.keys(accent.pro.light), `${accent.id} light seeds`).toEqual([
        ...PRO_ACCENT_SEED_NAMES.light,
      ]);
      expect(Object.keys(accent.pro.dark), `${accent.id} dark seeds`).toEqual([
        ...PRO_ACCENT_SEED_NAMES.dark,
      ]);
    }
  });

  it("emits no surface-owned tokens", () => {
    const css = read(ACCENT_STYLESHEET_PATH);
    for (const match of css.matchAll(/(--[a-z0-9-]+)\s*:/g)) {
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
    ({ accent, tokens }) => {
      // Fun dark is the publication's opening appearance, so it is the one appearance a single
      // dot can honestly stand for. Measuring it here is what stops a hand-picked swatch from
      // describing a page nobody renders.
      const rendered = parseColor(tokens["--theme-accent"]);
      const advertised = parseColor(accent.swatch);
      const distance = deltaEok(advertised, rendered);

      expect(
        distance,
        `${accent.id}: swatch ${accent.swatch} is ΔEok ${distance.toFixed(3)} from the rendered ` +
          `Fun-dark --theme-accent ${toHex(rendered)}`,
      ).toBeLessThanOrEqual(SWATCH_TOLERANCE);
    },
  );
});
