import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

import { SITE_FLAVOR_CONFIGS } from "@/config/siteFlavor";
import { PALETTE_PRESETS } from "@/features/theme-lab/palettePresets";
import { ACCENTS, DEFAULT_ACCENT_ID, PRO_ACCENT_SEED_NAMES, getAccent, isAccent } from "./accents";
import {
  ACCENT_ATTRIBUTE,
  ACCENT_STYLESHEET_PATH,
  accentFunBlockSelector,
  accentProBlockSelector,
  buildAccentStylesheetCss,
} from "./accentStylesheet";
import {
  ACCENT_STORAGE_KEY,
  DEFAULT_ACCENT,
  SUPPORTED_ACCENTS,
  buildThemeBootstrapScript,
} from "./index";

/**
 * The accent axis, measured rather than asserted.
 *
 * Every claim an accent makes is a claim about a *rendered colour*, and a rendered colour is
 * the end of a chain: four stylesheets, a cascade, a stack of `var()` references, and a
 * colour function. Asserting the declarations instead would let an accent pass while painting
 * something illegible — the value in `accents.ts` is not the value on screen. So this file
 * carries a small cascade resolver and a contrast calculator, runs the real sheets through
 * them, and measures the result at every point on the three-axis grid.
 *
 * The resolver deliberately understands only ROOT selectors. Nothing else can seed a token
 * for the whole page, and refusing to model descendant selectors keeps it honest: a rule it
 * cannot evaluate is skipped, never guessed at.
 */

const REPO_ROOT = resolve(__dirname, "..", "..");
const read = (relativePath: string) => readFileSync(resolve(REPO_ROOT, relativePath), "utf8");

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

type VisualStyle = "fun" | "pro";
type ColorScheme = "light" | "dark";
/** One point on the appearance grid. An absent accent is the default accent. */
type AppearanceState = { visualStyle: VisualStyle; theme: ColorScheme; accent?: string };

type Specificity = [number, number, number];
type Declaration = {
  property: string;
  value: string;
  specificity: Specificity;
  order: number;
  matches: (state: AppearanceState) => boolean;
};

const STYLES: VisualStyle[] = ["fun", "pro"];
const SCHEMES: ColorScheme[] = ["light", "dark"];

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

/** `html`/`:root` followed only by attribute selectors and `:where(:not([attr]))` guards. */
const ROOT_SELECTOR = /^(?:html|:root)((?:\[[^\]]*\]|:where\(:not\(\[[^\]]*\]\)\))*)$/;
const SELECTOR_PIECE =
  /\[([a-z-]+)(?:="([^"]*)")?\]|:where\(:not\(\[([a-z-]+)(?:="([^"]*)")?\]\)\)/g;

const STATE_KEY_BY_ATTRIBUTE: Record<string, keyof AppearanceState> = {
  "data-theme": "theme",
  "data-visual-style": "visualStyle",
  [ACCENT_ATTRIBUTE]: "accent",
};

/**
 * A root selector's specificity and its match test, or null if it is not a root selector.
 *
 * Attributes count as classes, `:root` counts as one class, `html` as one type, and `:where()`
 * as nothing — CSS Selectors 4. Anything with a descendant, a class or a pseudo-element is
 * rejected outright rather than approximated: those rules cannot seed a page-wide token, so
 * dropping them loses nothing and modelling them badly would lose correctness.
 */
function rootSelector(part: string): Pick<Declaration, "specificity" | "matches"> | null {
  const match = ROOT_SELECTOR.exec(part);
  if (!match) return null;

  let classes = part.startsWith(":root") ? 1 : 0;
  const types = part.startsWith("html") ? 1 : 0;
  const conditions: { key: keyof AppearanceState; value?: string; negate: boolean }[] = [];

  for (const piece of match[1].matchAll(SELECTOR_PIECE)) {
    const attribute = piece[1] ?? piece[3];
    const key = STATE_KEY_BY_ATTRIBUTE[attribute];
    // An attribute this grid does not model (data-site, data-blur) cannot be satisfied, so a
    // rule naming one is treated as non-matching rather than silently ignored.
    if (!key) return null;
    if (piece[1] !== undefined) {
      classes += 1;
      conditions.push({ key, value: piece[2], negate: false });
    } else {
      conditions.push({ key, value: piece[4], negate: true });
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
function resolveTokens(state: AppearanceState): Record<string, string> {
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

type Rgb = [number, number, number];

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
function rgbToOklch([r, g, b]: Rgb): Rgb {
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
function parseColor(value: string): Rgb {
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
function contrastRatio(foreground: Rgb, background: Rgb): number {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** Perceptual distance in OKLab, where 1.0 spans the whole lightness range. */
function deltaEok(a: Rgb, b: Rgb): number {
  const first = linearToOklab([linearise(a[0] / 255), linearise(a[1] / 255), linearise(a[2] / 255)]);
  const second = linearToOklab([
    linearise(b[0] / 255),
    linearise(b[1] / 255),
    linearise(b[2] / 255),
  ]);
  return Math.hypot(first[0] - second[0], first[1] - second[1], first[2] - second[2]);
}

const toHex = ([r, g, b]: Rgb) =>
  `#${[r, g, b].map((channel) => Math.round(channel).toString(16).padStart(2, "0")).join("")}`;
const ratio = (value: number) => `${value.toFixed(2)}:1`;

/* -------------------------------------------------------------------------
 * The grid.
 * ---------------------------------------------------------------------- */

/** Every accent at every point, resolved once. Every assertion below reads this. */
const GRID = ACCENTS.flatMap((accent) =>
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

/**
 * Pro's own canvases, read off `pro-theme.css` as the values the accent axis must not move.
 * Paper in light, near-black in dark; the raised charcoal surface is the ground Pro's stated
 * link budgets were authored against.
 */
const PRO_CANVAS: Record<ColorScheme, string> = { light: "#f6f5f1", dark: "#131313" };
const PRO_DARK_RAISED = "#212121";

/* -------------------------------------------------------------------------
 * Floors.
 * ---------------------------------------------------------------------- */

const CANVAS_FLOOR = 4.5;
const ON_ACCENT_FLOOR = 4.5;
const PRO_DARK_LINK_BUDGET = 7.4;
const PRO_DARK_STRONG_BUDGET = 9.2;

/**
 * The one point on the grid where `--theme-accent` does not clear 4.5:1 against the canvas,
 * named rather than papered over — the same discipline `palettePresets.test.ts` applies to its
 * safety exemptions, because an exemption someone had to write down is an exemption someone
 * has read.
 *
 * Pro's authored light accent (`--ei-accent: #3d9991`) measures 3.12:1 on paper. That predates
 * this axis by the whole life of the sheet, and it is not what a light-scheme Pro link renders:
 * `theme-light-mode.css` pins prose links and index-card titles to `--theme-accent-strong`,
 * which measures 6.35:1. `--ei-accent` in Pro light carries hairlines, hover edges and the
 * selected-route border — non-text — plus two text uses this ticket did not introduce.
 *
 * Fixing the authored teal would repaint Effect Index, which is a different decision from
 * shipping an accent axis, so the breach is pinned at its measured value instead: `default` may
 * not get worse here, and every other accent must clear the real floor. All five do, and each
 * pays for it the same way — the light ramp is shifted down by one uniform ΔL until the base
 * seed lifts over 4.5:1, and no further. Measured on paper: Blue 4.63:1, Green 4.51:1, Red
 * 4.54:1, Amber 4.51:1, Neutral 4.53:1. The margins are thin because the shift is minimal by
 * construction; a wider one would darken hairlines and hover edges for no accessibility gain.
 */
const CANVAS_FLOOR_EXEMPTIONS: Record<string, number> = { "default/pro/light": 3.12 };

describe("accent floors", () => {
  it.each(GRID)("keeps $label above the canvas floor", ({ label, tokens }) => {
    const accentColour = parseColor(tokens["--theme-accent"]);
    const canvas = parseColor(tokens["--theme-body-bg"]);
    const measured = contrastRatio(accentColour, canvas);
    const exemption = CANVAS_FLOOR_EXEMPTIONS[label];

    expect(
      measured,
      `${label}: --theme-accent ${toHex(accentColour)} on canvas ${toHex(canvas)} measures ` +
        `${ratio(measured)}, below the ${exemption ?? CANVAS_FLOOR} floor`,
    ).toBeGreaterThanOrEqual(exemption ?? CANVAS_FLOOR);
  });

  it("exercises every named canvas-floor exemption", () => {
    // A stale exemption is a hole nobody is watching: each one must name a point that really
    // is below the floor, and really is no worse than the ratio recorded for it.
    for (const [label, pinned] of Object.entries(CANVAS_FLOOR_EXEMPTIONS)) {
      const point = GRID.find((entry) => entry.label === label);
      expect(point, `${label} is not a point on the grid`).toBeDefined();

      const measured = contrastRatio(
        parseColor(point!.tokens["--theme-accent"]),
        parseColor(point!.tokens["--theme-body-bg"]),
      );

      expect(measured, `${label} now measures ${ratio(measured)}; drop the exemption`).toBeLessThan(
        CANVAS_FLOOR,
      );
      expect(pinned).toBeLessThan(CANVAS_FLOOR);
    }
  });

  it.each(GRID.filter((entry) => entry.visualStyle === "pro"))(
    "keeps ink legible on $label's accent fill",
    ({ label, tokens }) => {
      // --ei-on-accent is the ink ON a filled accent, so it flips with the fill rather than
      // with the accent: near-white over a dark light-scheme fill, near-black over a light
      // dark-scheme one. Copying it between accents without measuring is how a filled CTA ends
      // up with white text on a pale blue.
      const ink = parseColor(tokens["--ei-on-accent"]);
      const fill = parseColor(tokens["--ei-accent-strong"]);
      const measured = contrastRatio(ink, fill);

      expect(
        measured,
        `${label}: --ei-on-accent ${toHex(ink)} over --ei-accent-strong ${toHex(fill)} ` +
          `measures ${ratio(measured)}`,
      ).toBeGreaterThanOrEqual(ON_ACCENT_FLOOR);
    },
  );

  it.each(GRID.filter((entry) => entry.visualStyle === "pro" && entry.theme === "dark"))(
    "clears Pro's own stated dark budgets for $label",
    ({ label, tokens }) => {
      // pro-theme.css states 7.4:1 for the base link and 9.2:1 for the strong one. Those
      // numbers were authored against the raised charcoal surface, not the page: the canvas is
      // darker, so the same authored pair measures 9.10:1 and 11.22:1 there and the budgets
      // would be slack. Measuring on the tighter ground is what keeps them a real floor.
      const ground = parseColor(PRO_DARK_RAISED);
      const link = contrastRatio(parseColor(tokens["--ei-accent"]), ground);
      const strong = contrastRatio(parseColor(tokens["--ei-accent-strong"]), ground);

      expect(link, `${label}: --ei-accent on ${PRO_DARK_RAISED} measures ${ratio(link)}`)
        .toBeGreaterThanOrEqual(PRO_DARK_LINK_BUDGET);
      expect(
        strong,
        `${label}: --ei-accent-strong on ${PRO_DARK_RAISED} measures ${ratio(strong)}`,
      ).toBeGreaterThanOrEqual(PRO_DARK_STRONG_BUDGET);
    },
  );

  it.each(SCHEMES)("keeps the achromatic accent off Pro's own neutral ramp in %s", (theme) => {
    // Neutral is the one accent whose Fun colourway has no hue to rotate, so what makes its Pro
    // half an accent rather than a grey has to be measured, not assumed. Pro's canvas, ink ramp,
    // borders and levelling rows are ALL neutral, and they are neutral in two ways: exactly
    // achromatic (ink, levelling, the dark surfaces) or warm (paper, surfaces, borders sit at
    // hue 84-97, chroma <= 0.010). Neutral's ramp is cool — hue ~250, ~155 degrees opposite —
    // at several times that chroma, and that opposition is the whole of its visibility.
    //
    // The threshold is SWATCH_TOLERANCE deliberately: the same 0.02 the swatch assertion treats
    // as one just-noticeable difference. An accent step closer than one JND to the nearest Pro
    // neutral is not an accent, it is a member of the grey ramp.
    const point = GRID.find((entry) => entry.label === `neutral/pro/${theme}`);
    expect(point, `neutral/pro/${theme} is not a point on the grid`).toBeDefined();

    const NEUTRAL_RAMPS = /^--ei-(?:ink|level)(?:-\d)?(?:-mark)?$|^--ei-(?:border|border-strong)$/;
    const neutrals = Object.keys(point!.tokens).filter((token) => NEUTRAL_RAMPS.test(token));
    expect(neutrals.length, "Pro's neutral ramps are no longer where this looks").toBeGreaterThan(
      10,
    );

    for (const step of ["--ei-accent", "--ei-accent-strong", "--ei-accent-soft", "--ei-accent-muted"]) {
      const accentStep = parseColor(point!.tokens[step]);
      const nearest = neutrals
        .map((token) => ({ token, distance: deltaEok(accentStep, parseColor(point!.tokens[token])) }))
        .sort((a, b) => a.distance - b.distance)[0];

      expect(
        nearest.distance,
        `neutral/pro/${theme}: ${step} ${toHex(accentStep)} is ΔEok ` +
          `${nearest.distance.toFixed(3)} from ${nearest.token} — inside one JND of Pro's own grey`,
      ).toBeGreaterThan(SWATCH_TOLERANCE);
    }
  });
});

/* -------------------------------------------------------------------------
 * Pro must stay Pro.
 * ---------------------------------------------------------------------- */

describe("visual-style containment", () => {
  it.each(GRID.filter((entry) => entry.visualStyle === "pro"))(
    "paints $label on Pro's own canvas, never the Fun colourway's",
    ({ label, theme, tokens }) => {
      // This is the case that fails if the Fun blocks lose their
      // :where(:not([data-visual-style="pro"])) guard. The accent sheet is imported after
      // pro-theme.css, and a Fun block ties the Pro palette at (0,2,1), so an unguarded Blue
      // handed a Pro page Abyss's navy #020a12 in place of Pro's #131313 — verified by
      // stripping the guard and watching this assertion fail.
      expect(
        toHex(parseColor(tokens["--theme-body-bg"])),
        `${label}: the page canvas left Pro's palette`,
      ).toBe(PRO_CANVAS[theme]);
    },
  );

  it.each(GRID.filter((entry) => entry.visualStyle === "pro"))(
    "moves only accent-derived tokens on $label",
    ({ label, accent, tokens, baseline }) => {
      // On Pro an accent may re-seat --ei-* and nothing else, so every --theme-* token that
      // moves must resolve one of the nine seeds the accent owns. A token that moves without
      // reading a seed is a Fun override that has leaked across the style boundary.
      const seeds = new Set<string>([
        ...PRO_ACCENT_SEED_NAMES.light,
        ...PRO_ACCENT_SEED_NAMES.dark,
      ]);
      const moved = Object.keys(baseline).filter((token) => baseline[token] !== tokens[token]);
      const seedValues = new Set([...seeds].map((seed) => baseline[seed]).filter(Boolean));
      const unexplained = moved.filter(
        (token) => !seeds.has(token) && ![...seedValues].some((value) => baseline[token].includes(value)),
      );

      expect(unexplained, `${label}: ${unexplained.join(", ")} moved without reading an accent seed`)
        .toEqual([]);
      if (accent.pro) expect(moved.length).toBeGreaterThan(0);
    },
  );
});

/* -------------------------------------------------------------------------
 * Semantic immunity.
 * ---------------------------------------------------------------------- */

const SITE_COLORS = read("src/styles/site-colors.css");
const SITE_COLOR_TOKENS = [...SITE_COLORS.matchAll(/^\s*(--[a-z0-9-]+):/gm)].map(
  (match) => match[1],
);

/**
 * The harm-reduction signal, enumerated out of `site-colors.css` rather than hand-listed, so a
 * token added to a family cannot slip the net. The patterns are the ones
 * `palettePresets.test.ts` already measures colourways against; an accent wears a colourway,
 * so it has to answer to the same list.
 *
 * The molecule CPK palette is the fourth harm-reduction surface and is deliberately absent:
 * it lives in `src/data/mappings/moleculePalette.ts` and paints structure SVGs served through
 * `<img>`, so no custom property reaches it and no accent can touch it.
 */
const IMMUNE_FAMILIES = {
  tierRamp: /^--theme-(?:dose|plateau)-tier-(?!fade$)/,
  inlineRamp:
    /^--theme-(?:success|warning|danger|evidence)-(?:bg|bg-strong|border|border-strong|text|text-strong|ring)$/,
  semanticCards: /^--theme-(?:semantic|interaction)-(?:danger|unsafe|caution)-card-/,
  semanticBadges: /^--theme-semantic-(?:danger|unsafe|caution|info|success)-badge-/,
} as const;

const immuneMembers = (family: keyof typeof IMMUNE_FAMILIES) => [
  ...new Set(SITE_COLOR_TOKENS.filter((token) => IMMUNE_FAMILIES[family].test(token))),
];

const IMMUNE = new Set(
  (Object.keys(IMMUNE_FAMILIES) as (keyof typeof IMMUNE_FAMILIES)[]).flatMap(immuneMembers),
);

/**
 * The safety re-tints an accent inherits from the colourway it wears, restated here rather than
 * allowed to arrive silently. These are the same two maps `palettePresets.test.ts` names, and
 * the reason they exist is that both colourways carry a brand hue sitting next to a
 * harm-reduction hue, so the safety signal has to step aside or the alarm and the brand differ
 * only by intensity.
 *
 * `garnet` (Red, brand 25) re-seats `--h-rose` from the authored 14 to 350, opening 35° between
 * a scarlet link and a danger callout, and re-pins the two danger literals in that family that
 * do not follow the seed. `sunset` (Amber, brand 45) re-seats `--h-gold` from 68 to 95 and moves
 * the one warning literal that does not follow `--c-amber`.
 *
 * Neither exemption is an accent's decision: the colourway ships these, and the accent reads
 * its override map at build time. Writing them down is what makes the inheritance deliberate.
 */
const SAFETY_RETINT_EXEMPTIONS: Record<string, readonly string[]> = {
  red: ["--theme-interaction-danger-card-primary", "--theme-semantic-danger-badge-text"],
  amber: ["--theme-warning-bg"],
};

describe("semantic immunity", () => {
  it("measures the family membership these assertions were written against", () => {
    expect(immuneMembers("tierRamp")).toHaveLength(10);
    expect(immuneMembers("inlineRamp")).toHaveLength(28);
    expect(immuneMembers("semanticCards")).toHaveLength(15);
    expect(immuneMembers("semanticBadges")).toHaveLength(25);
  });

  it.each(GRID)("keeps both tier ramps byte-identical under $label", ({ label, tokens, baseline }) => {
    // The dose and plateau ramps hard-code their hue numbers instead of reading --h-green,
    // --h-rose and friends, which is exactly what makes "byte-identical" literally true here:
    // no seed and no --c-* scale can reach them, so no accent can either.
    for (const token of immuneMembers("tierRamp")) {
      expect(tokens[token], `${label} re-tinted ${token}`).toBe(baseline[token]);
    }
  });

  it("lets no accent restate a safety signal it has not named", () => {
    // Declaration-level, matching how colourway immunity is already measured: an accent must
    // not name an immune token at all, except the ones its colourway re-tints on purpose.
    for (const accent of ACCENTS) {
      const preset = PALETTE_PRESETS.find((candidate) => candidate.id === accent.funPresetId);
      const declared = [
        ...Object.keys(preset?.overrides.dark ?? {}),
        ...Object.keys(preset?.overrides.light ?? {}),
        ...Object.keys(accent.pro?.dark ?? {}),
        ...Object.keys(accent.pro?.light ?? {}),
      ];
      const allowed = SAFETY_RETINT_EXEMPTIONS[accent.id] ?? [];

      expect(
        declared.filter((token) => IMMUNE.has(token) && !allowed.includes(token)),
        `${accent.id} restates a harm-reduction token; name the exemption or drop the override`,
      ).toEqual([]);
    }
  });

  it("exercises every named safety-retint exemption", () => {
    // A stale exemption is a hole nobody is watching. Each token named above has to still be
    // immune, and still be restated by the colourway the accent wears — otherwise the colourway
    // has moved on and the exemption is protecting nothing.
    for (const [accentId, tokens] of Object.entries(SAFETY_RETINT_EXEMPTIONS)) {
      const accent = ACCENTS.find((candidate) => candidate.id === accentId);
      expect(accent, `${accentId} is not an accent`).toBeDefined();
      const preset = PALETTE_PRESETS.find((candidate) => candidate.id === accent!.funPresetId);

      for (const token of tokens) {
        expect(IMMUNE.has(token), `${token} is no longer immune; drop the exemption`).toBe(true);
        expect(
          { ...preset!.overrides.light, ...preset!.overrides.dark },
          `${accent!.funPresetId} no longer restates ${token}; drop the exemption`,
        ).toHaveProperty(token);
      }
    }
  });

  it("keeps every accent's brand hue clear of the safety hues it sits beside", () => {
    // The guard the two exemptions above are buying, measured rather than hoped for. An accent's
    // Fun half re-seats --h-brand; if a harm-reduction family shares that angle, an alarm and a
    // link become the same colour. Both halves of the fix are the colourway's: it either moves
    // the safety seed away or it was already clear. This asserts the separation that remains.
    const AUTHORED_SAFETY_HUES = {
      "danger rose": "--h-rose",
      "unsafe orange": "--h-orange",
      "caution gold": "--h-gold",
      "success green": "--h-green",
    } as const;
    // The authored angles, read off site-colors.css rather than restated, so a re-seat there
    // moves this measurement too.
    const authoredHue = (seed: string) => {
      const match = new RegExp(`^\\s*${seed}:\\s*([\\d.]+);`, "m").exec(SITE_COLORS);
      expect(match, `${seed} is no longer declared in site-colors.css`).not.toBeNull();
      return Number.parseFloat(match![1]);
    };
    /**
     * The narrowest separation in the reviewed set, so anything tighter is a case nobody has
     * looked at yet. Amber sets it: Sunset's coral brand at 45 against its own burnt-vermilion
     * unsafe at 35. Ten degrees would be too little on its own, and it is not on its own — the
     * two differ by a large value step as well, which is the axis a hue check cannot see. Every
     * other pair in the set clears 23°.
     */
    const MIN_SAFETY_SEPARATION = 10;
    const separation = (a: number, b: number) => {
      const distance = Math.abs(a - b) % 360;
      return Math.min(distance, 360 - distance);
    };

    for (const accent of ACCENTS) {
      if (!accent.funPresetId) continue;
      const preset = PALETTE_PRESETS.find((candidate) => candidate.id === accent.funPresetId)!;
      const seeds = { ...preset.overrides.light, ...preset.overrides.dark };
      const brand = Number.parseFloat(seeds["--h-brand"]);
      expect(brand, `${accent.id} wears a colourway that re-seats no brand hue`).not.toBeNaN();

      for (const [family, seed] of Object.entries(AUTHORED_SAFETY_HUES)) {
        const effective = seeds[seed] ? Number.parseFloat(seeds[seed]) : authoredHue(seed);
        const measured = separation(brand, effective);

        expect(
          measured,
          `${accent.id}: brand ${brand} sits ${measured.toFixed(0)}° from ${family} at ` +
            `${effective} — too close for an alarm to read as an alarm`,
        ).toBeGreaterThanOrEqual(MIN_SAFETY_SEPARATION);
      }
    }
  });

  it("keeps the tier ramps structurally immune rather than merely untouched", () => {
    // The byte-identical assertion above is a measurement; this is the reason it can never fail.
    // Both ramps hard-code their hue numbers and reach no var() at all, so no --h-* seed and no
    // --c-* scale can reach them. An accent cannot re-tint a dose bar even by accident, and if
    // someone rewrites a ramp step to read a seed this is the assertion that stops them.
    const declarations = [...SITE_COLORS.matchAll(/^\s*(--[a-z0-9-]+):\s*([^;]+);/gm)].filter(
      ([, token]) => IMMUNE_FAMILIES.tierRamp.test(token),
    );

    expect(declarations.length).toBeGreaterThan(0);
    for (const [, token, value] of declarations) {
      expect(value, `${token} reaches a var() and is no longer structurally immune`).not.toContain(
        "var(",
      );
    }
  });

  it.each(GRID.filter((entry) => entry.visualStyle === "pro"))(
    "leaves every harm-reduction token untouched on $label",
    ({ label, tokens, baseline }) => {
      // Pro is where this is absolute: the accent only re-seats --ei-*, and pro-theme.css
      // declares no safety token at all, so all 78 must be byte-identical. It is also the
      // second assertion that catches a dropped Fun guard — an unguarded accent leaked
      // --theme-success-* onto a Pro page.
      const moved = [...IMMUNE].filter(
        (token) => baseline[token] !== undefined && baseline[token] !== tokens[token],
      );
      expect(moved, `${label} re-tinted ${moved.join(", ")}`).toEqual([]);
    },
  );
});

/* -------------------------------------------------------------------------
 * The leak list.
 * ---------------------------------------------------------------------- */

/** The authored `--h-brand`, and the band around it a leak would sit in. */
const BRAND_HUE = 326;
const BRAND_BAND = 25;
/**
 * Below this chroma a brand-band colour is a tinted grey rather than brand paint. The one
 * token it excludes is `--theme-review-progress-track-bg`, a near-neutral /dev track at
 * chroma 0.024-0.030 that Pro never rebinds; treating it as accent paint would demand every
 * accent restate an editor-only token that reads as grey on screen.
 */
const BRAND_CHROMA_FLOOR = 0.05;

/**
 * Named exemption, on the same terms as the floor exemption above.
 *
 * `--theme-doc-domain-*` is a five-colour CATEGORICAL palette — blue 235, green 165, orange
 * 54, plum 350, gold following `--h-brand` — where hue is identity, the same reason the CPK
 * molecule palette is immune. Two members sit in the brand band, and on Pro neither moves
 * because Pro rebinds neither, so an accent cannot reach them without collapsing two
 * documentation domains onto one colour.
 */
const LEAK_EXEMPTION = /^--theme-doc-domain-/;

/**
 * One accent-specific exemption, on the same terms, and deliberately keyed by accent so it
 * cannot excuse the same token anywhere else.
 *
 * `--theme-home-glow-top` is the upper of the two soft radial washes behind the homepage hero.
 * Its authored dark value is `rgba(126, 34, 206, 0.13)` — the base palette's **violet**, not its
 * brand fuchsia — and that violet measures hue 301.9, which is **24.1° from `--h-brand` 326**.
 * The band is 25°, so it is caught by 0.9°: a boundary artefact of a hue heuristic, not brand
 * paint. Narrowing the band to 24 to make this one datum fit would silently stop catching real
 * leaks between 24° and 25°, so the band stays where it is and the token is named instead.
 *
 * Amber is the only accent that needs it, because Sunset is the only colourway that restates the
 * authored value verbatim rather than re-seating it. That is Sunset's identity, not an omission:
 * it is "coral horizon over **dusk violet**", so the top wash is the palette's own second
 * colour and moving it would delete the sunset. Canopy, Garnet and Graphite all re-seat the same
 * token, which is why the assertion still bites for Green, Red and Neutral.
 */
const ACCENT_LEAK_EXEMPTIONS: Record<string, readonly string[]> = {
  amber: ["--theme-home-glow-top"],
};

const brandBandColours = (value: string) =>
  [
    ...value.matchAll(
      /#[0-9a-fA-F]{3,8}\b|oklch\([^()]*(?:\([^()]*\)[^()]*)*\)|rgba?\([^()]*(?:\([^()]*\)[^()]*)*\)/g,
    ),
  ].filter((match) => {
    let colour: Rgb;
    try {
      colour = parseColor(match[0]);
    } catch {
      return false;
    }
    const [, chroma, hue] = rgbToOklch(colour);
    const distance = Math.abs(hue - BRAND_HUE) % 360;
    return chroma >= BRAND_CHROMA_FLOOR && Math.min(distance, 360 - distance) <= BRAND_BAND;
  });

describe("brand-band leaks", () => {
  it.each(GRID.filter((entry) => entry.accent.id !== DEFAULT_ACCENT_ID))(
    "leaves no brand-band literal at the default value under $label",
    ({ label, accent, tokens, baseline }) => {
      // #115 made every brand-coloured literal in the Fun palette read an --h-* seed, so a
      // colourway that re-seats the brand moves the whole page. This is that guarantee, stated
      // from the other end: any token painted in the authored brand band has to have moved.
      const allowed = ACCENT_LEAK_EXEMPTIONS[accent.id] ?? [];
      const leaks = Object.keys(baseline).filter(
        (token) =>
          !LEAK_EXEMPTION.test(token) &&
          !allowed.includes(token) &&
          brandBandColours(baseline[token]).length > 0 &&
          baseline[token] === tokens[token],
      );

      expect(leaks, `${label} left ${leaks.join(", ")} in the authored brand band`).toEqual([]);
    },
  );

  it("exercises the named leak exemption", () => {
    const exempted = GRID.filter((entry) => entry.accent.id !== DEFAULT_ACCENT_ID).flatMap(
      (entry) =>
        Object.keys(entry.baseline).filter(
          (token) =>
            LEAK_EXEMPTION.test(token) &&
            brandBandColours(entry.baseline[token]).length > 0 &&
            entry.baseline[token] === entry.tokens[token],
        ),
    );

    expect(exempted.length, "no token needs the doc-domain exemption; drop it").toBeGreaterThan(0);
  });

  it("exercises every named accent leak exemption", () => {
    // Each exemption has to still describe a token that really is in the band and really has not
    // moved for that accent — otherwise the colourway has changed and the hole should close.
    for (const [accentId, tokens] of Object.entries(ACCENT_LEAK_EXEMPTIONS)) {
      for (const token of tokens) {
        const stuck = GRID.filter(
          (entry) =>
            entry.accent.id === accentId &&
            brandBandColours(entry.baseline[token] ?? "").length > 0 &&
            entry.baseline[token] === entry.tokens[token],
        );

        expect(
          stuck.length,
          `${accentId} now moves ${token}, or it left the brand band; drop the exemption`,
        ).toBeGreaterThan(0);
      }
    }
  });
});

/* -------------------------------------------------------------------------
 * The swatch.
 * ---------------------------------------------------------------------- */

/**
 * How far a swatch may sit from the colour it advertises.
 *
 * 0.02 in OKLab is about one just-noticeable difference, so this admits a hex rounded from the
 * rendered value — the only reason the two would differ at all — and rejects any actually
 * different colour. It is tight by a wide margin against the two provisional swatches this
 * table replaced: the drafted `#d946ef` for `default` sits 0.209 from the rendered `#f0abfc`,
 * and the drafted `#3b82c4` for `blue` sits 0.336 from `#a5f3fc`. Both are an order of
 * magnitude outside it.
 */
const SWATCH_TOLERANCE = 0.02;

describe("swatch honesty", () => {
  it.each(GRID.filter((entry) => entry.visualStyle === "fun" && entry.theme === "dark"))(
    "advertises what $label actually paints",
    ({ accent, tokens }) => {
      // Fun dark is the publication's opening appearance, so it is the one appearance a single
      // dot can honestly stand for. Measuring it here is what stops a hand-picked swatch from
      // describing a page nobody renders.
      const rendered = parseColor(tokens["--theme-accent"]);
      const advertised = parseColor(accent.swatch);
      const distance = deltaEok(advertised, rendered);

      expect(
        distance,
        `${accent.id}: swatch ${accent.swatch} is ΔEok ${distance.toFixed(3)} from the rendered ` +
          `Fun-dark --theme-accent ${toHex(rendered)}`,
      ).toBeLessThanOrEqual(SWATCH_TOLERANCE);
    },
  );
});

/* -------------------------------------------------------------------------
 * The stylesheet.
 * ---------------------------------------------------------------------- */

describe("accent stylesheet", () => {
  it("emits nothing at all for the default accent", () => {
    const defaultAccent = ACCENTS.find((accent) => accent.id === DEFAULT_ACCENT_ID)!;

    expect(defaultAccent.funPresetId).toBeNull();
    expect(defaultAccent.pro).toBeNull();
    // Not "emits an empty block": emits no block. Zero overrides is what makes a first paint
    // with no attribute already correct, so a block here — even an empty one — would mean the
    // default had become a thing the cascade has to resolve.
    expect(buildAccentStylesheetCss([defaultAccent])).toBe(buildAccentStylesheetCss([]));
    expect(read(ACCENT_STYLESHEET_PATH)).not.toContain(`${ACCENT_ATTRIBUTE}="${DEFAULT_ACCENT_ID}"`);
  });

  it("matches the checked-in stylesheet", () => {
    // The drift check. An accent edited without `npm run generate:accent-css` fails here rather
    // than shipping a palette the definitions no longer describe.
    expect(read(ACCENT_STYLESHEET_PATH)).toBe(buildAccentStylesheetCss());
  });

  it("emits the selector shapes the cascade ladder pins", () => {
    const css = read(ACCENT_STYLESHEET_PATH);

    expect(accentFunBlockSelector("blue", "dark")).toBe(
      'html[data-accent="blue"][data-theme="dark"]:where(:not([data-visual-style="pro"]))',
    );
    expect(accentProBlockSelector("blue", "light")).toBe(
      'html[data-visual-style="pro"][data-accent="blue"][data-theme="light"]',
    );

    for (const accent of ACCENTS) {
      if (accent.id === DEFAULT_ACCENT_ID) continue;
      for (const theme of SCHEMES) {
        expect(css).toContain(accentFunBlockSelector(accent.id, theme));
        expect(css).toContain(accentProBlockSelector(accent.id, theme));
      }
      // The dark-chrome island, so a dark header on a light page wears the accent too.
      expect(css).toContain(
        `${accentFunBlockSelector(accent.id, "light")} .theme-chrome-dark`,
      );
    }
  });

  it("declares exactly the Pro seeds the authored palette declares", () => {
    // Derived from pro-theme.css, not from a wish list: --ei-accent-on-dark is declared once,
    // in the light block, because the chrome rails read it in both schemes, and --ei-fade and
    // --ei-logo-ink are paper and ink rather than accent.
    const skin = read("src/styles/pro-theme.css");
    expect(skin).toContain("--ei-accent-on-dark: #6fc4bb;");
    expect(skin.match(/--ei-accent-on-dark:/g)).toHaveLength(1);

    for (const accent of ACCENTS) {
      if (!accent.pro) continue;
      expect(Object.keys(accent.pro.light), `${accent.id} light seeds`).toEqual([
        ...PRO_ACCENT_SEED_NAMES.light,
      ]);
      expect(Object.keys(accent.pro.dark), `${accent.id} dark seeds`).toEqual([
        ...PRO_ACCENT_SEED_NAMES.dark,
      ]);
    }
  });

  it("reads the Fun half out of the colourway rather than copying it", () => {
    const css = read(ACCENT_STYLESHEET_PATH);

    for (const accent of ACCENTS) {
      if (!accent.funPresetId) continue;
      const preset = PALETTE_PRESETS.find((candidate) => candidate.id === accent.funPresetId);
      expect(preset, `${accent.id} names a colourway that exists`).toBeDefined();

      for (const [token, value] of Object.entries(preset!.overrides.dark)) {
        expect(css).toContain(`  ${token}: ${value};`);
      }
    }
  });
});

/* -------------------------------------------------------------------------
 * The axis.
 * ---------------------------------------------------------------------- */

describe("accent axis", () => {
  beforeEach(() => {
    document.documentElement.removeAttribute("data-accent");
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.removeAttribute("data-visual-style");
  });

  it("agrees with the manifest about which accents exist", () => {
    expect([...SUPPORTED_ACCENTS]).toEqual(ACCENTS.map((accent) => accent.id));
    // Six, and the six the contract settled. Named rather than counted: a set that silently
    // grew or lost a member would still satisfy a length check.
    expect(ACCENTS.map((accent) => accent.id)).toEqual([
      "default",
      "blue",
      "green",
      "red",
      "amber",
      "neutral",
    ]);
    expect(DEFAULT_ACCENT).toBe(DEFAULT_ACCENT_ID);
    expect(ACCENT_STORAGE_KEY).toBe("dosewiki-accent");
    expect(ACCENT_ATTRIBUTE).toBe("data-accent");
  });

  it("keeps the Lab-only colourways out of the accent row and still resolving", () => {
    // Letterpress is the case worth naming: `journal` is a Fun colourway that imitates Pro, and
    // it is deliberately NOT an accent — a reader who wants Pro picks the visual style. Its id is
    // frozen even so, because editors have saved palettes pointing at it, so it has to keep
    // resolving as a colourway while being absent from the accent row. The jokes and the
    // seasonals are the same shape: fun to wear from the Lab, not a publication appearance.
    const LAB_ONLY = [
      "journal",
      "halloween",
      "yuletide",
      "liberty",
      "twilight",
      "parchment",
    ] as const;
    for (const id of LAB_ONLY) {
      expect(
        PALETTE_PRESETS.find((preset) => preset.id === id),
        `${id} no longer resolves as a colourway; editors have palettes saved against it`,
      ).toBeDefined();
      expect(
        ACCENTS.some((accent) => accent.funPresetId === id),
        `${id} is a Lab-only colourway and must not be an accent`,
      ).toBe(false);
      // And not as an accent ID either: an accent row is a list of ids, and a colourway id that
      // happened to resolve there would render a palette the cog never advertised.
      expect(isAccent(id)).toBe(false);
      expect(getAccent(id).id).toBe(DEFAULT_ACCENT_ID);
    }
  });

  it("degrades an unknown accent to the default rather than erroring", () => {
    for (const accent of ACCENTS) expect(isAccent(accent.id)).toBe(true);
    // A colour scheme, a visual style and a colourway are the three ids most likely to arrive
    // here by mistake, from a mis-keyed storage read or a hand-typed attribute. None is an
    // accent, and each has to land on the accent that emits nothing rather than on a
    // half-applied block.
    expect(isAccent("dark")).toBe(false);
    expect(isAccent("pro")).toBe(false);
    expect(isAccent("journal")).toBe(false);
    expect(getAccent("journal").id).toBe(DEFAULT_ACCENT_ID);
    expect(getAccent(null).id).toBe(DEFAULT_ACCENT_ID);
    expect(getAccent("blue").funPresetId).toBe("abyss");
    expect(getAccent("green").funPresetId).toBe("canopy");
    expect(getAccent("red").funPresetId).toBe("garnet");
    expect(getAccent("amber").funPresetId).toBe("sunset");
    expect(getAccent("neutral").funPresetId).toBe("graphite");
  });

  it("leaves the attribute absent for the default and writes it otherwise", () => {
    const script = buildThemeBootstrapScript(SITE_FLAVOR_CONFIGS.dosewiki);

    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: { getItem: () => null },
    });
    Function(script)();
    expect(document.documentElement.dataset.accent).toBeUndefined();

    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: { getItem: (key: string) => (key === ACCENT_STORAGE_KEY ? "blue" : null) },
    });
    Function(script)();
    expect(document.documentElement.dataset.accent).toBe("blue");

    // And back again: switching to the default has to REMOVE the attribute, not set it to the
    // default id, or the reader ends up matching a block that does not exist.
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: { getItem: (key: string) => (key === ACCENT_STORAGE_KEY ? DEFAULT_ACCENT : null) },
    });
    Function(script)();
    expect(document.documentElement.dataset.accent).toBeUndefined();
  });

  it("never names the storage key on a publication that locks the axis", () => {
    const locked = buildThemeBootstrapScript(SITE_FLAVOR_CONFIGS.effectindex);

    expect(SITE_FLAVOR_CONFIGS.effectindex.showAccentPicker).toBe(false);
    expect(SITE_FLAVOR_CONFIGS.dosewiki.showAccentPicker).toBe(true);
    // A lock is not a hidden control: the key is not read and then overridden, it is absent,
    // so a dose.wiki reader's accent cannot follow them into Effect Index's identity.
    expect(locked).not.toContain(ACCENT_STORAGE_KEY);
    // The axis resolves at BUILD time, so the locked script declares no `accent` binding at all
    // and carries no branch over it — it compiles to the single statement that removes the
    // attribute. Asserting the absence of the binding rather than the presence of a constant is
    // what keeps a future edit from reintroducing dead per-page bytes here.
    expect(locked).not.toContain("accent =");
    expect(locked).not.toContain("if (accent");
    expect(locked).toContain("delete root.dataset.accent;");
    // And the validity set is absent too, not merely unused. Six accents is three times the
    // bytes two were, so a locked publication that emitted the list would carry a table it can
    // never consult — and the cost would grow every time the set does.
    expect(locked).not.toContain("const ACCENTS =");
    // The whole locked script stays under the unlocked one by a wide margin; a regression that
    // re-emits the resolution would close that gap.
    expect(locked.length).toBeLessThan(
      buildThemeBootstrapScript(SITE_FLAVOR_CONFIGS.dosewiki).length,
    );
    for (const accent of ACCENTS) {
      if (accent.id === DEFAULT_ACCENT_ID) continue;
      expect(locked, `${accent.id} leaked into the locked bootstrap`).not.toContain(
        `"${accent.id}"`,
      );
    }
  });
});
