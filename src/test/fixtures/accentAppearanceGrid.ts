import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { ACCENT_ATTRIBUTE, ACCENT_STYLESHEET_PATH } from "@/theme/accentStylesheet";
import { SURFACE_ATTRIBUTE, SURFACE_STYLESHEET_PATH } from "@/theme/surfaceStylesheet";

const REPO_ROOT = resolve(__dirname, "..", "..", "..");

export const read = (relativePath: string) => readFileSync(resolve(REPO_ROOT, relativePath), "utf8");

const BASE_LADDER = [
  "src/styles/site-colors.css",
  "src/styles/pro-theme.css",
] as const;
const LADDER = [...BASE_LADDER, SURFACE_STYLESHEET_PATH, ACCENT_STYLESHEET_PATH];

export type VisualStyle = "fun" | "pro";
export type ColorScheme = "light" | "dark";
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

const ROOT_SELECTOR =
  /^(?:html|:root)((?:\[[^\]]*\]|:not\(\[[^\]]*\]\)|:where\(:not\(\[[^\]]*\]\)\))*)$/;
const SELECTOR_PIECE =
  /\[([a-z-]+)(?:="([^"]*)")?\]|:where\(:not\(\[([a-z-]+)(?:="([^"]*)")?\]\)\)|:not\(\[([a-z-]+)(?:="([^"]*)")?\]\)/g;

const STATE_KEY_BY_ATTRIBUTE: Record<string, keyof AppearanceState> = {
  "data-theme": "theme",
  "data-visual-style": "visualStyle",
  [SURFACE_ATTRIBUTE]: "surface",
  [ACCENT_ATTRIBUTE]: "accent",
};

export function rootSelector(part: string): Pick<Declaration, "specificity" | "matches"> | null {
  const match = ROOT_SELECTOR.exec(part);
  if (!match) return null;

  let classes = part.startsWith(":root") ? 1 : 0;
  const types = part.startsWith("html") ? 1 : 0;
  const conditions: { key: keyof AppearanceState; value?: string; negate: boolean }[] = [];

  for (const piece of match[1].matchAll(SELECTOR_PIECE)) {
    const attribute = piece[1] ?? piece[3] ?? piece[5];
    const key = STATE_KEY_BY_ATTRIBUTE[attribute];
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

function declarationsOf(css: string, firstOrder: number): Declaration[] {
  const declarations: Declaration[] = [];
  let order = firstOrder;

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

export function resolveBasePaletteFallbackTokens(state: AppearanceState): Record<string, string> {
  return resolveTokenDeclarations(state, BASE_LADDER_FALLBACK_DECLARATIONS);
}

export type Rgb = [number, number, number];
export type Rgba = [number, number, number, number];

const linearise = (channel: number) =>
  channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
const delinearise = (channel: number) =>
  channel <= 0.0031308 ? 12.92 * channel : 1.055 * channel ** (1 / 2.4) - 0.055;

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

export function rgbToOklch([r, g, b]: Rgb): Rgb {
  const [lightness, a, bAxis] = linearToOklab([linearise(r / 255), linearise(g / 255), linearise(b / 255)]);
  const hue = (Math.atan2(bAxis, a) * 180) / Math.PI;
  return [lightness, Math.hypot(a, bAxis), hue < 0 ? hue + 360 : hue];
}

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

function parseAlpha(expression: string): number {
  const source = expression.trim();
  const value = Number.parseFloat(source);
  if (Number.isNaN(value)) throw new Error(`unparseable alpha: ${expression}`);
  return source.endsWith("%") ? value / 100 : value;
}

export function parseColorWithAlpha(value: string): Rgba {
  const trimmed = value.trim();

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
    return [r, g, b, digits.length === 8 ? Number.parseInt(digits.slice(6, 8), 16) / 255 : 1];
  }

  const rgb = /^rgba?\(([\s\S]*)\)$/.exec(trimmed);
  if (rgb) {
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

export function parseColor(value: string): Rgb {
  const [r, g, b] = parseColorWithAlpha(value);
  return [r, g, b];
}

export function composite([r, g, b, alpha]: Rgba, ground: Rgb): Rgb {
  return [
    r * alpha + ground[0] * (1 - alpha),
    g * alpha + ground[1] * (1 - alpha),
    b * alpha + ground[2] * (1 - alpha),
  ];
}

const relativeLuminance = ([r, g, b]: Rgb) =>
  0.2126 * linearise(r / 255) + 0.7152 * linearise(g / 255) + 0.0722 * linearise(b / 255);

export function contrastRatio(foreground: Rgb, background: Rgb): number {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

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

export const GRID = STYLES.flatMap((visualStyle) =>
  SCHEMES.map((theme) => ({
    visualStyle,
    theme,
    label: `${visualStyle}/${theme}`,
    tokens: resolveTokens({ visualStyle, theme }),
  })),
);

export type GridPoint = (typeof GRID)[number];

export const PRO_CANVAS: Record<ColorScheme, string> = { light: "#f6f5f1", dark: "#131313" };
export const PRO_DARK_RAISED = "#212121";

export const SWATCH_TOLERANCE = 0.02;
