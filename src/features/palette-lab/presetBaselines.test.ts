import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  PALETTE_ATTRIBUTE,
  PALETTE_LAB_OVERRIDE_STYLE_ID,
  buildOverrideCss,
} from "./paletteLabStorage";
import { clearThemeBaselineCache, getThemeBaselines } from "./presetBaselines";
import { presetBlockSelector } from "./presetStylesheet";

/**
 * Revert baselines with the pre-paint bootstrap active.
 *
 * The bootstrap gave the visitor's look two carriers — the palette attribute
 * (which switches on a compiled preset block) and the injected style element —
 * and the sampler has to neutralize *both*. Miss either one and "reset this
 * token" silently starts restoring whatever the visitor is already wearing
 * instead of the value the theme intends.
 */

const TOKEN = "--theme-accent";
/** A token the *worn* palette re-seats and the *sampled* theme does not. */
const UNSTAGED_TOKEN = "--theme-panel-base";
const STOCK = "#111111";
const COMPILED_PRESET = "#222222";
const USER_EDIT = "#333333";
const THEME_OWN_VALUE = "#444444";

let fixture: HTMLStyleElement;
let overrideEl: HTMLStyleElement;

beforeEach(() => {
  clearThemeBaselineCache();
  document.documentElement.setAttribute("data-theme", "dark");
  document.documentElement.setAttribute(PALETTE_ATTRIBUTE, "fixture");

  // Stands in for the authored stylesheet plus the generated preset block.
  fixture = document.createElement("style");
  fixture.textContent = [
    `html[data-theme="dark"]{${TOKEN}:${STOCK};${UNSTAGED_TOKEN}:${STOCK};}`,
    `html[data-theme="light"]{${TOKEN}:${STOCK};${UNSTAGED_TOKEN}:${STOCK};}`,
    `${presetBlockSelector("fixture", "dark")}{${TOKEN}:${COMPILED_PRESET};${UNSTAGED_TOKEN}:${COMPILED_PRESET};}`,
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

  it("puts the document back exactly as it found it", () => {
    getThemeBaselines("fixture", { dark: { [TOKEN]: THEME_OWN_VALUE }, light: {} });

    expect(document.documentElement.getAttribute(PALETTE_ATTRIBUTE)).toBe("fixture");
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
});
