import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { THEME_LAB_OVERRIDE_STYLE_ID, buildOverrideCss } from "./themeLabStorage";
import { DEFAULT_LOOK, lookKey } from "./themeLabLook";
import {
  clearThemeBaselineCache,
  getThemeBaselines,
  sampleRenderedTokens,
} from "./presetBaselines";

/**
 * Revert baselines with the pre-paint bootstrap active.
 *
 * The bootstrap gives the reader's look three carriers, and the sampler treats
 * them in two ways. One is a layer the editor edits *over* and is
 * **neutralized**: the injected style element. Miss it and "reset this token"
 * silently starts restoring whatever the visitor is already wearing instead of
 * the value the look intends, and the delete-on-equal rule throws away an edit
 * that matches the layer it was made over.
 *
 * The other two — the visual style, and the hue/saturation rotation the
 * reader's `--dw-*` properties apply — are the *base* being edited and are
 * **held**: the style is staged to the value the panel says is on the page and
 * the rotation is simply never touched, because they are the palette these
 * baselines are the baseline of. The style is staged from the caller's value
 * rather than read off the document because the layout effect that samples runs
 * before the passive effect that writes the attribute, so on a cog flip the two
 * disagree for one commit.
 */

const TOKEN = "--theme-accent";
/** A Pro accent seed the fixture only authors once, so a light sample falls
 *  through to the authored stylesheet. */
const SEED_TOKEN = "--ei-accent";
/** A token the Pro sheet re-seats, standing in for the ~200 real ones. Nothing
 *  else in the fixture touches it, so its value names the style it was read in. */
const STYLE_TOKEN = "--theme-body-bg";
const STOCK = "#111111";
const USER_EDIT = "#333333";
const STAGED_BASE = "#444444";
const PRO_VALUE = "#666666";
/** A later re-seat of the authored value: only a genuine re-sample can see it. */
const RESEATED = "#777777";

/** The look the fixture reader is wearing, in the shape the panel keys with. */
const LOOK = lookKey(DEFAULT_LOOK);

let fixture: HTMLStyleElement;
let overrideEl: HTMLStyleElement;

beforeEach(() => {
  clearThemeBaselineCache();
  document.documentElement.setAttribute("data-theme", "dark");
  // The bootstrap always paints this axis, so the harness does too.
  document.documentElement.setAttribute("data-visual-style", "fun");

  // Stands in for the authored stylesheet plus the generated chroma blocks.
  fixture = document.createElement("style");
  fixture.textContent = [
    `html[data-theme="dark"]{${TOKEN}:${STOCK};${SEED_TOKEN}:${STOCK};${STYLE_TOKEN}:${STOCK};}`,
    `html[data-theme="light"]{${TOKEN}:${STOCK};${SEED_TOKEN}:${STOCK};${STYLE_TOKEN}:${STOCK};}`,
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

  it("puts the document back exactly as it found it", () => {
    getThemeBaselines(LOOK, "fun", { dark: { [TOKEN]: STAGED_BASE }, light: {} });

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
    // every write inside the `try`: this throw lands after the style has been
    // staged. Without the `finally` the reader is left on a page in the wrong
    // visual style with their own edits blanked.
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
    // What the accent export needs: the seed as it renders, in the scheme the
    // accent table states it in, measured from a page showing something else.
    const sampled = sampleRenderedTokens([SEED_TOKEN], {
      visualStyle: "pro",
      colorScheme: "light",
    });

    expect(sampled[SEED_TOKEN]).toBe(STOCK);
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(document.documentElement.getAttribute("data-visual-style")).toBe("fun");
  });

  it("keeps the visitor's own layer in play, because that is what is being exported", () => {
    // The opposite of a baseline: an edit the visitor made is part of the accent
    // they are handing back to the repository, so it must be in the reading.
    const sampled = sampleRenderedTokens([TOKEN], { visualStyle: "fun", colorScheme: "dark" });

    expect(sampled[TOKEN]).toBe(USER_EDIT);
  });
});
