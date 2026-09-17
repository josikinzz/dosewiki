import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The light scheme is a token swap, not a second stylesheet. Every
 * scheme-dependent value lives in site-colors.css; component rules read tokens
 * once. This holds that line: the light sheet carries no component selectors
 * and no !important, and the utility sheet keys nothing on the scheme except
 * the structural switches listed below.
 */
const LIGHT_SHEET = readFileSync("src/styles/theme-light-mode.css", "utf8");
const UTILITY_SHEET = readFileSync("src/styles/utilities-theme.css", "utf8");

function stripComments(css: string) {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

/**
 * Scheme-keyed selectors that are structural rather than stylistic: they switch
 * which element renders (the molecule colourway images) or pin the dark palette on
 * a chrome island, and have no token equivalent.
 */
const SCHEME_KEYED_SELECTOR_ALLOWLIST = [
  'html[data-theme="light"] [data-molecule-colorway="pro-dark"]',
  'html:not([data-theme="light"]) [data-molecule-colorway="pro-light"]',
  'html[data-theme="light"]:not([data-visual-style="pro"]) .theme-chrome-dark.theme-footer-surface',
  'html:not([data-theme="light"]) .theme-footer-surface',
  'html[data-theme="light"]:not([data-visual-style="pro"]) .theme-chrome-dark.theme-header-surface',
  'html:not([data-theme="light"]) .theme-header-surface',
];

describe("light scheme is a token swap", () => {
  it("keeps the light sheet free of component selectors and !important", () => {
    const css = stripComments(LIGHT_SHEET);
    expect(css.match(/\.theme-[\w-]+/g) ?? []).toEqual([]);
    expect(css.includes("!important")).toBe(false);
  });

  it("keys no utility rule on the colour scheme except the structural switches", () => {
    const css = stripComments(UTILITY_SHEET);
    const selectors = Array.from(css.matchAll(/([^{}]+)\{/g), (match) =>
      match[1].replace(/\s+/g, " ").trim(),
    ).filter((selector) => /\[data-theme=/.test(selector));
    const offenders = selectors.flatMap((selector) =>
      selector
        .split(",")
        .map((part) => part.trim())
        .filter((part) => /\[data-theme=/.test(part) && !SCHEME_KEYED_SELECTOR_ALLOWLIST.includes(part)),
    );
    expect(offenders).toEqual([]);
  });
});
