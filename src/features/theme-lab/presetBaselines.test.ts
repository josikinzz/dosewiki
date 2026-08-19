import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ACCENT_ATTRIBUTE } from "@/theme/accentStylesheet";
import { SURFACE_ATTRIBUTE } from "@/theme/surfaceStylesheet";
import { THEME_LAB_OVERRIDE_STYLE_ID, buildOverrideCss } from "./themeLabStorage";
import { lookKey } from "./themeLabLook";
import {
  clearThemeBaselineCache,
  getThemeBaselines,
  sampleRenderedTokens,
} from "./presetBaselines";

/**
 * Revert baselines with the pre-paint bootstrap active.
 *
 * The bootstrap gives the reader's look four carriers, and the sampler treats them
 * in two ways. Two are layers the editor edits *over* and are **neutralized**: the
 * accent attribute (switching on a compiled accent block) and the injected style
 * element. Miss one and "reset this token" silently starts restoring whatever the
 * visitor is already wearing instead of the value the look intends, and the
 * delete-on-equal rule throws away an edit that matches the layer it was made
 * over.
 *
 * The other two — the surface and the visual style — are the *base* being edited
 * and are **held**: the style is staged to the value the panel says is on the page
 * and the surface is simply never touched, because their blocks are the palette
 * these baselines are the baseline of. Stripping either is what makes a reset
 * restore a colour from a look the reader is not on. The style is staged from the
 * caller's value rather than read off the document because the layout effect that
 * samples runs before the passive effect that writes the attribute, so on a cog
 * flip the two disagree for one commit.
 */

const TOKEN = "--theme-accent";
/** A token the *worn surface* re-seats and the staged base says nothing about.
 *  The surface is held, so its value is what a reset should restore. */
const SURFACE_TOKEN = "--theme-panel-base";
/** A Pro accent seed, re-seated only by the accent block — so the accent block is
 *  the only thing between the authored value and the sample. */
const SEED_TOKEN = "--ei-accent";
/** A token the Pro sheet re-seats, standing in for the ~200 real ones. Nothing
 *  else in the fixture touches it, so its value names the style it was read in. */
const STYLE_TOKEN = "--theme-body-bg";
const STOCK = "#111111";
const SURFACE_VALUE = "#222222";
const USER_EDIT = "#333333";
const STAGED_BASE = "#444444";
const ACCENT_VALUE = "#555555";
const PRO_VALUE = "#666666";
/** A later re-seat of the authored value: only a genuine re-sample can see it. */
const RESEATED = "#777777";

/** The look the fixture reader is wearing, in the shape the panel keys with. */
const LOOK = lookKey({ visualStyle: "fun", accent: "blue", surface: "abyss" });

let fixture: HTMLStyleElement;
let overrideEl: HTMLStyleElement;

beforeEach(() => {
  clearThemeBaselineCache();
  document.documentElement.setAttribute("data-theme", "dark");
  // The bootstrap always paints these axes, so the harness does too.
  document.documentElement.setAttribute("data-visual-style", "fun");
  document.documentElement.setAttribute(SURFACE_ATTRIBUTE, "fixture-surface");
  document.documentElement.setAttribute(ACCENT_ATTRIBUTE, "fixture-accent");

  // Stands in for the authored stylesheet plus the generated axis blocks.
  fixture = document.createElement("style");
  fixture.textContent = [
    `html[data-theme="dark"]{${TOKEN}:${STOCK};${SURFACE_TOKEN}:${STOCK};${SEED_TOKEN}:${STOCK};${STYLE_TOKEN}:${STOCK};}`,
    `html[data-theme="light"]{${TOKEN}:${STOCK};${SURFACE_TOKEN}:${STOCK};${SEED_TOKEN}:${STOCK};${STYLE_TOKEN}:${STOCK};}`,
    // The generated surface block, in the (0,2,1) shape the sheet emits for a
    // named Fun surface.
    `html[${SURFACE_ATTRIBUTE}="fixture-surface"][data-theme="dark"]{${SURFACE_TOKEN}:${SURFACE_VALUE};}`,
    // The generated accent block, in the shape the stylesheet emits for Pro.
    `html[${ACCENT_ATTRIBUTE}="fixture-accent"][data-theme="dark"]{${SEED_TOKEN}:${ACCENT_VALUE};}`,
    // Pro re-seating a base token, the way `pro-theme.css` re-seats ~200 of them.
    // Stated for both schemes so a style flip moves the value whichever is worn.
    `html[data-visual-style="pro"]{${STYLE_TOKEN}:${PRO_VALUE};}`,
  ].join("");
  document.head.appendChild(fixture);

  overrideEl = document.createElement("style");
  overrideEl.id = THEME_LAB_OVERRIDE_STYLE_ID;
  overrideEl.textContent = buildOverrideCss({ dark: { [TOKEN]: USER_EDIT }, light: {} });
  document.head.appendChild(overrideEl);
});

afterEach(() => {
  fixture.remove();
  overrideEl.remove();
  document.documentElement.removeAttribute(SURFACE_ATTRIBUTE);
  document.documentElement.removeAttribute(ACCENT_ATTRIBUTE);
  document.documentElement.removeAttribute("data-visual-style");
  clearThemeBaselineCache();
});

describe("revert baselines under the pre-paint bootstrap", () => {
  it("samples the staged base, not the visitor's own injected edit", () => {
    const baselines = getThemeBaselines(LOOK, "fun", {
      dark: { [TOKEN]: STAGED_BASE },
      light: {},
    });

    expect(baselines.dark[TOKEN]).toBe(STAGED_BASE);
    expect(baselines.dark[TOKEN]).not.toBe(USER_EDIT);
    // Light has no staged value, so it falls through to the authored stylesheet
    // — which is exactly what reverting a light token should restore.
    expect(baselines.light[TOKEN]).toBe(STOCK);
  });

  it("keeps the surface the reader is wearing, because that is the palette being edited", () => {
    // The surface block is not a layer over the look — it *is* the look. Strip it
    // and every reset on a named surface restores the base surface's colour, which
    // is a colour the reader has never seen on this page.
    const baselines = getThemeBaselines(LOOK, "fun", {
      dark: { [TOKEN]: STAGED_BASE },
      light: {},
    });

    expect(baselines.dark[SURFACE_TOKEN]).toBe(SURFACE_VALUE);
    expect(baselines.dark[SURFACE_TOKEN]).not.toBe(STOCK);
  });

  it("ignores the accent the visitor is wearing, so an edit over it is a real edit", () => {
    // The accent's own layer, sampled as if it were pristine, is what breaks the
    // delete-on-equal rule: an editor whose seed lands on the accent's value would
    // have that edit compared against the accent itself, read as "no divergence",
    // and dropped. The baseline has to be the authored value underneath.
    const baselines = getThemeBaselines(LOOK, "fun", {
      dark: { [TOKEN]: STAGED_BASE },
      light: {},
    });

    expect(baselines.dark[SEED_TOKEN]).toBe(STOCK);
    expect(baselines.dark[SEED_TOKEN]).not.toBe(ACCENT_VALUE);
  });

  it("puts the document back exactly as it found it", () => {
    getThemeBaselines(LOOK, "fun", { dark: { [TOKEN]: STAGED_BASE }, light: {} });

    expect(document.documentElement.getAttribute(SURFACE_ATTRIBUTE)).toBe("fixture-surface");
    expect(document.documentElement.getAttribute(ACCENT_ATTRIBUTE)).toBe("fixture-accent");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(document.documentElement.getAttribute("data-visual-style")).toBe("fun");
    expect(overrideEl.textContent).toBe(
      buildOverrideCss({ dark: { [TOKEN]: USER_EDIT }, light: {} }),
    );
    // And the visitor is still wearing what they were wearing.
    expect(
      getComputedStyle(document.documentElement).getPropertyValue(TOKEN).trim(),
    ).toBe(USER_EDIT);
  });

  it("does not leave an accent attribute behind when there was none", () => {
    document.documentElement.removeAttribute(ACCENT_ATTRIBUTE);
    clearThemeBaselineCache();

    getThemeBaselines(LOOK, "fun", { dark: { [TOKEN]: STAGED_BASE }, light: {} });

    // The default accent IS the absent attribute, so writing one back would put
    // the visitor on an accent they never chose.
    expect(document.documentElement.hasAttribute(ACCENT_ATTRIBUTE)).toBe(false);
  });

  it("does not leave a visual style behind when there was none", () => {
    // The sampler stages this attribute, so it is the one axis that could invent a
    // value the reader never had. A document with no style is a bare test render,
    // not a reader — but it has to be handed back bare either way.
    document.documentElement.removeAttribute("data-visual-style");
    clearThemeBaselineCache();

    getThemeBaselines(LOOK, "pro", { dark: { [TOKEN]: STAGED_BASE }, light: {} });

    expect(document.documentElement.hasAttribute("data-visual-style")).toBe(false);
  });

  it("strands nothing when the sample throws part-way through", () => {
    // The whole point of reading every attribute before writing any and keeping
    // every write inside the `try`: this throw lands after the accent has been
    // stripped and the style has been staged. Without the `finally` the reader is
    // left on a page in the wrong visual style with no accent.
    const appendChild = vi
      .spyOn(document.head, "appendChild")
      .mockImplementation(() => {
        throw new Error("stylesheet insertion blocked");
      });

    try {
      expect(() =>
        getThemeBaselines(LOOK, "pro", { dark: { [TOKEN]: STAGED_BASE }, light: {} }),
      ).toThrow("stylesheet insertion blocked");

      expect(document.documentElement.getAttribute("data-visual-style")).toBe("fun");
      expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
      expect(document.documentElement.getAttribute(SURFACE_ATTRIBUTE)).toBe("fixture-surface");
      expect(document.documentElement.getAttribute(ACCENT_ATTRIBUTE)).toBe("fixture-accent");
      expect(overrideEl.textContent).toBe(
        buildOverrideCss({ dark: { [TOKEN]: USER_EDIT }, light: {} }),
      );
    } finally {
      appendChild.mockRestore();
    }
  });
});

/**
 * The visual-style axis, which #119 made reachable by lifting the force-lock that
 * had pinned the lab's route to Fun. Everything here fails against a sampler that
 * keys baselines on the look alone, and the failure is invisible on screen: it
 * produces wrong *storage*, not a wrong pixel.
 */
describe("revert baselines across a visual-style switch", () => {
  const BASE = { dark: { [TOKEN]: STAGED_BASE }, light: {} };

  it("hands each style its own baselines rather than the first one sampled", () => {
    // The shipped bug: sample in Fun, flip the cog, and the cached Fun sample is
    // handed to a Pro page. Delete-on-equal then keeps an edit that equals the Pro
    // value as a divergence it is not, and drops an edit that equals the stale Fun
    // value even though it visibly moves the Pro page.
    const fun = getThemeBaselines(LOOK, "fun", BASE);
    expect(fun.dark[STYLE_TOKEN]).toBe(STOCK);

    document.documentElement.setAttribute("data-visual-style", "pro");
    const pro = getThemeBaselines(LOOK, "pro", BASE);

    expect(pro.dark[STYLE_TOKEN]).toBe(PRO_VALUE);
    expect(pro.dark[STYLE_TOKEN]).not.toBe(STOCK);
    // And Fun's entry is still Fun's — flipping back is a cache hit, not a re-read
    // of whatever is on the document now.
    document.documentElement.setAttribute("data-visual-style", "fun");
    expect(getThemeBaselines(LOOK, "fun", BASE).dark[STYLE_TOKEN]).toBe(STOCK);
  });

  it("samples the style it is told, not the one the document still carries", () => {
    // Pins the effect-ordering hazard that decides the whole design. The panel
    // samples from a layout effect (`ThemeLab.tsx`) and the one appearance owner
    // writes `data-visual-style` from a passive effect (`ThemeContext.tsx`), and the
    // layout effect runs before the passive write — so for one commit after a cog
    // flip the React value is already "pro" while the attribute still says "fun".
    // That disagreement is staged here deliberately. A sampler that read the style
    // off the document would file Fun's values under the Pro key and poison the
    // entry for the rest of the session, which is worse than the bug above: it
    // survives every later flip instead of re-sampling on remount.
    expect(document.documentElement.getAttribute("data-visual-style")).toBe("fun");

    const pro = getThemeBaselines(LOOK, "pro", BASE);

    expect(pro.dark[STYLE_TOKEN]).toBe(PRO_VALUE);
    // The disagreement is not resolved by the sampler, only survived: the attribute
    // is handed back untouched for the passive write to land on.
    expect(document.documentElement.getAttribute("data-visual-style")).toBe("fun");
  });

  it("gives each look its own entry rather than the first look sampled", () => {
    // Two looks, one style: an entry keyed on the style alone would hand the second
    // look the first one's pristine values, and every reset on it would restore a
    // colour from a surface the reader left.
    const other = lookKey({ visualStyle: "fun", accent: "red", surface: "garnet" });

    expect(getThemeBaselines(LOOK, "fun", BASE).dark[TOKEN]).toBe(STAGED_BASE);
    expect(
      getThemeBaselines(other, "fun", { dark: { [TOKEN]: RESEATED }, light: {} }).dark[TOKEN],
    ).toBe(RESEATED);
    // …and the first look's entry is untouched by the second's sample.
    expect(getThemeBaselines(LOOK, "fun", BASE).dark[TOKEN]).toBe(STAGED_BASE);
  });

  it("re-samples every style variant after the cache is cleared", () => {
    expect(getThemeBaselines(LOOK, "fun", BASE).dark[STYLE_TOKEN]).toBe(STOCK);
    expect(getThemeBaselines(LOOK, "pro", BASE).dark[STYLE_TOKEN]).toBe(PRO_VALUE);

    clearThemeBaselineCache();
    // Re-seat the authored value: only a genuine re-sample can see this.
    const reseat = document.createElement("style");
    reseat.textContent = `html[data-theme="dark"]{${STYLE_TOKEN}:${RESEATED};}html[data-visual-style="pro"]{${STYLE_TOKEN}:${RESEATED};}`;
    document.head.appendChild(reseat);

    try {
      expect(getThemeBaselines(LOOK, "fun", BASE).dark[STYLE_TOKEN]).toBe(RESEATED);
      expect(getThemeBaselines(LOOK, "pro", BASE).dark[STYLE_TOKEN]).toBe(RESEATED);
    } finally {
      reseat.remove();
    }
  });
});

describe("rendered token samples", () => {
  it("reads a combination the visitor is not wearing, then hands the document back", () => {
    // What the accent export needs: the accent's seed as it renders, in the scheme
    // the accent table states it in, measured from a page showing something else.
    const sampled = sampleRenderedTokens([SEED_TOKEN], {
      visualStyle: "pro",
      colorScheme: "light",
    });

    // Light has no accent block in the fixture, so this is the authored value —
    // and it is NOT the dark accent value the visitor is looking at.
    expect(sampled[SEED_TOKEN]).toBe(STOCK);
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(document.documentElement.getAttribute("data-visual-style")).toBe("fun");
    expect(document.documentElement.getAttribute(ACCENT_ATTRIBUTE)).toBe("fixture-accent");
  });

  it("keeps the visitor's own layer in play, because that is what is being exported", () => {
    // The opposite of a baseline: an edit the visitor made is part of the accent
    // they are handing back to the repository, so it must be in the reading.
    const sampled = sampleRenderedTokens([TOKEN], { visualStyle: "fun", colorScheme: "dark" });

    expect(sampled[TOKEN]).toBe(USER_EDIT);
  });
});
