import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { ACCENT_ATTRIBUTE, ACCENT_STYLESHEET_PATH } from "@/theme/accentStylesheet";
import { SURFACE_ATTRIBUTE, SURFACE_STYLESHEET_PATH } from "@/theme/surfaceStylesheet";

/**
 * The appearance cascade, measured rather than asserted.
 *
 * Every claim the theme makes is a claim about a *rendered colour*, and a rendered colour is
 * the end of a chain: four stylesheets, a cascade, a stack of `var()` references, and a
 * colour function. Asserting the declarations instead would let an accent pass while painting
 * something illegible — the value in a source module is not the value on screen. So this
 * module carries a small cascade resolver and a contrast calculator, runs the real sheets
 * through them, and exposes the result at every point on the visual-style × scheme grid.
 *
 * The resolver deliberately understands only ROOT selectors. Nothing else can seed a token
 * for the whole page, and refusing to model descendant selectors keeps it honest: a rule it
 * cannot evaluate is skipped, never guessed at.
 *
 * This is the fixture the theme suites share, and it is a fixture rather than copies because
 * every one of them measures the same rendered grid:
 *
 * - `src/theme/accents.test.ts` — the base Pro seeds, their shape, and swatch honesty.
 * - `src/theme/accents.contrast.test.ts` — the contrast floors and the budgets.
 * - `src/theme/accents.axis.test.ts` — the generated selectors and containment.
 * - `src/theme/surfaces.axis.test.ts` / `themeRamp.contrast.test.ts` — the base palette's floors.
 */

const REPO_ROOT = resolve(__dirname, "..", "..", "..");

/** Read a repository-relative file, so a sheet is measured as it ships. */
export const read = (relativePath: string) => readFileSync(resolve(REPO_ROOT, relativePath), "utf8");

/**
 * The cascade the browser sees on a dose.wiki page, in import order. `dosewiki.ts` pins this
 * list, and `proTheme.test.ts` pins that it matches these imports.
 */
const BASE_LADDER = [
  "src/styles/site-colors.css",
  "src/styles/pro-theme.css",
] as const;
const LADDER = [...BASE_LADDER, SURFACE_STYLESHEET_PATH, ACCENT_STYLESHEET_PATH];

export type VisualStyle = "fun" | "pro";
export type ColorScheme = "light" | "dark";
/**
 * One point on the appearance grid. The retired accent/surface attributes remain modelled so
 * the resolver can evaluate the shipped `:not([data-accent])` / `:not([data-surface])` guards;
 * no reader-reachable state sets either any more.
 */
export type AppearanceState = {
  visualStyle: VisualStyle;
  theme: ColorScheme;
  accent?: string;
  surface?: string;
};

export type Specificity = [number, number, number];
export type Declaration = {
  property: string;
  value: string;
  specificity: Specificity;
  order: number;
  matches: (state: AppearanceState) => boolean;
};

export const STYLES: VisualStyle[] = ["fun", "pro"];
export const SCHEMES: ColorScheme[] = ["light", "dark"];

/* -------------------------------------------------------------------------
 * The resolver.
 * ---------------------------------------------------------------------- */

/** Split a selector list on top-level commas; brackets and parens are skipped whole. */
function splitSelectorList(selector: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";

  for (const character of selector) {
    if (character === "(" || character === "[") depth += 1;
    else if (character === ")" || character === "]") depth -= 1;

    if (character === "," && depth === 0) {
      parts.push(current);
      current = "";
      continue;
    }

    current += character;
  }

  parts.push(current);
  return parts.map((part) => part.trim()).filter(Boolean);
}

/**
 * `html`/`:root` followed only by attribute selectors and `:not([attr])` guards, bare or wrapped
 * in `:where()`.
 *
 * Both shapes ship, and the difference between them is the whole point of parsing them
 * separately rather than together. `:where(:not([data-visual-style="pro"]))` keeps a Fun block at
 * (0,2,1); bare `:not([data-accent])` carries the specificity of its argument, which is what puts
 * the default accent's Pro block at (0,3,1) — level with every named accent's Pro block and a
 * step above the Pro palette it overrides. A parser that knew only the `:where()` form would
 * reject the default's Pro block outright, drop its declarations from the cascade, and leave the
 * whole grid measuring `pro-theme.css`'s authored teal while the browser rendered plum. That is
 * the one failure in this apparatus that is silent in both directions, so it is measured directly
 * in `accentAppearanceGrid.test.ts` as well as through the grid.
 */
const ROOT_SELECTOR =
  /^(?:html|:root)((?:\[[^\]]*\]|:not\(\[[^\]]*\]\)|:where\(:not\(\[[^\]]*\]\)\))*)$/;
const SELECTOR_PIECE =
  /\[([a-z-]+)(?:="([^"]*)")?\]|:where\(:not\(\[([a-z-]+)(?:="([^"]*)")?\]\)\)|:not\(\[([a-z-]+)(?:="([^"]*)")?\]\)/g;

/**
 * The attributes that can seed a page-wide colourway, and the state field each drives.
 *
 * Every attribute a sheet on the LADDER names has to appear here. An attribute that paints a
 * colourway and is missing makes `rootSelector` return null for every block carrying it, which
 * drops those blocks out of the cascade silently and measures the base sheet instead — a failure
 * that looks like green rather than like a bug. Both colourway axes a reader can actually
 * reach, `data-surface` and `data-accent`, are modelled for exactly that reason.
 */
const STATE_KEY_BY_ATTRIBUTE: Record<string, keyof AppearanceState> = {
  "data-theme": "theme",
  "data-visual-style": "visualStyle",
  [SURFACE_ATTRIBUTE]: "surface",
  [ACCENT_ATTRIBUTE]: "accent",
};

/**
 * A root selector's specificity and its match test, or null if it is not a root selector.
 *
 * Attributes count as classes, `:root` counts as one class, `html` as one type, and `:where()`
 * as nothing — CSS Selectors 4. A bare `:not()` is the case in between: it contributes nothing
 * itself but takes the specificity of its most specific argument, so `:not([data-accent])` counts
 * exactly as one attribute does. Anything with a descendant, a class or a pseudo-element is
 * rejected outright rather than approximated: those rules cannot seed a page-wide token, so
 * dropping them loses nothing and modelling them badly would lose correctness.
 *
 * Exported because the specificity arithmetic above is the apparatus the accent suites depend on
 * rather than something they measure, so it is asserted directly in `accentAppearanceGrid.test.ts`.
 */
export function rootSelector(part: string): Pick<Declaration, "specificity" | "matches"> | null {
  const match = ROOT_SELECTOR.exec(part);
  if (!match) return null;

  let classes = part.startsWith(":root") ? 1 : 0;
  const types = part.startsWith("html") ? 1 : 0;
  const conditions: { key: keyof AppearanceState; value?: string; negate: boolean }[] = [];

  for (const piece of match[1].matchAll(SELECTOR_PIECE)) {
    const attribute = piece[1] ?? piece[3] ?? piece[5];
    const key = STATE_KEY_BY_ATTRIBUTE[attribute];
    // An attribute this grid does not model (data-site, data-blur) cannot be satisfied, so a
    // rule naming one is treated as non-matching rather than silently ignored. That is still the
    // right default for attributes outside the colourway axes, but it is a sharp edge: an
    // attribute that DOES paint a colourway and is missing from the map above disappears
    // silently, taking its whole sheet out of the measured cascade. Anything added to that sheet
    // ladder that carries its own attribute belongs in the map, not here.
    if (!key) return null;
    if (piece[1] !== undefined) {
      classes += 1;
      conditions.push({ key, value: piece[2], negate: false });
    } else if (piece[3] !== undefined) {
      conditions.push({ key, value: piece[4], negate: true });
    } else {
      classes += 1;
      conditions.push({ key, value: piece[6], negate: true });
    }
  }

  return {
    specificity: [0, classes, types],
    matches(state) {
      return conditions.every((condition) => {
        const actual = state[condition.key];
        const hit = condition.value === undefined ? actual !== undefined : actual === condition.value;
        return condition.negate ? !hit : hit;
      });
    },
  };
}

/** Every custom-property declaration in a stylesheet that a root selector can carry. */
function declarationsOf(css: string, firstOrder: number): Declaration[] {
  const declarations: Declaration[] = [];
  let order = firstOrder;

  // `[^{}]` cannot cross a brace, so an at-rule wrapper never matches as a selector and its
  // nested blocks are returned on their own.
  for (const block of css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    for (const part of splitSelectorList(block[1])) {
      const selector = rootSelector(part);
      if (!selector) continue;

      for (const declaration of block[2].matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
        declarations.push({
          property: declaration[1],
          value: declaration[2].trim(),
          specificity: selector.specificity,
          matches: selector.matches,
          order,
        });
        order += 1;
      }
    }
  }

  return declarations;
}

const LADDER_DECLARATIONS = LADDER.flatMap((sheet, index) =>
  declarationsOf(read(sheet), index * 100_000),
);
const BASE_LADDER_DECLARATIONS = BASE_LADDER.flatMap((sheet, index) =>
  declarationsOf(read(sheet), index * 100_000),
);

/**
 * The stylesheet as a browser that fails every `@supports` query reads it: each
 * `@supports (…) { … }` block removed whole, braces balanced, comments gone. The base
 * sheets keep their relative-colour recipes inside such blocks behind literal fallbacks
 * (see the tail of `site-colors.css`), so this is the cascade Safari 16.x resolves.
 */
export function stripSupportsBlocks(css: string): string {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, "");
  let output = "";
  let cursor = 0;

  for (;;) {
    const start = source.indexOf("@supports", cursor);
    if (start === -1) break;
    output += source.slice(cursor, start);

    let depth = 0;
    let end = source.indexOf("{", start);
    for (; end < source.length; end += 1) {
      if (source[end] === "{") depth += 1;
      else if (source[end] === "}") {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    cursor = end + 1;
  }

  return output + source.slice(cursor);
}

const BASE_LADDER_FALLBACK_DECLARATIONS = BASE_LADDER.flatMap((sheet, index) =>
  declarationsOf(stripSupportsBlocks(read(sheet)), index * 100_000),
);

/** The declaration that wins each property: highest specificity, then latest in source. */
function cascade(
  state: AppearanceState,
  declarations: readonly Declaration[] = LADDER_DECLARATIONS,
): Map<string, string> {
  const winners = new Map<string, Declaration>();

  for (const declaration of declarations) {
    if (!declaration.matches(state)) continue;

    const previous = winners.get(declaration.property);
    const rank =
      previous === undefined
        ? 1
        : declaration.specificity[1] - previous.specificity[1] ||
          declaration.specificity[2] - previous.specificity[2] ||
          declaration.order - previous.order;

    if (rank > 0) winners.set(declaration.property, declaration);
  }

  const resolved = new Map<string, string>();
  for (const [property, declaration] of winners) resolved.set(property, declaration.value);
  return resolved;
}

/** Substitute every `var()` in a value, honouring fallbacks, until none is left. */
function substituteVars(value: string, declarations: Map<string, string>, depth = 0): string {
  if (depth > 40) throw new Error(`var() cycle resolving: ${value}`);

  let output = "";
  let cursor = 0;

  while (cursor < value.length) {
    const start = value.indexOf("var(", cursor);
    if (start === -1) {
      output += value.slice(cursor);
      break;
    }

    output += value.slice(cursor, start);

    let depthCount = 0;
    let end = start + 3;
    for (; end < value.length; end += 1) {
      if (value[end] === "(") depthCount += 1;
      else if (value[end] === ")") {
        depthCount -= 1;
        if (depthCount === 0) break;
      }
    }

    const inner = value.slice(start + 4, end);
    let comma = -1;
    let nested = 0;
    for (let index = 0; index < inner.length; index += 1) {
      if (inner[index] === "(") nested += 1;
      else if (inner[index] === ")") nested -= 1;
      else if (inner[index] === "," && nested === 0) {
        comma = index;
        break;
      }
    }

    const name = (comma === -1 ? inner : inner.slice(0, comma)).trim();
    const fallback = comma === -1 ? undefined : inner.slice(comma + 1).trim();
    const chosen = declarations.get(name) ?? fallback;
    if (chosen === undefined) throw new Error(`unresolved ${name} while resolving ${value}`);

    output += substituteVars(chosen, declarations, depth + 1);
    cursor = end + 1;
  }

  return output.includes("var(") ? substituteVars(output, declarations, depth + 1) : output;
}

/** Every `--theme-*` and `--ei-*` token, fully resolved, at one point on the grid. */
function resolveTokenDeclarations(
  state: AppearanceState,
  declarations: readonly Declaration[],
): Record<string, string> {
  const cascaded = cascade(state, declarations);
  const tokens: Record<string, string> = {};

  for (const property of cascaded.keys()) {
    if (/^--(?:theme|ei)-/.test(property)) {
      tokens[property] = substituteVars(cascaded.get(property)!, cascaded);
    }
  }

  return tokens;
}

export function resolveTokens(state: AppearanceState): Record<string, string> {
  return resolveTokenDeclarations(state, LADDER_DECLARATIONS);
}

/**
 * The base ladder with one colourway's own declarations laid over it.
 *
 * This is the appearance-data generator's entry point, and the layer is passed in as a map
 * rather than read off a stylesheet because the colourway definitions in
 * `palettePresets.ts` are the source the surface and accent axes are both compiled from —
 * resolving them against a sheet that is itself generated from them would be circular.
 *
 * `[0, 2, 1]` and an order past the whole ladder is the rank a colourway block carries in the
 * browser: one attribute above `site-colors.css`'s authored `:root` and `html[data-theme]`
 * blocks, so every token the colourway names is the one that resolves, and every token it does
 * not name falls through to the authored value. `matches` is unconditional because the caller
 * has already chosen which colourway it is resolving.
 */
export function resolveBasePaletteTokens(
  state: AppearanceState,
  colourway: Readonly<Record<string, string>> = {},
): Record<string, string> {
  const layer: Declaration[] = Object.entries(colourway).map(([property, value], index) => ({
    property,
    value,
    specificity: [0, 2, 1],
    matches: () => true,
    order: BASE_LADDER.length * 100_000 + index,
  }));
  return resolveTokenDeclarations(state, [...BASE_LADDER_DECLARATIONS, ...layer]);
}

/**
 * The base ladder as a browser without relative colour syntax resolves it: the
 * `@supports`-guarded recipes dropped, so every token that carries a literal fallback
 * resolves to that literal and everything else resolves exactly as
 * {@link resolveBasePaletteTokens}. The appearance-data generator diffs the two to learn
 * which generated tokens need the same literal-then-recipe shape.
 */
export function resolveBasePaletteFallbackTokens(state: AppearanceState): Record<string, string> {
  return resolveTokenDeclarations(state, BASE_LADDER_FALLBACK_DECLARATIONS);
}

/* -------------------------------------------------------------------------
 * Colour.
 * ---------------------------------------------------------------------- */

export type Rgb = [number, number, number];
/**
 * The same 8-bit sRGB channels with the alpha the value actually declared, 0-1.
 *
 * A separate type rather than an optional fourth slot on `Rgb`, because the distinction is the
 * whole point: a `Rgb` in this module is a colour something renders, and a `Rgba` is a colour
 * that still needs a ground before it renders anything. `composite` is the only bridge.
 */
export type Rgba = [number, number, number, number];

const linearise = (channel: number) =>
  channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
const delinearise = (channel: number) =>
  channel <= 0.0031308 ? 12.92 * channel : 1.055 * channel ** (1 / 2.4) - 0.055;

/** OKLab -> linear sRGB, per Björn Ottosson's published matrices. */
function oklabToLinear(lightness: number, a: number, b: number): Rgb {
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;

  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

function linearToOklab([r, g, b]: Rgb): Rgb {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);

  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function oklchToRgb(lightness: number, chroma: number, hue: number): Rgb {
  const radians = (hue * Math.PI) / 180;
  const linear = oklabToLinear(lightness, chroma * Math.cos(radians), chroma * Math.sin(radians));
  return linear.map((channel) => Math.min(1, Math.max(0, delinearise(channel))) * 255) as Rgb;
}

/** [lightness 0-1, chroma, hue degrees] of an sRGB colour. */
export function rgbToOklch([r, g, b]: Rgb): Rgb {
  const [lightness, a, bAxis] = linearToOklab([linearise(r / 255), linearise(g / 255), linearise(b / 255)]);
  const hue = (Math.atan2(bAxis, a) * 180) / Math.PI;
  return [lightness, Math.hypot(a, bAxis), hue < 0 ? hue + 360 : hue];
}

/** Split a function's arguments on top-level commas and slashes. */
function splitArguments(body: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";

  for (const character of body) {
    if (character === "(") depth += 1;
    else if (character === ")") depth -= 1;

    if ((character === "," || character === "/") && depth === 0) {
      parts.push(current.trim());
      current = "";
      continue;
    }

    current += character;
  }

  parts.push(current.trim());
  return parts.filter(Boolean);
}

/**
 * Split a relative-colour component list on top-level whitespace.
 *
 * `componentPart.split(/\s+/)` cannot do this: `oklch(from rgb(232 121 249) calc(l - 0.041)
 * calc(c * 1.35) h)` — Fun dark's `--theme-accent-strong` — has spaces *inside* two of its three
 * components, so a flat split yields `calc(l`, `-`, `0.041)` and `evaluateComponent` throws
 * `unevaluable colour component: calc(l`. That threw for all 36 Fun dark states the moment
 * `--theme-accent-strong` was first measured, because `accents.contrast.test.ts` only ever read
 * `--theme-accent`. Depth-aware, so a `calc()` arrives whole and a space-free component list
 * tokenizes exactly as before.
 */
function splitComponents(body: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";

  for (const character of body) {
    if (character === "(") depth += 1;
    else if (character === ")") depth -= 1;

    if (/\s/.test(character) && depth === 0) {
      if (current) parts.push(current);
      current = "";
      continue;
    }

    current += character;
  }

  if (current) parts.push(current);
  return parts;
}

/** Evaluate one relative-colour component: `h`, `calc(l - 0.041)`, `43%`, `0.12`. */
function evaluateComponent(expression: string, base: { l: number; c: number; h: number }): number {
  const inner = /^calc\(([\s\S]*)\)$/.exec(expression.trim());
  const source = (inner ? inner[1] : expression)
    .trim()
    .replace(/\b([lch])\b/g, (name) => String(base[name as "l" | "c" | "h"]));

  if (source.endsWith("%")) return Number.parseFloat(source) / 100;

  const binary = /^\s*(-?[\d.]+)\s*([-+*/])\s*(-?[\d.]+)\s*$/.exec(source);
  if (binary) {
    const left = Number.parseFloat(binary[1]);
    const right = Number.parseFloat(binary[3]);
    if (binary[2] === "+") return left + right;
    if (binary[2] === "-") return left - right;
    if (binary[2] === "*") return left * right;
    return left / right;
  }

  const literal = Number.parseFloat(source);
  if (Number.isNaN(literal)) throw new Error(`unevaluable colour component: ${expression}`);
  return literal;
}

/** One alpha component: a 0-1 number, or a percentage of one. */
function parseAlpha(expression: string): number {
  const source = expression.trim();
  const value = Number.parseFloat(source);
  if (Number.isNaN(value)) throw new Error(`unparseable alpha: ${expression}`);
  return source.endsWith("%") ? value / 100 : value;
}

/**
 * Parse a fully `var()`-substituted colour value, alpha included.
 *
 * Alpha is carried rather than discarded, and that is a correction rather than a feature. The
 * sheets declare their hairlines translucently — `--theme-field-border: rgb(var(--c-white) / 0.36)`
 * in Fun dark, `oklch(50% 0.11 var(--h-brand) / 0.76)` in Fun light — and a parser that dropped
 * the fourth channel measured a colour nothing paints. On Fun dark's field surface `#200e25`, that
 * border read as pure white at **18.21:1**; the 36% white the compositor actually produces is
 * `#706574`, at **3.30:1**. Both readings clear SC 1.4.11 today, and the gap between them is the
 * point: the discarded-alpha figure carries six times the headroom the rendered one has, so it
 * cannot tell a hairline that is comfortably visible from one sitting 0.30 above the floor. It
 * could not tell a passing hairline from a failing one either — these two tokens were at 0.12 and
 * 0.28 alpha until the audit, measuring 1.39:1 and 1.49:1 composited, and this arithmetic is why
 * every border breach of 1.4.11 in this theme went unseen for as long as the fixture existed.
 *
 * Nothing is composited here. A ground is the caller's to name, because there is no honest guess
 * for it — the same border sits on a field surface, a chrome surface and a card — so this returns
 * the declared colour and `composite` is the only place a backdrop enters.
 *
 * An unrecognised value throws — a floor that cannot be measured must fail the suite, not pass it.
 */
export function parseColorWithAlpha(value: string): Rgba {
  const trimmed = value.trim();

  // `transparent` is `rgba(0 0 0 / 0)`. It matters as the second colour of a `color-mix`: that is
  // how these sheets spell "this fill at 8% of itself".
  if (trimmed === "transparent") return [0, 0, 0, 0];

  const relative = /^oklch\(\s*from\s+([\s\S]*)\)$/.exec(trimmed);
  if (relative) {
    const rest = relative[1].trim();
    let depth = 0;
    let cut = -1;
    for (let index = 0; index < rest.length; index += 1) {
      if (rest[index] === "(") depth += 1;
      else if (rest[index] === ")") depth -= 1;
      else if (/\s/.test(rest[index]) && depth === 0) {
        cut = index;
        break;
      }
    }
    const base = parseColorWithAlpha(rest.slice(0, cut));
    const [l, c, h] = rgbToOklch([base[0], base[1], base[2]]);
    // `splitArguments` cuts on top-level slashes, so a `/ a` tail arrives as a second part while
    // the slash inside `calc(c / 2)` stays at depth. With no tail the base colour's alpha rides
    // through, which is what the relative syntax specifies.
    const [componentPart, alphaPart] = splitArguments(rest.slice(cut));
    const components = splitComponents(componentPart);
    return [
      ...oklchToRgb(
        evaluateComponent(components[0], { l, c, h }),
        evaluateComponent(components[1], { l, c, h }),
        evaluateComponent(components[2], { l, c, h }),
      ),
      alphaPart === undefined ? base[3] : parseAlpha(alphaPart),
    ] as Rgba;
  }

  const hex = /^#([0-9a-fA-F]{3,8})$/.exec(trimmed);
  if (hex) {
    const digits =
      hex[1].length === 3 || hex[1].length === 4
        ? [...hex[1]].map((digit) => digit + digit).join("")
        : hex[1];
    const [r, g, b] = [0, 2, 4].map((offset) =>
      Number.parseInt(digits.slice(offset, offset + 2), 16),
    );
    // `#rgba` and `#rrggbbaa` carry alpha in the fourth byte; the three- and six-digit forms are
    // opaque by definition.
    return [r, g, b, digits.length === 8 ? Number.parseInt(digits.slice(6, 8), 16) / 255 : 1];
  }

  const rgb = /^rgba?\(([\s\S]*)\)$/.exec(trimmed);
  if (rgb) {
    // Legacy commas, modern spaces and a substituted channel triple all reach here, and the
    // slash-alpha form glues three channels into one part: `rgb(255 255 255 / 0.12)` splits to
    // ["255 255 255", "0.12"], and `rgb(var(--c-white) / 0.12)` to the same thing once the var is
    // substituted. So flatten the parts before indexing rather than indexing the parts.
    const channels = splitArguments(rgb[1])
      .flatMap((part) => part.split(/[\s,]+/))
      .filter(Boolean);
    return [
      Number.parseFloat(channels[0]),
      Number.parseFloat(channels[1]),
      Number.parseFloat(channels[2]),
      channels[3] === undefined ? 1 : parseAlpha(channels[3]),
    ];
  }

  const oklch = /^oklch\(([\s\S]*)\)$/.exec(trimmed);
  if (oklch) {
    const [componentPart, alphaPart] = splitArguments(oklch[1]);
    const [lightness, chroma, hue] = componentPart.split(/\s+/);
    return [
      ...oklchToRgb(
        lightness.endsWith("%") ? Number.parseFloat(lightness) / 100 : Number.parseFloat(lightness),
        Number.parseFloat(chroma),
        Number.parseFloat(hue),
      ),
      alphaPart === undefined ? 1 : parseAlpha(alphaPart),
    ] as Rgba;
  }

  const mix = /^color-mix\(in\s+srgb\s*,([\s\S]*)\)$/.exec(trimmed);
  if (mix) {
    const [first, second] = splitArguments(mix[1]);
    const percentage = /(-?[\d.]+)%\s*$/;
    const firstWeight = percentage.exec(first);
    const secondWeight = percentage.exec(second);
    const weightA = firstWeight
      ? Number.parseFloat(firstWeight[1]) / 100
      : secondWeight
        ? 1 - Number.parseFloat(secondWeight[1]) / 100
        : 0.5;
    const colourA = parseColorWithAlpha(first.replace(percentage, "").trim());
    const colourB = parseColorWithAlpha(second.replace(percentage, "").trim());
    // CSS mixes in premultiplied alpha, which is the reason `color-mix(in srgb, X 8%, transparent)`
    // is X at 8% alpha and not X dragged 92% of the way towards black: `transparent` contributes
    // alpha and never colour. With two opaque operands this reduces exactly to the plain
    // channel-wise average this function used to compute.
    const alpha = colourA[3] * weightA + colourB[3] * (1 - weightA);
    if (alpha === 0) return [0, 0, 0, 0];
    return [
      ...([0, 1, 2].map(
        (index) =>
          (colourA[index] * colourA[3] * weightA + colourB[index] * colourB[3] * (1 - weightA)) /
          alpha,
      ) as Rgb),
      alpha,
    ] as Rgba;
  }

  if (/^[\d.]+\s+[\d.]+\s+[\d.]+$/.test(trimmed)) {
    return [...(trimmed.split(/\s+/).map(Number) as Rgb), 1] as Rgba;
  }

  throw new Error(`unparseable colour: ${value}`);
}

/**
 * The colour a value renders as with alpha dropped, not composited.
 *
 * This stays the module's plain reading, and stays a three-tuple, because the four accent suites
 * measure opaque tokens and read better for it. Dropping alpha is a deliberate narrowing rather
 * than an approximation: anything translucent has to name its ground, which means
 * `parseColorWithAlpha` and then `composite`.
 */
export function parseColor(value: string): Rgb {
  const [r, g, b] = parseColorWithAlpha(value);
  return [r, g, b];
}

/**
 * A translucent value over the ground it is painted on: `fg * a + ground * (1 - a)` per channel.
 *
 * In 8-bit sRGB rather than linear light, because that is what a compositor does — simple alpha
 * blending of the encoded values — and blending anywhere else would report a colour no browser
 * produces. An opaque `fg` returns itself, so a caller need not branch on alpha.
 */
export function composite([r, g, b, alpha]: Rgba, ground: Rgb): Rgb {
  return [
    r * alpha + ground[0] * (1 - alpha),
    g * alpha + ground[1] * (1 - alpha),
    b * alpha + ground[2] * (1 - alpha),
  ];
}

const relativeLuminance = ([r, g, b]: Rgb) =>
  0.2126 * linearise(r / 255) + 0.7152 * linearise(g / 255) + 0.0722 * linearise(b / 255);

/** WCAG 2.1 contrast ratio. */
export function contrastRatio(foreground: Rgb, background: Rgb): number {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** Perceptual distance in OKLab, where 1.0 spans the whole lightness range. */
export function deltaEok(a: Rgb, b: Rgb): number {
  const first = linearToOklab([linearise(a[0] / 255), linearise(a[1] / 255), linearise(a[2] / 255)]);
  const second = linearToOklab([
    linearise(b[0] / 255),
    linearise(b[1] / 255),
    linearise(b[2] / 255),
  ]);
  return Math.hypot(first[0] - second[0], first[1] - second[1], first[2] - second[2]);
}

export const toHex = ([r, g, b]: Rgb) =>
  `#${[r, g, b].map((channel) => Math.round(channel).toString(16).padStart(2, "0")).join("")}`;
export const ratio = (value: number) => `${value.toFixed(2)}:1`;

/* -------------------------------------------------------------------------
 * The grid.
 * ---------------------------------------------------------------------- */

/** The base look at every style/scheme point, resolved once. Every suite reads this. */
export const GRID = STYLES.flatMap((visualStyle) =>
  SCHEMES.map((theme) => ({
    visualStyle,
    theme,
    label: `${visualStyle}/${theme}`,
    tokens: resolveTokens({ visualStyle, theme }),
  })),
);

/** One resolved point on the grid. */
export type GridPoint = (typeof GRID)[number];

/**
 * Pro's own canvases, read off `pro-theme.css` as the values the accent axis must not move.
 * Paper in light, near-black in dark; the raised charcoal surface is the ground Pro's stated
 * link budgets were authored against.
 */
export const PRO_CANVAS: Record<ColorScheme, string> = { light: "#f6f5f1", dark: "#131313" };
export const PRO_DARK_RAISED = "#212121";

/**
 * How far a swatch may sit from the colour it advertises.
 *
 * 0.02 in OKLab is about one just-noticeable difference, so this admits a hex rounded from the
 * rendered value — the only reason the two would differ at all — and rejects any actually
 * different colour. It is tight by a wide margin against the two provisional swatches this
 * table replaced: the drafted `#d946ef` for `default` sits 0.209 from the rendered `#f0abfc`,
 * and the drafted `#3b82c4` for `blue` sits 0.336 from `#a5f3fc`. Both are an order of
 * magnitude outside it.
 *
 * It is shared because it is also the threshold `accents.contrast.test.ts` uses for the
 * achromatic-separation floor: an accent step closer to Pro's grey than one just-noticeable
 * difference is not an accent, on the same terms and by the same number.
 */
export const SWATCH_TOLERANCE = 0.02;
