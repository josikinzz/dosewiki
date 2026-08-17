import { beforeEach, describe, expect, it } from "vitest";

import { SITE_FLAVOR_CONFIGS } from "@/config/siteFlavor";
import {
  GRID,
  PRO_CANVAS,
  SCHEMES,
  parseColor,
  read,
  toHex,
} from "@/test/fixtures/accentAppearanceGrid";
import { ACCENTS, DEFAULT_ACCENT_ID, PRO_ACCENT_SEED_NAMES } from "./accents";
import {
  ACCENT_STYLESHEET_PATH,
  accentFunBlockSelector,
  accentProBlockSelector,
  buildAccentStylesheetCss,
} from "./accentStylesheet";
import { ACCENT_STORAGE_KEY, DEFAULT_ACCENT, buildThemeBootstrapScript } from "./index";

/**
 * How the axis is wired: what the generator emits, what Pro contains, and what the bootstrap
 * writes before first paint. The apparatus is `src/test/fixtures/accentAppearanceGrid.ts`.
 */

/* -------------------------------------------------------------------------
 * Pro must stay Pro.
 * ---------------------------------------------------------------------- */

describe("visual-style containment", () => {
  it.each(GRID.filter((entry) => entry.visualStyle === "pro"))(
    "paints $label on Pro's own canvas, never the Fun colourway's",
    ({ label, theme, tokens }) => {
      // This is the case that fails if the Fun blocks lose their
      // :where(:not([data-visual-style="pro"])) guard. The accent sheet is imported after
      // pro-theme.css, and a Fun block ties the Pro palette at (0,2,1), so an unguarded Blue
      // handed a Pro page Abyss's navy #020a12 in place of Pro's #131313 — verified by
      // stripping the guard and watching this assertion fail.
      expect(
        toHex(parseColor(tokens["--theme-body-bg"])),
        `${label}: the page canvas left Pro's palette`,
      ).toBe(PRO_CANVAS[theme]);
    },
  );

  it.each(GRID.filter((entry) => entry.visualStyle === "pro"))(
    "moves only accent-derived tokens on $label",
    ({ label, accent, tokens, baseline }) => {
      // On Pro an accent may re-seat --ei-* and nothing else, so every --theme-* token that
      // moves must resolve one of the nine seeds the accent owns. A token that moves without
      // reading a seed is a Fun override that has leaked across the style boundary.
      const seeds = new Set<string>([
        ...PRO_ACCENT_SEED_NAMES.light,
        ...PRO_ACCENT_SEED_NAMES.dark,
      ]);
      const moved = Object.keys(baseline).filter((token) => baseline[token] !== tokens[token]);
      const seedValues = new Set([...seeds].map((seed) => baseline[seed]).filter(Boolean));
      const unexplained = moved.filter(
        (token) => !seeds.has(token) && ![...seedValues].some((value) => baseline[token].includes(value)),
      );

      expect(unexplained, `${label}: ${unexplained.join(", ")} moved without reading an accent seed`)
        .toEqual([]);
      if (accent.pro) expect(moved.length).toBeGreaterThan(0);
    },
  );
});

/* -------------------------------------------------------------------------
 * The generated stylesheet.
 * ---------------------------------------------------------------------- */

describe("accent stylesheet generation", () => {
  it("matches the checked-in stylesheet", () => {
    // The drift check. An accent edited without `npm run generate:accent-css` fails here rather
    // than shipping a palette the definitions no longer describe.
    expect(read(ACCENT_STYLESHEET_PATH)).toBe(buildAccentStylesheetCss());
  });

  it("emits the selector shapes the cascade ladder pins", () => {
    const css = read(ACCENT_STYLESHEET_PATH);

    expect(accentFunBlockSelector("blue", "dark")).toBe(
      'html[data-accent="blue"][data-theme="dark"]:where(:not([data-visual-style="pro"]))',
    );
    expect(accentProBlockSelector("blue", "light")).toBe(
      'html[data-visual-style="pro"][data-accent="blue"][data-theme="light"]',
    );

    for (const accent of ACCENTS) {
      if (accent.id === DEFAULT_ACCENT_ID) continue;
      for (const theme of SCHEMES) {
        expect(css).toContain(accentFunBlockSelector(accent.id, theme));
        expect(css).toContain(accentProBlockSelector(accent.id, theme));
      }
      // The dark-chrome island, so a dark header on a light page wears the accent too.
      expect(css).toContain(
        `${accentFunBlockSelector(accent.id, "light")} .theme-chrome-dark`,
      );
    }
  });
});

/* -------------------------------------------------------------------------
 * The bootstrap.
 * ---------------------------------------------------------------------- */

describe("accent bootstrap", () => {
  beforeEach(() => {
    document.documentElement.removeAttribute("data-accent");
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.removeAttribute("data-visual-style");
  });

  it("leaves the attribute absent for the default and writes it otherwise", () => {
    const script = buildThemeBootstrapScript(SITE_FLAVOR_CONFIGS.dosewiki);

    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: { getItem: () => null },
    });
    Function(script)();
    expect(document.documentElement.dataset.accent).toBeUndefined();

    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: { getItem: (key: string) => (key === ACCENT_STORAGE_KEY ? "blue" : null) },
    });
    Function(script)();
    expect(document.documentElement.dataset.accent).toBe("blue");

    // And back again: switching to the default has to REMOVE the attribute, not set it to the
    // default id, or the reader ends up matching a block that does not exist.
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: { getItem: (key: string) => (key === ACCENT_STORAGE_KEY ? DEFAULT_ACCENT : null) },
    });
    Function(script)();
    expect(document.documentElement.dataset.accent).toBeUndefined();
  });

  it("never names the storage key on a publication that locks the axis", () => {
    const locked = buildThemeBootstrapScript(SITE_FLAVOR_CONFIGS.effectindex);

    expect(SITE_FLAVOR_CONFIGS.effectindex.showAccentPicker).toBe(false);
    expect(SITE_FLAVOR_CONFIGS.dosewiki.showAccentPicker).toBe(true);
    // A lock is not a hidden control: the key is not read and then overridden, it is absent,
    // so a dose.wiki reader's accent cannot follow them into Effect Index's identity.
    expect(locked).not.toContain(ACCENT_STORAGE_KEY);
    // The axis resolves at BUILD time, so the locked script declares no `accent` binding at all
    // and carries no branch over it — it compiles to the single statement that removes the
    // attribute. Asserting the absence of the binding rather than the presence of a constant is
    // what keeps a future edit from reintroducing dead per-page bytes here.
    expect(locked).not.toContain("accent =");
    expect(locked).not.toContain("if (accent");
    expect(locked).toContain("delete root.dataset.accent;");
    // And the validity set is absent too, not merely unused. Six accents is three times the
    // bytes two were, so a locked publication that emitted the list would carry a table it can
    // never consult — and the cost would grow every time the set does.
    expect(locked).not.toContain("const ACCENTS =");
    // The whole locked script stays under the unlocked one by a wide margin; a regression that
    // re-emits the resolution would close that gap.
    expect(locked.length).toBeLessThan(
      buildThemeBootstrapScript(SITE_FLAVOR_CONFIGS.dosewiki).length,
    );
    for (const accent of ACCENTS) {
      if (accent.id === DEFAULT_ACCENT_ID) continue;
      expect(locked, `${accent.id} leaked into the locked bootstrap`).not.toContain(
        `"${accent.id}"`,
      );
    }
  });
});
