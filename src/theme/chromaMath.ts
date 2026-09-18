/**
 * OKLCH chroma arithmetic for the saturation appearance axis.
 *
 * The axis's model: a *level* in 0..1 places a colour's chroma relative to the
 * most chroma sRGB can hold at that colour's own lightness and hue —
 * `C = level × Cmax(L, H)`. Lightness and hue never move. Levels are what make
 * "the same saturation" comparable across hues: a flat chroma multiplier means
 * something different at cyan's lightness than at amber's, a level does not.
 *
 * Two consumers share this module: `scripts/build/generateChromaCss.ts` bakes
 * per-colourway authored levels into `public/appearance-chroma.css` at build
 * time, and `AppearanceAxes` previews swatches and paints slider tracks live.
 * It lives in `src/theme/` deliberately — the token audit exempts this
 * directory, and the palette's other colour policy already lives here.
 */


const enum Channel {
  R = 0,
  G = 1,
  B = 2,
}

type Rgb = readonly [number, number, number];
export type Oklch = { readonly l: number; readonly c: number; readonly h: number };

function srgbToLinear(value: number): number {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(value: number): number {
  return value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055;
}

/** Parse `#rgb`, `#rrggbb`, `rgb(r g b …)` or `rgb(r, g, b …)`; null otherwise. */
export function parseColorLiteral(literal: string): Rgb | null {
  const trimmed = literal.trim();
  if (trimmed.startsWith("#")) {
    const hex = trimmed.slice(1);
    const size = hex.length === 3 || hex.length === 4 ? 1 : hex.length === 6 || hex.length === 8 ? 2 : 0;
    if (size === 0 || !/^[0-9a-fA-F]+$/.test(hex)) return null;
    const at = (i: number) => {
      const part = hex.slice(i * size, i * size + size);
      return parseInt(size === 1 ? part + part : part, 16) / 255;
    };
    return [at(Channel.R), at(Channel.G), at(Channel.B)];
  }
  const match = /^rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})/.exec(trimmed);
  if (!match) return null;
  return [Number(match[1]) / 255, Number(match[2]) / 255, Number(match[3]) / 255];
}

function rgbToOklab(rgb: Rgb): readonly [number, number, number] {
  const r = srgbToLinear(rgb[Channel.R]);
  const g = srgbToLinear(rgb[Channel.G]);
  const b = srgbToLinear(rgb[Channel.B]);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function oklabToLinear(l: number, a: number, b: number): Rgb {
  const l3 = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m3 = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s3 = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3,
    -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3,
    -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3,
  ];
}

export function toOklch(literal: string): Oklch | null {
  const rgb = parseColorLiteral(literal);
  if (!rgb) return null;
  const [l, a, b] = rgbToOklab(rgb);
  const h = (Math.atan2(b, a) * 180) / Math.PI;
  return { l, c: Math.hypot(a, b), h: (h + 360) % 360 };
}

function inGamut(l: number, c: number, h: number): boolean {
  const radians = (h * Math.PI) / 180;
  const rgb = oklabToLinear(l, c * Math.cos(radians), c * Math.sin(radians));
  return rgb.every((value) => value >= -0.0002 && value <= 1.0002);
}

/** The most chroma sRGB can hold at this lightness and hue, by bisection. */
export function maxChroma(l: number, h: number): number {
  let low = 0;
  let high = 0.45;
  for (let step = 0; step < 24; step += 1) {
    const mid = (low + high) / 2;
    if (inGamut(l, mid, h)) low = mid;
    else high = mid;
  }
  return low;
}

/** Below this chroma a literal is treated as colourless and never rescaled. */
export const ACHROMATIC_CHROMA = 0.005;

export function isChromaticLiteral(literal: string): boolean {
  const oklch = toOklch(literal);
  return oklch !== null && oklch.c >= ACHROMATIC_CHROMA;
}

/**
 * Where a colour already sits, as a level in 0..1. Achromatic colours have no
 * meaningful level, and this returns 0 for them.
 */
export function authoredLevel(literal: string): number {
  const oklch = toOklch(literal);
  if (!oklch) return 0;
  const ceiling = maxChroma(oklch.l, oklch.h);
  return ceiling > 0.001 ? Math.min(1, oklch.c / ceiling) : 0;
}

/** Same L, same H, chroma re-seated at `level` of the gamut ceiling, as hex. */
export function atLevel(literal: string, level: number): string {
  const oklch = toOklch(literal);
  if (!oklch || oklch.c < ACHROMATIC_CHROMA) return literal;
  const c = Math.min(Math.max(level, 0), 1) * maxChroma(oklch.l, oklch.h);
  const radians = (oklch.h * Math.PI) / 180;
  const linear = oklabToLinear(oklch.l, c * Math.cos(radians), c * Math.sin(radians));
  const channel = (value: number) =>
    Math.round(Math.min(1, Math.max(0, linearToSrgb(value))) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${channel(linear[Channel.R])}${channel(linear[Channel.G])}${channel(linear[Channel.B])}`;
}

/**
 * The Pro half's representative seed: `--ei-accent`, the base step of the Pro
 * ramp — the link colour every other `--ei-*` accent step is derived around,
 * and the seed Pro's own contrast budgets are stated against. Both the CSS
 * gain denominator (`chromaStylesheet.ts`) and the saturation slider's rail
 * and tick (`AppearanceAxes.tsx`) read this one pick, so the level the slider
 * calls "authored" is exactly the level at which the emitted Pro block's gain
 * resolves to 1 — the two cannot diverge.
 *
 * Null when the ramp does not declare the seed — the same gate block emission
 * uses, so a slider tick can never sit over a block that was never emitted.
 */
export function proAccentRepresentativeSeed(
  pro: {
    readonly light: Readonly<Record<string, string>>;
    readonly dark: Readonly<Record<string, string>>;
  },
  scheme: "dark" | "light",
): string | null {
  return pro[scheme]["--ei-accent"] ?? null;
}
