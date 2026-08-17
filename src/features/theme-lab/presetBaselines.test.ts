import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
 * The bootstrap gave the visitor's look three carriers — the palette attribute
 * and the accent attribute (each switching on a compiled block) and the injected
 * style element — and the sampler has to neutralize *all* of them. Miss one and
 * "reset this token" silently starts restoring whatever the visitor is already
 * wearing instead of the value the theme intends, and the delete-on-equal rule
 * throws away an edit that matches the layer it was made over.
 */

const TOKEN = "--theme-accent";
/** A token the *worn* palette re-seats and the *sampled* theme does not. */
const UNSTAGED_TOKEN = "--theme-panel-base";
/** A Pro accent seed: no palette names one, so the accent block is the only
 *  thing between the authored value and the sample. */
const SEED_TOKEN = "--ei-accent";
const STOCK = "#111111";
const COMPILED_PRESET = "#222222";
const USER_EDIT = "#333333";
const THEME_OWN_VALUE = "#444444";
const ACCENT_VALUE = "#555555";

let fixture: HTMLStyleElement;
let overrideEl: HTMLStyleElement;

beforeEach(() => {
  clearThemeBaselineCache();
  document.documentElement.setAttribute("data-theme", "dark");
  document.documentElement.setAttribute(PALETTE_ATTRIBUTE, "fixture");
  document.documentElement.setAttribute(ACCENT_ATTRIBUTE, "fixture-accent");

  // Stands in for the authored stylesheet plus the generated preset block.
  fixture = document.createElement("style");
  fixture.textContent = [
    `html[data-theme="dark"]{${TOKEN}:${STOCK};${UNSTAGED_TOKEN}:${STOCK};${SEED_TOKEN}:${STOCK};}`,
    `html[data-theme="light"]{${TOKEN}:${STOCK};${UNSTAGED_TOKEN}:${STOCK};${SEED_TOKEN}:${STOCK};}`,
    `${presetBlockSelector("fixture", "dark")}{${TOKEN}:${COMPILED_PRESET};${UNSTAGED_TOKEN}:${COMPILED_PRESET};}`,
    // The generated accent block, in the shape the stylesheet emits for Pro.
    `html[${ACCENT_ATTRIBUTE}="fixture-accent"][data-theme="dark"]{${SEED_TOKEN}:${ACCENT_VALUE};}`,
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
  clearThemeBaselineCache();
});

describe("revert baselines under the pre-paint bootstrap", () => {
  it("samples the theme's own value, not the compiled preset or the visitor's edit", () => {
    const baselines = getThemeBaselines("fixture", {
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
    const baselines = getThemeBaselines("fixture", {
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
    const baselines = getThemeBaselines("fixture", {
      dark: { [TOKEN]: THEME_OWN_VALUE },
      light: {},
    });

    expect(baselines.dark[SEED_TOKEN]).toBe(STOCK);
    expect(baselines.dark[SEED_TOKEN]).not.toBe(ACCENT_VALUE);
  });

  it("puts the document back exactly as it found it", () => {
    getThemeBaselines("fixture", { dark: { [TOKEN]: THEME_OWN_VALUE }, light: {} });

    expect(document.documentElement.getAttribute(PALETTE_ATTRIBUTE)).toBe("fixture");
    expect(document.documentElement.getAttribute(ACCENT_ATTRIBUTE)).toBe("fixture-accent");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
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

    const baselines = getThemeBaselines("no-palette", {
      dark: { [TOKEN]: THEME_OWN_VALUE },
      light: {},
    });

    expect(baselines.dark[TOKEN]).toBe(THEME_OWN_VALUE);
    expect(document.documentElement.hasAttribute(PALETTE_ATTRIBUTE)).toBe(false);
  });

  it("does not leave an accent attribute behind when there was none", () => {
    document.documentElement.removeAttribute(ACCENT_ATTRIBUTE);
    clearThemeBaselineCache();

    getThemeBaselines("no-accent", { dark: { [TOKEN]: THEME_OWN_VALUE }, light: {} });

    // The default accent IS the absent attribute, so writing one back would put
    // the visitor on an accent they never chose.
    expect(document.documentElement.hasAttribute(ACCENT_ATTRIBUTE)).toBe(false);
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
    expect(document.documentElement.hasAttribute("data-visual-style")).toBe(false);
    expect(document.documentElement.getAttribute(ACCENT_ATTRIBUTE)).toBe("fixture-accent");
  });

  it("keeps the visitor's own layer in play, because that is what is being exported", () => {
    // The opposite of a baseline: an edit the visitor made is part of the accent
    // they are handing back to the repository, so it must be in the reading.
    const sampled = sampleRenderedTokens([TOKEN], { visualStyle: "fun", colorScheme: "dark" });

    expect(sampled[TOKEN]).toBe(USER_EDIT);
  });
});
