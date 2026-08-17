import { describe, expect, it } from "vitest";

import { PALETTE_PRESETS } from "@/features/theme-lab/palettePresets";
import {
  GRID,
  SWATCH_TOLERANCE,
  deltaEok,
  parseColor,
  read,
  toHex,
} from "@/test/fixtures/accentAppearanceGrid";
import { ACCENTS, DEFAULT_ACCENT_ID, PRO_ACCENT_SEED_NAMES, getAccent, isAccent } from "./accents";
import {
  ACCENT_ATTRIBUTE,
  ACCENT_STYLESHEET_PATH,
  buildAccentStylesheetCss,
} from "./accentStylesheet";
import { ACCENT_STORAGE_KEY, DEFAULT_ACCENT, SUPPORTED_ACCENTS } from "./index";

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
    // Six, and the six the contract settled. Named rather than counted: a set that silently
    // grew or lost a member would still satisfy a length check.
    expect(ACCENTS.map((accent) => accent.id)).toEqual([
      "default",
      "blue",
      "green",
      "red",
      "amber",
      "neutral",
    ]);
    expect(DEFAULT_ACCENT).toBe(DEFAULT_ACCENT_ID);
    expect(ACCENT_STORAGE_KEY).toBe("dosewiki-accent");
    expect(ACCENT_ATTRIBUTE).toBe("data-accent");
  });

  it("keeps the Lab-only colourways out of the accent row and still resolving", () => {
    // Letterpress is the case worth naming: `journal` is a Fun colourway that imitates Pro, and
    // it is deliberately NOT an accent — a reader who wants Pro picks the visual style. Its id is
    // frozen even so, because editors have saved palettes pointing at it, so it has to keep
    // resolving as a colourway while being absent from the accent row. The jokes and the
    // seasonals are the same shape: fun to wear from the Lab, not a publication appearance.
    const LAB_ONLY = [
      "journal",
      "halloween",
      "yuletide",
      "liberty",
      "twilight",
      "parchment",
    ] as const;
    for (const id of LAB_ONLY) {
      expect(
        PALETTE_PRESETS.find((preset) => preset.id === id),
        `${id} no longer resolves as a colourway; editors have palettes saved against it`,
      ).toBeDefined();
      expect(
        ACCENTS.some((accent) => accent.funPresetId === id),
        `${id} is a Lab-only colourway and must not be an accent`,
      ).toBe(false);
      // And not as an accent ID either: an accent row is a list of ids, and a colourway id that
      // happened to resolve there would render a palette the cog never advertised.
      expect(isAccent(id)).toBe(false);
      expect(getAccent(id).id).toBe(DEFAULT_ACCENT_ID);
    }
  });

  it("degrades an unknown accent to the default rather than erroring", () => {
    for (const accent of ACCENTS) expect(isAccent(accent.id)).toBe(true);
    // A colour scheme, a visual style and a colourway are the three ids most likely to arrive
    // here by mistake, from a mis-keyed storage read or a hand-typed attribute. None is an
    // accent, and each has to land on the accent that emits nothing rather than on a
    // half-applied block.
    expect(isAccent("dark")).toBe(false);
    expect(isAccent("pro")).toBe(false);
    expect(isAccent("journal")).toBe(false);
    expect(getAccent("journal").id).toBe(DEFAULT_ACCENT_ID);
    expect(getAccent(null).id).toBe(DEFAULT_ACCENT_ID);
    expect(getAccent("blue").funPresetId).toBe("abyss");
    expect(getAccent("green").funPresetId).toBe("canopy");
    expect(getAccent("red").funPresetId).toBe("garnet");
    expect(getAccent("amber").funPresetId).toBe("sunset");
    expect(getAccent("neutral").funPresetId).toBe("graphite");
  });
});

/* -------------------------------------------------------------------------
 * The seeds.
 * ---------------------------------------------------------------------- */

describe("accent seeds", () => {
  it("emits nothing at all for the default accent", () => {
    const defaultAccent = ACCENTS.find((accent) => accent.id === DEFAULT_ACCENT_ID)!;

    expect(defaultAccent.funPresetId).toBeNull();
    expect(defaultAccent.pro).toBeNull();
    // Not "emits an empty block": emits no block. Zero overrides is what makes a first paint
    // with no attribute already correct, so a block here — even an empty one — would mean the
    // default had become a thing the cascade has to resolve.
    expect(buildAccentStylesheetCss([defaultAccent])).toBe(buildAccentStylesheetCss([]));
    expect(read(ACCENT_STYLESHEET_PATH)).not.toContain(`${ACCENT_ATTRIBUTE}="${DEFAULT_ACCENT_ID}"`);
  });

  it("declares exactly the Pro seeds the authored palette declares", () => {
    // Derived from pro-theme.css, not from a wish list: --ei-accent-on-dark is declared once,
    // in the light block, because the chrome rails read it in both schemes, and --ei-fade and
    // --ei-logo-ink are paper and ink rather than accent.
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

  it("reads the Fun half out of the colourway rather than copying it", () => {
    const css = read(ACCENT_STYLESHEET_PATH);

    for (const accent of ACCENTS) {
      if (!accent.funPresetId) continue;
      const preset = PALETTE_PRESETS.find((candidate) => candidate.id === accent.funPresetId);
      expect(preset, `${accent.id} names a colourway that exists`).toBeDefined();

      for (const [token, value] of Object.entries(preset!.overrides.dark)) {
        expect(css).toContain(`  ${token}: ${value};`);
      }
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
