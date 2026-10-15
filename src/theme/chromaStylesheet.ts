import { CHROME_DARK_CLASS } from "@/theme/chromeDark";
import { BASE_ACCENT_ID, BASE_ACCENT_PRO_SEEDS, BASE_ACCENT_SWATCH } from "./accents";
import {
  ACCENT_HUE_PROPERTY,
  ACCENT_LEVEL_PROPERTY,
  CHROMA_ATTRIBUTE,
  CHROMA_SUPPORT_PROBE,
  SURFACE_HUE_PROPERTY,
  SURFACE_LEVEL_PROPERTY,
} from "./appearanceChroma";
import { BASE_SURFACE_ID, BASE_SURFACE_PRO_SEEDS, BASE_SURFACE_TINT } from "./surfaces";
import {
  ACHROMATIC_CHROMA,
  authoredLevel,
  isChromaticLiteral,
  proAccentRepresentativeSeed,
} from "./chromaMath";
import accentFunTokens from "./accentFunTokens.generated.json";
import surfaceFunTokens from "./surfaceFunTokens.generated.json";

const SURFACE_GAIN_PROPERTY = "--dw-surface-gain";
const ACCENT_GAIN_PROPERTY = "--dw-accent-gain";

export const CHROMA_STYLESHEET_PATH = "public/appearance-chroma.css";

const NOT_PRO = ':where(:not([data-visual-style="pro"]))';

type SchemeTokens = Record<string, string>;
type ColourwayTokens = { dark: SchemeTokens; light: SchemeTokens };

type ChromaArithmetic = {
  readonly chroma: (expression: string) => string;
  readonly shift: string;
  readonly wrapsAchromatic: boolean;
};

export function wrapChromaValue(
  value: string,
  gainProperty: string,
  hueProperty: string,
): { text: string; wrapped: number } {
  const gain = `var(${gainProperty})`;
  return rewriteChromaValue(value, {
    chroma: (expression) => `calc(${expression} * ${gain})`,
    shift: `var(${hueProperty}, 0)`,
    wrapsAchromatic: false,
  });
}

export function wrapAdditiveChromaValue(
  value: string,
  deltaExpression: string,
  hueProperty: string,
): { text: string; wrapped: number } {
  return rewriteChromaValue(value, {
    chroma: (expression) => `calc(${expression} + ${deltaExpression})`,
    shift: `var(${hueProperty}, 0)`,
    wrapsAchromatic: true,
  });
}

function rewriteChromaValue(
  value: string,
  arithmetic: ChromaArithmetic,
): { text: string; wrapped: number } {
  if (!/#|rgba?\(|oklch\(|hsla?\(/.test(value)) return { text: value, wrapped: 0 };
  const { shift } = arithmetic;
  let out = "";
  let index = 0;
  let wrapped = 0;

  while (index < value.length) {
    const rest = value.slice(index);

    const hex = /^#[0-9a-fA-F]{3,8}\b/.exec(rest);
    if (hex) {
      if (arithmetic.wrapsAchromatic || isChromaticLiteral(hex[0])) {
        out += `oklch(from ${hex[0]} l ${arithmetic.chroma("c")} calc(h + ${shift}))`;
        wrapped += 1;
      } else {
        out += hex[0];
      }
      index += hex[0].length;
      continue;
    }

    const fn = /^(rgba?|oklch|hsla?)\(/.exec(rest);
    if (!fn) {
      out += value[index];
      index += 1;
      continue;
    }

    const close = matchingParen(value, index + fn[0].length - 1);
    const whole = value.slice(index, close + 1);
    const inner = value.slice(index + fn[0].length, close);
    index = close + 1;

    if (fn[1] === "oklch" && /^\s*from\s/.test(inner)) {
      out += scaleRelativeOklch(inner, arithmetic);
      wrapped += 1;
      continue;
    }
    if (fn[1] === "oklch") {
      const scaled = scaleBareOklch(whole, inner, arithmetic);
      out += scaled ?? whole;
      if (scaled) wrapped += 1;
      continue;
    }
    if (fn[1].startsWith("hsl") || arithmetic.wrapsAchromatic || isChromaticLiteral(whole)) {
      out += `oklch(from ${whole} l ${arithmetic.chroma("c")} calc(h + ${shift}))`;
      wrapped += 1;
    } else {
      out += whole;
    }
  }

  return { text: out, wrapped };
}

function matchingParen(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === "(") depth += 1;
    else if (text[i] === ")") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  throw new Error(`Unbalanced parentheses in token value: ${text}`);
}

function scaleRelativeOklch(inner: string, arithmetic: ChromaArithmetic): string {
  const afterFrom = inner.trim().replace(/^from\s+/, "");
  const parts = splitTopLevel(afterFrom);
  if (parts.length < 4) throw new Error(`Unrecognised relative oklch: oklch(${inner})`);
  const c = parts[2]!;
  const scaled = c.startsWith("calc(") ? arithmetic.chroma(`(${c.slice(5, -1)})`) : arithmetic.chroma(c);
  const tail = parts.length > 4 ? ` ${parts.slice(4).join(" ")}` : "";
  return `oklch(from ${parts[0]} ${parts[1]} ${scaled} ${rotateHue(parts[3]!, arithmetic.shift)}${tail})`;
}

function rotateHue(hue: string, shift: string): string {
  if (hue.startsWith("calc(")) return `calc((${hue.slice(5, -1)}) + ${shift})`;
  const unitless = /^(-?(?:\d+\.?\d*|\.\d+))deg$/.exec(hue)?.[1] ?? hue;
  return `calc(${unitless} + ${shift})`;
}

function scaleBareOklch(
  whole: string,
  inner: string,
  arithmetic: ChromaArithmetic,
): string | null {
  const parts = splitTopLevel(inner.trim());
  const chroma = Number(parts[1]);
  if (!Number.isFinite(chroma)) {
    return `oklch(from ${whole} l ${arithmetic.chroma("c")} calc(h + ${arithmetic.shift}))`;
  }
  if (chroma < ACHROMATIC_CHROMA && !arithmetic.wrapsAchromatic) return null;
  const tail = parts.length > 3 ? ` ${parts.slice(3).join(" ")}` : "";
  return `oklch(${parts[0]} ${arithmetic.chroma(parts[1]!)} ${rotateHue(parts[2]!, arithmetic.shift)}${tail})`;
}

function splitTopLevel(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const char of text) {
    if (char === "(") depth += 1;
    else if (char === ")") depth -= 1;
    if (depth === 0 && /\s/.test(char)) {
      if (current) parts.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  if (current) parts.push(current);
  return parts;
}

function surfaceBlockSelector(theme: string): string {
  return `html[${CHROMA_ATTRIBUTE}]:not([data-surface])[data-theme="${theme}"]${NOT_PRO}`;
}

function accentBlockSelectors(theme: string): string[] {
  const own = `html[${CHROMA_ATTRIBUTE}]:not([data-accent])[data-theme="${theme}"]${NOT_PRO}`;
  if (theme !== "dark") return [own];
  return [
    own,
    `html[${CHROMA_ATTRIBUTE}]:not([data-accent])[data-theme="light"]${NOT_PRO} .${CHROME_DARK_CLASS}`,
  ];
}

function proAccentBlockSelector(theme: string): string {
  return `html[${CHROMA_ATTRIBUTE}]:not([data-accent])[data-theme="${theme}"][data-visual-style="pro"]`;
}

function proSurfaceBlockSelector(theme: string): string {
  return `html[${CHROMA_ATTRIBUTE}]:not([data-surface])[data-theme="${theme}"][data-visual-style="pro"]`;
}

type AxisProperties = {
  readonly gain: string;
  readonly level: string;
  readonly hue: string;
};

const SURFACE_AXIS: AxisProperties = {
  gain: SURFACE_GAIN_PROPERTY,
  level: SURFACE_LEVEL_PROPERTY,
  hue: SURFACE_HUE_PROPERTY,
};

const ACCENT_AXIS: AxisProperties = {
  gain: ACCENT_GAIN_PROPERTY,
  level: ACCENT_LEVEL_PROPERTY,
  hue: ACCENT_HUE_PROPERTY,
};

function chromaBlock(
  selectors: readonly string[],
  tokens: SchemeTokens,
  axis: AxisProperties,
  authored: number,
): string {
  const declarations: string[] = [];
  for (const [token, value] of Object.entries(tokens)) {
    const { text, wrapped } = wrapChromaValue(value, axis.gain, axis.hue);
    if (wrapped > 0) declarations.push(`  ${token}: ${text};`);
  }
  if (declarations.length === 0) return "";
  const denominator = authored.toFixed(4);
  const gain = `  ${axis.gain}: calc(var(${axis.level}, ${denominator}) / ${denominator});`;
  return `${selectors.join(",\n")} {\n${gain}\n${declarations.join("\n")}\n}\n`;
}

export const PRO_SURFACE_CHROMA_DELTA = { dark: 0.05, light: 0.06 } as const;

function additiveChromaBlock(
  selectors: readonly string[],
  tokens: SchemeTokens,
  axis: AxisProperties,
  delta: number,
): string {
  const deltaExpression = `${delta.toFixed(4)} * var(${axis.level}, 0)`;
  const declarations = Object.entries(tokens).map(([token, value]) => {
    const { text, wrapped } = wrapAdditiveChromaValue(value, deltaExpression, axis.hue);
    if (wrapped === 0) {
      throw new Error(`Pro surface seed ${token} holds no colour literal: ${value}`);
    }
    return `  ${token}: ${text};`;
  });
  return `${selectors.join(",\n")} {\n${declarations.join("\n")}\n}\n`;
}

export function buildChromaLevels(): {
  surfaces: Record<string, { dark: number; light: number }>;
  accents: Record<string, number>;
} {
  return {
    surfaces: {
      [BASE_SURFACE_ID]: {
        dark: round4(authoredLevel(BASE_SURFACE_TINT.dark)),
        light: round4(authoredLevel(BASE_SURFACE_TINT.light)),
      },
    },
    accents: { [BASE_ACCENT_ID]: round4(authoredLevel(BASE_ACCENT_SWATCH)) },
  };
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

const HEADER = `/* GENERATED FILE: do not edit by hand.
   Source: src/theme/chromaStylesheet.ts
   Regenerate: npm run generate:chroma-css

   The saturation and hue appearance axes. Loaded ONLY by the pre-paint
   bootstrap (never imported by the application bundle) on every page whose
   build leaves a colour axis unlocked: the bootstrap paints the reader's
   saved values or the site defaults. Every block requires html[${CHROMA_ATTRIBUTE}]
   and computes one gain, level ÷ authored-level, applied to the chroma of
   every chromatic literal in the base palette's tokens through relative
   colour syntax, while each literal's hue slot gains + var(--dw-*-hue, 0),
   a bare number of degrees, since the h channel is a number inside calc().
   Lightness is never touched, and hue is periodic in oklch() so plain
   addition needs no wrap-around. Unset properties fall back to the authored
   denominator and 0, so a matched block with nothing on its axis is inert.

   The whole sheet is wrapped in @supports on that exact grammar: a browser
   whose relative colour syntax types h as an angle (Safari 16.4 to 17.x) or
   lacks the syntax (Safari 16.3 and older) would otherwise turn every
   rewritten token invalid and paint the accent, logo and panels blank. The
   bootstrap and the provider probe CSS.supports with the same expression
   before engaging the attribute.

   The harm-reduction ramp, dose tiers and plateau tiers are structurally
   absent: the Fun blocks' input token maps are filtered by paletteTokenRole,
   which routes every semantic family away from the appearance axes, and the
   Pro blocks re-seat only --ei-* seeds: the nine accent seeds and the eight
   surface-material seeds. Fun blocks carry the same :where() Pro guard as
   the base sheets; the Pro blocks are keyed [data-visual-style="pro"]. The
   Pro accent's gain denominator is the Pro ramp's own --ei-accent level per
   scheme; the Pro surface family is authored (near-)achromatic, with no level to
   divide by, so its blocks ADD chroma, calc(c + K * var(--dw-surface-level, 0)),
   and an unset level or Pro's own default level 0 resolves the authored
   charcoal exactly. Only the base colourways exist now; every other look is
   a (hue, level) point. */
`;

const SUPPORTS_OPEN = `@supports (color: ${CHROMA_SUPPORT_PROBE}) {\n`;

export function buildChromaStylesheetCss(): string {
  const blocks: string[] = [];

  const surfaceTokens = (surfaceFunTokens as Record<string, ColourwayTokens>)[BASE_SURFACE_ID];
  if (!surfaceTokens) throw new Error(`No generated tokens for surface "${BASE_SURFACE_ID}"`);
  for (const theme of ["dark", "light"] as const) {
    blocks.push(
      chromaBlock(
        [surfaceBlockSelector(theme)],
        surfaceTokens[theme],
        SURFACE_AXIS,
        authoredLevel(BASE_SURFACE_TINT[theme]),
      ),
    );
  }

  for (const theme of ["dark", "light"] as const) {
    blocks.push(
      additiveChromaBlock(
        [proSurfaceBlockSelector(theme)],
        { ...BASE_SURFACE_PRO_SEEDS[theme] },
        SURFACE_AXIS,
        PRO_SURFACE_CHROMA_DELTA[theme],
      ),
    );
  }

  const accentTokens = (accentFunTokens as Record<string, ColourwayTokens>)[BASE_ACCENT_ID];
  if (!accentTokens) throw new Error(`No generated tokens for accent "${BASE_ACCENT_ID}"`);
  for (const theme of ["dark", "light"] as const) {
    blocks.push(
      chromaBlock(
        accentBlockSelectors(theme),
        accentTokens[theme],
        ACCENT_AXIS,
        authoredLevel(BASE_ACCENT_SWATCH),
      ),
    );
  }
  for (const theme of ["dark", "light"] as const) {
    const seed = proAccentRepresentativeSeed(BASE_ACCENT_PRO_SEEDS, theme);
    if (seed === null) continue;
    blocks.push(
      chromaBlock(
        [proAccentBlockSelector(theme)],
        { ...BASE_ACCENT_PRO_SEEDS[theme] },
        ACCENT_AXIS,
        authoredLevel(seed),
      ),
    );
  }

  return `${HEADER}\n${SUPPORTS_OPEN}${blocks.filter(Boolean).join("\n")}}\n`;
}
