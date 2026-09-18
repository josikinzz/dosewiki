import { describe, expect, it } from "vitest";

import {
  GRID,
  PRO_CANVAS,
  SCHEMES,
  parseColor,
  read,
  toHex,
} from "@/test/fixtures/accentAppearanceGrid";
import { BASE_ACCENT_PRO_SEEDS } from "./accents";
import {
  ACCENT_STYLESHEET_PATH,
  accentDefaultProBlockSelector,
  buildAccentStylesheetCss,
} from "./accentStylesheet";

/**
 * How the axis is wired: what the generator emits, and that Pro stays Pro. The apparatus is
 * `src/test/fixtures/accentAppearanceGrid.ts`. The hue-rotation runtime that replaced the named
 * accents is covered where it lives: the generated chroma stylesheet in
 * `chromaStylesheet.test.ts`, and the bootstrap (including the legacy-id migration) in
 * `index.test.ts`.
 */

/* -------------------------------------------------------------------------
 * Pro must stay Pro.
 * ---------------------------------------------------------------------- */

describe("visual-style containment", () => {
  it.each(GRID.filter((entry) => entry.visualStyle === "pro"))(
    "paints $label on Pro's own canvas, never the Fun palette's",
    ({ label, theme, tokens }) => {
      // The accent sheet is imported after pro-theme.css; its one block-pair is Pro-scoped by
      // construction, and the surface sheet's Fun block carries the
      // :where(:not([data-visual-style="pro"])) guard. This is the case that fails if that
      // guard is ever dropped: the Fun block ties the Pro palette at (0,2,1) and the later
      // sheet would win, handing a Pro page the Fun canvas instead of Pro's own.
      expect(
        toHex(parseColor(tokens["--theme-body-bg"])),
        `${label}: the page canvas left Pro's palette`,
      ).toBe(PRO_CANVAS[theme]);
    },
  );

  it.each(GRID.filter((entry) => entry.visualStyle === "pro"))(
    "re-seats every declared Pro seed on $label",
    ({ label, theme, tokens }) => {
      // Every seed the base accent declares for this scheme has to resolve to its own value
      // rather than pro-theme.css's authored teal — a seed that fails to move is invisible to
      // any "moved wrongly" check, which is the hole the shipped --ei-accent-on-dark leak fell
      // through.
      const declared = BASE_ACCENT_PRO_SEEDS[theme];
      const resolved = Object.fromEntries(
        Object.keys(declared).map((seed) => [seed, toHex(parseColor(tokens[seed]))]),
      );

      expect(resolved, `${label}: a declared seed still resolves the authored Pro value`).toEqual(
        { ...declared },
      );

      // --ei-accent-on-dark is the one seed whose value may not vary by scheme, so it is
      // measured against the LIGHT half: a dark half that simply omitted the key would declare
      // nothing for the loop above to catch, and resolve the authored teal #6fc4bb instead. The
      // rails that read it (pro-theme.css:1304-1307, :1466-1469) are charcoal in both schemes
      // and carry no data-theme, so that leak painted a teal wordmark, teal nav icons and a
      // teal search magnifier over a plum page.
      expect(
        toHex(parseColor(tokens["--ei-accent-on-dark"])),
        `${label}: the on-dark step is not the base accent's`,
      ).toBe(BASE_ACCENT_PRO_SEEDS.light["--ei-accent-on-dark"]);
    },
  );
});

/* -------------------------------------------------------------------------
 * The generated stylesheet.
 * ---------------------------------------------------------------------- */

describe("accent stylesheet generation", () => {
  it("matches the checked-in stylesheet", () => {
    // The drift check. A seed edited without `npm run generate:accent-css` fails here rather
    // than shipping a palette the definitions no longer describe.
    expect(read(ACCENT_STYLESHEET_PATH)).toBe(buildAccentStylesheetCss());
  });

  it("emits the selector shapes the cascade ladder pins", () => {
    const css = buildAccentStylesheetCss();

    // The base Pro block, verbatim, because its exact shape is what puts it at (0,3,1). The
    // `:not()` is BARE: a bare `:not()` carries the specificity of its argument, so this block
    // beats the Pro palette it overrides from wherever the bundler drops it. Wrapping it in
    // `:where()` would contribute nothing, drop the block to (0,2,1), and hand the tie to
    // import order — pro-theme.css's authored teal would win and dose.wiki's Pro would go back
    // to wearing Effect Index's colour. Asserting the literal is how that stays deliberate.
    expect(accentDefaultProBlockSelector("light")).toBe(
      'html[data-visual-style="pro"]:not([data-accent])[data-theme="light"]',
    );
    expect(accentDefaultProBlockSelector("dark")).toBe(
      'html[data-visual-style="pro"]:not([data-accent])[data-theme="dark"]',
    );
    for (const theme of SCHEMES) expect(css).toContain(accentDefaultProBlockSelector(theme));

    // The named accents are retired: the sheet names no accent by value from either half — the
    // Fun half emits nothing and the Pro half is keyed by the absence. A value selector
    // reappearing here means a colourway block came back without its axis.
    expect(css).not.toContain('data-accent="');
  });
});
