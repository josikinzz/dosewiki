import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { ACCENTS, DEFAULT_ACCENT_ID } from "@/theme/accents";
import { ACCENT_ATTRIBUTE, ACCENT_STYLESHEET_PATH } from "@/theme/accentStylesheet";

/**
 * The accent axis, measured rather than asserted.
 *
 * Every claim an accent makes is a claim about a *rendered colour*, and a rendered colour is
 * the end of a chain: four stylesheets, a cascade, a stack of `var()` references, and a
 * colour function. Asserting the declarations instead would let an accent pass while painting
 * something illegible — the value in `accents.ts` is not the value on screen. So this module
 * carries a small cascade resolver and a contrast calculator, runs the real sheets through
 * them, and exposes the result at every point on the three-axis grid.
 *
 * The resolver deliberately understands only ROOT selectors. Nothing else can seed a token
 * for the whole page, and refusing to model descendant selectors keeps it honest: a rule it
 * cannot evaluate is skipped, never guessed at.
 *
 * This is the fixture four suites share, and it is a fixture rather than four copies because
 * every one of them measures the same rendered grid:
 *
 * - `src/theme/accents.test.ts` — the table, its shape, and swatch honesty.
 * - `src/theme/accents.contrast.test.ts` — the contrast floors and the budgets.
 * - `src/theme/accents.immunity.test.ts` — semantic immunity and the brand-band leak list.
 * - `src/theme/accents.axis.test.ts` — the generated selectors, containment and the bootstrap.
 */

const REPO_ROOT = resolve(__dirname, "..", "..", "..");

/** Read a repository-relative file, so a sheet is measured as it ships. */
export const read = (relativePath: string) => readFileSync(resolve(REPO_ROOT, relativePath), "utf8");

/**
 * The cascade the browser sees on a dose.wiki page, in import order. `dosewiki.ts` pins this
 * list, and `proTheme.test.ts` pins that it matches these imports.
 */
const LADDER = [
  "src/styles/site-colors.css",
  "src/styles/palette-presets.generated.css",
  "src/styles/pro-theme.css",
  ACCENT_STYLESHEET_PATH,
];

export type VisualStyle = "fun" | "pro";
export type ColorScheme = "light" | "dark";
/** One point on the appearance grid. An absent accent is the default accent. */
export type AppearanceState = { visualStyle: VisualStyle; theme: ColorScheme; accent?: string };

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

const STATE_KEY_BY_ATTRIBUTE: Record<string, keyof AppearanceState> = {
  "data-theme": "theme",
  "data-visual-style": "visualStyle",
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
    // rule naming one is treated as non-matching rather than silently ignored.
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

/** The declaration that wins each property: highest specificity, then latest in source. */
function cascade(state: AppearanceState): Map<string, string> {
  const winners = new Map<string, Declaration>();

  for (const declaration of LADDER_DECLARATIONS) {
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
export function resolveTokens(state: AppearanceState): Record<string, string> {
  const declarations = cascade(state);
  const tokens: Record<string, string> = {};

  for (const property of declarations.keys()) {
    if (/^--(?:theme|ei)-/.test(property)) {
      tokens[property] = substituteVars(declarations.get(property)!, declarations);
    }
  }

  return tokens;
}

/* -------------------------------------------------------------------------
 * Colour.
 * ---------------------------------------------------------------------- */

export type Rgb = [number, number, number];

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

/**
 * Parse a fully `var()`-substituted colour value.
 *
 * Alpha is dropped rather than composited: every token these floors measure is opaque, and
 * silently compositing a translucent one against a guessed backdrop would report a contrast
 * ratio nothing renders. An unrecognised value throws — a floor that cannot be measured must
 * fail the suite, not pass it.
 */
export function parseColor(value: string): Rgb {
  const trimmed = value.trim();

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
    const [l, c, h] = rgbToOklch(parseColor(rest.slice(0, cut)));
    const components = rest.slice(cut).trim().split(/\s+/);
    return oklchToRgb(
      evaluateComponent(components[0], { l, c, h }),
      evaluateComponent(components[1], { l, c, h }),
      evaluateComponent(components[2], { l, c, h }),
    );
  }

  const hex = /^#([0-9a-fA-F]{3,8})$/.exec(trimmed);
  if (hex) {
    const digits =
      hex[1].length === 3 || hex[1].length === 4
        ? [...hex[1]].map((digit) => digit + digit).join("")
        : hex[1];
    return [0, 2, 4].map((offset) =>
      Number.parseInt(digits.slice(offset, offset + 2), 16),
    ) as Rgb;
  }

  const rgb = /^rgba?\(([\s\S]*)\)$/.exec(trimmed);
  if (rgb) {
    const args = splitArguments(rgb[1]);
    const channels = args.length === 1 ? args[0].split(/[\s,]+/) : args;
    return [0, 1, 2].map((index) => Number.parseFloat(channels[index])) as Rgb;
  }

  const oklch = /^oklch\(([\s\S]*)\)$/.exec(trimmed);
  if (oklch) {
    const [lightness, chroma, hue] = oklch[1].trim().split(/\s+/);
    return oklchToRgb(
      lightness.endsWith("%") ? Number.parseFloat(lightness) / 100 : Number.parseFloat(lightness),
      Number.parseFloat(chroma),
      Number.parseFloat(hue),
    );
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
    const colourA = parseColor(first.replace(percentage, "").trim());
    const colourB = parseColor(second.replace(percentage, "").trim());
    return [0, 1, 2].map(
      (index) => colourA[index] * weightA + colourB[index] * (1 - weightA),
    ) as Rgb;
  }

  if (/^[\d.]+\s+[\d.]+\s+[\d.]+$/.test(trimmed)) return trimmed.split(/\s+/).map(Number) as Rgb;

  throw new Error(`unparseable colour: ${value}`);
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

/** Every accent at every point, resolved once. Every assertion in the four suites reads this. */
export const GRID = ACCENTS.flatMap((accent) =>
  STYLES.flatMap((visualStyle) =>
    SCHEMES.map((theme) => {
      const state: AppearanceState =
        accent.id === DEFAULT_ACCENT_ID
          ? { visualStyle, theme }
          : { visualStyle, theme, accent: accent.id };

      return {
        accent,
        visualStyle,
        theme,
        label: `${accent.id}/${visualStyle}/${theme}`,
        tokens: resolveTokens(state),
        baseline: resolveTokens({ visualStyle, theme }),
      };
    }),
  ),
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
