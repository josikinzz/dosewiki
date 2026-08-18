import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ACCENT_ATTRIBUTE } from "@/theme/accentStylesheet";
import {
  PALETTE_ATTRIBUTE,
  PALETTE_LAB_OVERRIDE_STYLE_ID,
  buildOverrideCss,
} from "./paletteLabStorage";
import {
  clearThemeBaselineCache,
  getThemeBaselines,
  sampleRenderedTokens,
} from "./presetBaselines";
import { presetBlockSelector } from "./presetStylesheet";

/**
 * Revert baselines with the pre-paint bootstrap active.
 *
 * The bootstrap gives the visitor's look four carriers, and the sampler treats
 * them in two ways. Three are layers the editor edits *over* and are
 * **neutralized**: the palette attribute and the accent attribute (each switching
 * on a compiled block) and the injected style element. Miss one and "reset this
 * token" silently starts restoring whatever the visitor is already wearing
 * instead of the value the theme intends, and the delete-on-equal rule throws
 * away an edit that matches the layer it was made over.
 *
 * The fourth — the visual style — is the *base* being edited and is **held**:
 * staged to the style the panel says is on the page, never stripped, because
 * stripping it is what hands a Pro page Fun's baselines. It is staged from the
 * caller's value rather than read off the document because the layout effect that
 * samples runs before the passive effect that writes the attribute, so on a cog
 * flip the two disagree for one commit.
 */

const TOKEN = "--theme-accent";
/** A token the *worn* palette re-seats and the *sampled* theme does not. */
const UNSTAGED_TOKEN = "--theme-panel-base";
/** A Pro accent seed: no palette names one, so the accent block is the only
 *  thing between the authored value and the sample. */
const SEED_TOKEN = "--ei-accent";
/** A token the Pro sheet re-seats, standing in for the ~200 real ones. Nothing
 *  else in the fixture touches it, so its value names the style it was read in. */
const STYLE_TOKEN = "--theme-body-bg";
const STOCK = "#111111";
const COMPILED_PRESET = "#222222";
const USER_EDIT = "#333333";
const THEME_OWN_VALUE = "#444444";
const ACCENT_VALUE = "#555555";
const PRO_VALUE = "#666666";
/** A later re-seat of the authored value: only a genuine re-sample can see it. */
const RESEATED = "#777777";

let fixture: HTMLStyleElement;
let overrideEl: HTMLStyleElement;

beforeEach(() => {
  clearThemeBaselineCache();
  document.documentElement.setAttribute("data-theme", "dark");
  // The bootstrap always paints this axis, so the harness does too.
  document.documentElement.setAttribute("data-visual-style", "fun");
  document.documentElement.setAttribute(PALETTE_ATTRIBUTE, "fixture");
  document.documentElement.setAttribute(ACCENT_ATTRIBUTE, "fixture-accent");

  // Stands in for the authored stylesheet plus the generated preset block.
  fixture = document.createElement("style");
  fixture.textContent = [
    `html[data-theme="dark"]{${TOKEN}:${STOCK};${UNSTAGED_TOKEN}:${STOCK};${SEED_TOKEN}:${STOCK};${STYLE_TOKEN}:${STOCK};}`,
    `html[data-theme="light"]{${TOKEN}:${STOCK};${UNSTAGED_TOKEN}:${STOCK};${SEED_TOKEN}:${STOCK};${STYLE_TOKEN}:${STOCK};}`,
    `${presetBlockSelector("fixture", "dark")}{${TOKEN}:${COMPILED_PRESET};${UNSTAGED_TOKEN}:${COMPILED_PRESET};}`,
    // The generated accent block, in the shape the stylesheet emits for Pro.
    `html[${ACCENT_ATTRIBUTE}="fixture-accent"][data-theme="dark"]{${SEED_TOKEN}:${ACCENT_VALUE};}`,
    // Pro re-seating a base token, the way `pro-theme.css` re-seats ~200 of them.
    // Stated for both schemes so a style flip moves the value whichever is worn.
    `html[data-visual-style="pro"]{${STYLE_TOKEN}:${PRO_VALUE};}`,
  ].join("");
  document.head.appendChild(fixture);

  overrideEl = document.createElement("style");
  overrideEl.id = PALETTE_LAB_OVERRIDE_STYLE_ID;
  overrideEl.textContent = buildOverrideCss({ dark: { [TOKEN]: USER_EDIT }, light: {} });
  document.head.appendChild(overrideEl);
});

afterEach(() => {
  fixture.remove();
  overrideEl.remove();
  document.documentElement.removeAttribute(PALETTE_ATTRIBUTE);
  document.documentElement.removeAttribute(ACCENT_ATTRIBUTE);
  document.documentElement.removeAttribute("data-visual-style");
  clearThemeBaselineCache();
});

describe("revert baselines under the pre-paint bootstrap", () => {
  it("samples the theme's own value, not the compiled preset or the visitor's edit", () => {
    const baselines = getThemeBaselines("fixture", "fun", {
      dark: { [TOKEN]: THEME_OWN_VALUE },
      light: {},
    });

    expect(baselines.dark[TOKEN]).toBe(THEME_OWN_VALUE);
    // Light has no staged value, so it falls through to the authored stylesheet
    // — which is exactly what reverting a light token should restore.
    expect(baselines.light[TOKEN]).toBe(STOCK);
  });

  it("ignores a palette the visitor is wearing but is not the one being sampled", () => {
    // The killer case for the palette attribute: the worn palette re-seats a
    // token the sampled theme says nothing about. Left switched on, its value
    // would be recorded as the sampled theme's own — so reverting that token
    // would restore a colour from a different palette entirely.
    const baselines = getThemeBaselines("fixture", "fun", {
      dark: { [TOKEN]: THEME_OWN_VALUE },
      light: {},
    });

    expect(baselines.dark[UNSTAGED_TOKEN]).toBe(STOCK);
    expect(baselines.dark[UNSTAGED_TOKEN]).not.toBe(COMPILED_PRESET);
  });

  it("ignores the accent the visitor is wearing, so an edit over it is a real edit", () => {
    // The accent's own layer, sampled as if it were pristine, is what breaks the
    // delete-on-equal rule: an editor whose seed lands on the accent's value would
    // have that edit compared against the accent itself, read as "no divergence",
    // and dropped. The baseline has to be the authored value underneath.
    const baselines = getThemeBaselines("fixture", "fun", {
      dark: { [TOKEN]: THEME_OWN_VALUE },
      light: {},
    });

    expect(baselines.dark[SEED_TOKEN]).toBe(STOCK);
    expect(baselines.dark[SEED_TOKEN]).not.toBe(ACCENT_VALUE);
  });

  it("puts the document back exactly as it found it", () => {
    getThemeBaselines("fixture", "fun", { dark: { [TOKEN]: THEME_OWN_VALUE }, light: {} });

    expect(document.documentElement.getAttribute(PALETTE_ATTRIBUTE)).toBe("fixture");
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

  it("does not leave a palette attribute behind when there was none", () => {
    document.documentElement.removeAttribute(PALETTE_ATTRIBUTE);
    clearThemeBaselineCache();

    const baselines = getThemeBaselines("no-palette", "fun", {
      dark: { [TOKEN]: THEME_OWN_VALUE },
      light: {},
    });

    expect(baselines.dark[TOKEN]).toBe(THEME_OWN_VALUE);
    expect(document.documentElement.hasAttribute(PALETTE_ATTRIBUTE)).toBe(false);
  });

  it("does not leave an accent attribute behind when there was none", () => {
    document.documentElement.removeAttribute(ACCENT_ATTRIBUTE);
    clearThemeBaselineCache();

    getThemeBaselines("no-accent", "fun", { dark: { [TOKEN]: THEME_OWN_VALUE }, light: {} });

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

    getThemeBaselines("no-style", "pro", { dark: { [TOKEN]: THEME_OWN_VALUE }, light: {} });

    expect(document.documentElement.hasAttribute("data-visual-style")).toBe(false);
  });

  it("strands nothing when the sample throws part-way through", () => {
    // The whole point of reading every attribute before writing any and keeping
    // every write inside the `try`: this throw lands after the palette and accent
    // have been stripped and the style has been staged. Without the `finally` the
    // reader is left on a page in the wrong visual style with no palette.
    const appendChild = vi
      .spyOn(document.head, "appendChild")
      .mockImplementation(() => {
        throw new Error("stylesheet insertion blocked");
      });

    try {
      expect(() =>
        getThemeBaselines("throws", "pro", { dark: { [TOKEN]: THEME_OWN_VALUE }, light: {} }),
      ).toThrow("stylesheet insertion blocked");

      expect(document.documentElement.getAttribute("data-visual-style")).toBe("fun");
      expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
      expect(document.documentElement.getAttribute(PALETTE_ATTRIBUTE)).toBe("fixture");
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
 * keys baselines on the theme alone, and the failure is invisible on screen: it
 * produces wrong *storage*, not a wrong pixel.
 */
describe("revert baselines across a visual-style switch", () => {
  const BASE = { dark: { [TOKEN]: THEME_OWN_VALUE }, light: {} };

  it("hands each style its own baselines rather than the first one sampled", () => {
    // The shipped bug: sample in Fun, flip the cog, and the cached Fun sample is
    // handed to a Pro page. Delete-on-equal then keeps an edit that equals the Pro
    // value as a divergence it is not, and drops an edit that equals the stale Fun
    // value even though it visibly moves the Pro page.
    const fun = getThemeBaselines("fixture", "fun", BASE);
    expect(fun.dark[STYLE_TOKEN]).toBe(STOCK);

    document.documentElement.setAttribute("data-visual-style", "pro");
    const pro = getThemeBaselines("fixture", "pro", BASE);

    expect(pro.dark[STYLE_TOKEN]).toBe(PRO_VALUE);
    expect(pro.dark[STYLE_TOKEN]).not.toBe(STOCK);
    // And Fun's entry is still Fun's — flipping back is a cache hit, not a re-read
    // of whatever is on the document now.
    document.documentElement.setAttribute("data-visual-style", "fun");
    expect(getThemeBaselines("fixture", "fun", BASE).dark[STYLE_TOKEN]).toBe(STOCK);
  });

  it("samples the style it is told, not the one the document still carries", () => {
    // Pins the effect-ordering hazard that decides the whole design. The panel
    // samples from a layout effect (`PaletteLab.tsx`) and the one appearance owner
    // writes `data-visual-style` from a passive effect (`ThemeContext.tsx`), and the
    // layout effect runs before the passive write — so for one commit after a cog
    // flip the React value is already "pro" while the attribute still says "fun".
    // That disagreement is staged here deliberately. A sampler that read the style
    // off the document would file Fun's values under the Pro key and poison the
    // entry for the rest of the session, which is worse than the bug above: it
    // survives every later flip instead of re-sampling on remount.
    expect(document.documentElement.getAttribute("data-visual-style")).toBe("fun");

    const pro = getThemeBaselines("fixture", "pro", BASE);

    expect(pro.dark[STYLE_TOKEN]).toBe(PRO_VALUE);
    // The disagreement is not resolved by the sampler, only survived: the attribute
    // is handed back untouched for the passive write to land on.
    expect(document.documentElement.getAttribute("data-visual-style")).toBe("fun");
  });

  it("forgets every style variant of a deleted slot, not just the worn one", () => {
    // A deleted custom slot's key can be handed to a later slot. Callers name a
    // theme and have no opinion about Fun or Pro, so a variant left behind is a
    // stale baseline the recycled slot silently inherits.
    expect(getThemeBaselines("fixture", "fun", BASE).dark[STYLE_TOKEN]).toBe(STOCK);
    expect(getThemeBaselines("fixture", "pro", BASE).dark[STYLE_TOKEN]).toBe(PRO_VALUE);

    clearThemeBaselineCache("fixture");
    // Re-seat the authored value: only a genuine re-sample can see this.
    const reseat = document.createElement("style");
    reseat.textContent = `html[data-theme="dark"]{${STYLE_TOKEN}:${RESEATED};}html[data-visual-style="pro"]{${STYLE_TOKEN}:${RESEATED};}`;
    document.head.appendChild(reseat);

    try {
      expect(getThemeBaselines("fixture", "fun", BASE).dark[STYLE_TOKEN]).toBe(RESEATED);
      expect(getThemeBaselines("fixture", "pro", BASE).dark[STYLE_TOKEN]).toBe(RESEATED);
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
