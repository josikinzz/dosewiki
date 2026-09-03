import { describe, expect, it } from "vitest";
import { CHROMA_SUPPORT_PROBE } from "@/theme/appearanceChroma";
import {
  SCHEMES,
  parseColorWithAlpha,
  read,
  resolveBasePaletteFallbackTokens,
  resolveBasePaletteTokens,
  stripSupportsBlocks,
  type Rgba,
} from "@/test/fixtures/accentAppearanceGrid";

/**
 * The literal fallbacks are baked by hand from relative-colour and colour-mix recipes, so
 * they can drift: someone retunes `--theme-panel-base`, the recipe follows, the literal does
 * not, and only Safari 16.x readers see the stale colour. This measures every pair the base
 * sheets declare, in both places the shape is authored: the token blocks of
 * `site-colors.css` (fallback in the block, recipe in the trailing `@supports`) and the
 * light `.theme-home-nav-icon` rules of `utilities-theme.css` (the same shape on ordinary
 * properties).
 *
 * The comparison bakes each recipe through the fixture's colour evaluator and requires the
 * fallback to name the same colours in the same skeleton, to within 8-bit rounding.
 */

const PROBE = `@supports (color: ${CHROMA_SUPPORT_PROBE})`;

/** Index of the `)` matching the `(` at `open`. */
function matchingParen(text: string, open: number): number {
  let depth = 0;
  for (let index = open; index < text.length; index += 1) {
    if (text[index] === "(") depth += 1;
    else if (text[index] === ")") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  throw new Error(`unbalanced parentheses in: ${text}`);
}

/**
 * Every outermost colour expression in a value, evaluated, plus the text around them with
 * each colour cut out. A recipe's colours are `oklch(from …)` and `color-mix(…)` calls, a
 * fallback's are literals (a `color-mix` of literals is still a literal to Safari 16.2+ and
 * stays put); both come back in one shape so the sides compare position by position.
 */
function coloursOf(value: string): { skeleton: string; colours: Rgba[] } {
  const head = /oklch\(|color-mix\(|rgba?\(|#[0-9a-fA-F]{3,8}\b/g;
  const colours: Rgba[] = [];
  let skeleton = "";
  let cursor = 0;
  for (let match = head.exec(value); match; match = head.exec(value)) {
    const close = match[0].startsWith("#")
      ? match.index + match[0].length - 1
      : matchingParen(value, match.index + match[0].length - 1);
    colours.push(parseColorWithAlpha(value.slice(match.index, close + 1)));
    skeleton += `${value.slice(cursor, match.index)}<colour>`;
    cursor = close + 1;
    head.lastIndex = cursor;
  }
  const text = `${skeleton}${value.slice(cursor)}`.replace(/\s*([(),])\s*/g, "$1").replace(/\s+/g, " ");
  return { skeleton: text.trim(), colours };
}

function expectBaked(recipe: string, fallback: string, label: string): void {
  const baked = coloursOf(recipe);
  const literal = coloursOf(fallback);
  expect(literal.skeleton, label).toBe(baked.skeleton);
  expect(literal.colours.length, label).toBe(baked.colours.length);
  literal.colours.forEach((colour, index) => {
    const expected = baked.colours[index]!;
    for (const channel of [0, 1, 2] as const) {
      expect(Math.abs(colour[channel] - expected[channel]), `${label} colour ${index}`).toBeLessThanOrEqual(2);
    }
    expect(Math.abs(colour[3] - expected[3]), `${label} alpha ${index}`).toBeLessThanOrEqual(0.01);
  });
}

describe("literal fallbacks match their relative-colour recipes", () => {
  it("in every site-colors.css token that ships both", () => {
    let pairs = 0;
    for (const theme of SCHEMES) {
      const recipes = resolveBasePaletteTokens({ visualStyle: "fun", theme });
      const fallbacks = resolveBasePaletteFallbackTokens({ visualStyle: "fun", theme });
      for (const [token, fallback] of Object.entries(fallbacks)) {
        const recipe = recipes[token]!;
        if (recipe === fallback) continue;
        pairs += 1;
        // A fallback carries no relative colour: nothing left for Safari 16.x to reject.
        expect(fallback, `${theme} ${token}`).not.toMatch(/oklch\(\s*from/);
        expectBaked(recipe, fallback, `${theme} ${token}`);
      }
    }
    // The wordmark accent, the frosted panels and everything derived from them.
    expect(pairs).toBeGreaterThanOrEqual(20);
  });

  it("in the dark logo ramp, which the token resolver does not carry", () => {
    // --site-logo-stop-* is outside the --theme-* namespace the grid resolves, and it is the
    // masked logo's whole fill, so it is measured off the sheet text directly.
    const css = read("src/styles/site-colors.css");
    const stripped = stripSupportsBlocks(css);
    const accent = /--c-accent:\s*([^;]+);/.exec(css)![1]!.trim();
    for (const stop of [2, 3, 4]) {
      // Dark fallback, light literal, dark recipe, in source order.
      const declaration = new RegExp(`--site-logo-stop-${stop}:\\s*([^;]+);`, "g");
      const values = [...css.matchAll(declaration)].map((match) => match[1]!.trim());
      const [fallback, recipe] = [values[0]!, values[values.length - 1]!];
      expect(recipe, `stop ${stop} recipe`).toMatch(/^oklch\(from /);
      expect([...stripped.matchAll(declaration)].map((match) => match[1]!.trim())).toEqual(values.slice(0, -1));
      expectBaked(recipe.replace("var(--c-accent)", accent), fallback, `--site-logo-stop-${stop}`);
    }
  });

  it("names the same probe the chroma sheet and the runtime writers use", () => {
    for (const sheet of ["src/styles/site-colors.css", "src/styles/utilities-theme.css"]) {
      const css = read(sheet).replace(/\/\*[\s\S]*?\*\//g, "");
      const relativeColourQueries = [...css.matchAll(/@supports[^{]*oklch\(\s*from[^{]*/g)].map(
        (match) => match[0].trim(),
      );
      expect(relativeColourQueries.length, sheet).toBeGreaterThan(0);
      for (const query of relativeColourQueries) expect(query, sheet).toBe(PROBE);
    }
  });

  it("in the light home-tile rules of utilities-theme.css", () => {
    const css = read("src/styles/utilities-theme.css");
    const tokens = resolveBasePaletteTokens({ visualStyle: "fun", theme: "light" });
    const substitute = (value: string) =>
      value.replace(/var\((--[a-z0-9-]+)\)/g, (whole, name: string) => tokens[name] ?? whole);
    const declarationsOf = (body: string) =>
      new Map(
        [...body.matchAll(/([a-z-]+)\s*:\s*([^;]+);/g)].map((match) => [match[1]!, match[2]!.trim()]),
      );

    // Leaf blocks, in source order, so a selector's literal rule precedes its recipe rule.
    const blocks = [...css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .map((match) => ({ selector: match[1]!.replace(/\s+/g, " ").trim(), body: match[2]! }))
      .filter((block) => !block.selector.startsWith("@"));
    const recipeRules = blocks.filter((block) => /oklch\(\s*from/.test(block.body));
    expect(recipeRules.length).toBeGreaterThanOrEqual(3);

    for (const rule of recipeRules) {
      const literalRule = blocks.find(
        (block) => block.selector === rule.selector && block !== rule && !/oklch\(\s*from/.test(block.body),
      );
      expect(literalRule, `${rule.selector} has no literal rule`).toBeDefined();
      const literals = declarationsOf(literalRule!.body);
      for (const [property, recipe] of declarationsOf(rule.body)) {
        if (!/oklch\(\s*from/.test(recipe)) continue;
        const fallback = literals.get(property);
        expect(fallback, `${rule.selector} ${property}`).toBeDefined();
        expectBaked(substitute(recipe), fallback!, `${rule.selector} ${property}`);
      }
    }
  });

  it("drops cleanly to the literals when the @supports blocks are stripped", () => {
    const stripped = stripSupportsBlocks(read("src/styles/site-colors.css"));
    expect(stripped).not.toContain("@supports");
    expect(stripped).not.toMatch(/oklch\(\s*from/);
    expect(stripped).toContain("--theme-accent-strong: #ef91ff;");
  });
});
