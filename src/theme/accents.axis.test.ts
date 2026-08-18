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
import { ACCENTS, BASE_ACCENT_ID, PRO_ACCENT_SEED_NAMES } from "./accents";
import {
  ACCENT_STYLESHEET_PATH,
  accentDefaultProBlockSelector,
  accentFunBlockSelector,
  accentProBlockSelector,
  buildAccentStylesheetCss,
} from "./accentStylesheet";
import { ACCENT_STORAGE_KEY, BASE_ACCENT, buildThemeBootstrapScript } from "./index";

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
      // A named accent with Pro seeds has to move something, or its block is not reaching the
      // page. The default is exempt from that half and cannot be otherwise: `baseline` is the
      // grid's no-attribute state, which is precisely the state the default's own Pro block
      // matches, so for the default the two sides of this comparison are the same appearance by
      // construction. What its block actually moves is `pro-theme.css`'s authored teal, and that
      // is measured by the seed-for-seed assertion below plus the canvas floor it now clears.
      if (accent.pro && accent.id !== BASE_ACCENT_ID) expect(moved.length).toBeGreaterThan(0);
    },
  );

  it.each(GRID.filter((entry) => entry.visualStyle === "pro" && entry.accent.pro))(
    "re-seats every Pro seed it declares on $label",
    ({ label, accent, theme, tokens }) => {
      // The complement of the assertion above, and the hole the shipped --ei-accent-on-dark leak
      // fell through: that one flags a token that moved WRONGLY, so a token that wrongly failed
      // to move at all was invisible to it. Every seed this accent declares for this scheme has
      // to resolve to the accent's own value here rather than the authored Pro palette's.
      const declared = accent.pro![theme];
      const resolved = Object.fromEntries(
        Object.keys(declared).map((seed) => [seed, toHex(parseColor(tokens[seed]))]),
      );

      expect(resolved, `${label}: a declared seed still resolves the authored Pro value`).toEqual({
        ...declared,
      });

      // --ei-accent-on-dark is the one seed whose value may not vary by scheme, so it is measured
      // against the LIGHT half: a dark half that simply omits the key declares nothing for the
      // loop above to catch, and resolves the authored teal #6fc4bb instead. The rails that read
      // it (pro-theme.css:1304-1307, :1466-1469) are charcoal in both schemes and carry no
      // data-theme, so on a dark Pro page that leak painted a teal wordmark, teal nav icons and a
      // teal search magnifier over a blue, green, red or amber page.
      expect(
        toHex(parseColor(tokens["--ei-accent-on-dark"])),
        `${label}: the on-dark step is not this accent's`,
      ).toBe(accent.pro!.light["--ei-accent-on-dark"]);
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
    // The default's Pro block, verbatim, because its exact shape is what puts it at (0,3,1). The
    // `:not()` is BARE: a bare `:not()` carries the specificity of its argument, so this ties
    // every named accent's Pro block and beats the Pro palette it overrides. Wrapping it in
    // `:where()` would contribute nothing, drop the block to (0,2,1), and hand the tie to import
    // order — pro-theme.css's authored teal would win and dose.wiki's Pro would go back to
    // wearing Effect Index's colour. Asserting the literal is how that stays deliberate.
    expect(accentDefaultProBlockSelector("light")).toBe(
      'html[data-visual-style="pro"]:not([data-accent])[data-theme="light"]',
    );
    expect(accentDefaultProBlockSelector("dark")).toBe(
      'html[data-visual-style="pro"]:not([data-accent])[data-theme="dark"]',
    );
    for (const theme of SCHEMES) expect(css).toContain(accentDefaultProBlockSelector(theme));
    // And the sheet names no accent value for the default from either half — the Fun half emits
    // nothing and the Pro half is keyed by the absence.
    expect(css).not.toContain(`data-accent="${BASE_ACCENT_ID}"`);

    for (const accent of ACCENTS) {
      if (accent.id === BASE_ACCENT_ID) continue;
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

  it("opens on the publication's accent and removes the attribute only for the base", () => {
    const script = buildThemeBootstrapScript(SITE_FLAVOR_CONFIGS.dosewiki);

    // No stored preference: a first-time reader gets the publication's opening accent. That is
    // Neutral on dose.wiki, which owns a real `data-accent` block, so the attribute is WRITTEN.
    // It used to be absent here, back when opening on the base accent was the only option.
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: { getItem: () => null },
    });
    Function(script)();
    expect(SITE_FLAVOR_CONFIGS.dosewiki.defaultAccent).toBe("neutral");
    expect(document.documentElement.dataset.accent).toBe("neutral");

    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: { getItem: (key: string) => (key === ACCENT_STORAGE_KEY ? "blue" : null) },
    });
    Function(script)();
    expect(document.documentElement.dataset.accent).toBe("blue");

    // Picking the base accent has to REMOVE the attribute, not set it to the base id, or the
    // reader ends up matching a block that does not exist. This is the rule the opening accent
    // no longer exercises, so it is the one that most needs asserting directly.
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: { getItem: (key: string) => (key === ACCENT_STORAGE_KEY ? BASE_ACCENT : null) },
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
    // And the validity set is absent too, not merely unused. It grows with the row: seven accents
    // are three and a half times the bytes two were, and the axis has already gained one since
    // that was written. A locked publication that emitted the list would carry a table it can
    // never consult, and would pay a little more for it every time the set widens.
    expect(locked).not.toContain("const ACCENTS =");
    // The whole locked script stays under the unlocked one by a wide margin; a regression that
    // re-emits the resolution would close that gap.
    expect(locked.length).toBeLessThan(
      buildThemeBootstrapScript(SITE_FLAVOR_CONFIGS.dosewiki).length,
    );
    for (const accent of ACCENTS) {
      if (accent.id === BASE_ACCENT_ID) continue;
      expect(locked, `${accent.id} leaked into the locked bootstrap`).not.toContain(
        `"${accent.id}"`,
      );
    }
  });
});
