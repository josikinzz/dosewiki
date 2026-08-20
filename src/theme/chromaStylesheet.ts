import { CHROME_DARK_CLASS } from "@/theme/chromeDark";
import { ACCENTS, BASE_ACCENT_ID } from "./accents";
import {
  ACCENT_LEVEL_PROPERTY,
  CHROMA_ATTRIBUTE,
  SURFACE_LEVEL_PROPERTY,
} from "./appearanceChroma";
import { BASE_SURFACE_ID, SURFACES } from "./surfaces";
import {
  ACHROMATIC_CHROMA,
  authoredLevel,
  isChromaticLiteral,
  proAccentRepresentativeSeed,
} from "./chromaMath";
import accentFunTokens from "./accentFunTokens.generated.json";
import surfaceFunTokens from "./surfaceFunTokens.generated.json";

/**
 * The saturation appearance axis, compiled into plain CSS.
 *
 * The reader owns one *level* per colour axis — 0..1, where a colour at level t
 * renders with chroma `t × Cmax(L,H)` (see `chromaMath.ts`). This module turns
 * the two role-filtered Fun token maps — and, for the accent axis, each
 * accent's Pro `--ei-*` seeds — into blocks that apply that model with pure
 * CSS: every chromatic literal in a token's value is re-emitted through
 * relative colour syntax with its chroma multiplied by a per-block *gain*,
 *
 *   --dw-surface-gain: calc(var(--dw-surface-level, <authored>) / <authored>);
 *
 * where `<authored>` is the colourway's own representative level in that
 * scheme. One shared gain per block keeps a colourway's internal chroma
 * relationships (muted panel vs vivid brand) intact while the seven options
 * equalise: at the same level, every colourway's representative lands on the
 * same gamut-relative saturation. An unset level falls back to the authored
 * denominator, so gain resolves to 1 and the block is inert.
 *
 * Every block requires `data-chroma` on the root. The pre-paint bootstrap sets
 * that attribute — and injects this stylesheet — on every page now: a reader
 * with no saved level gets the site-default levels (`DEFAULT_SURFACE_LEVEL` /
 * `DEFAULT_ACCENT_LEVEL` in `appearanceChroma.ts`), so only a publication that
 * locks both colour axes (Effect Index) ships none of this.
 *
 * Safety: the input maps are already filtered by `paletteTokenRole`, which
 * routes the harm-reduction ramp (success/caution/unsafe/danger/info), the
 * dose-tier and the plateau-tier families to "semantic" — none of them can
 * appear here, so no level can desaturate a warning. `chromaStylesheet.test.ts`
 * asserts that exclusion against the emitted text. The Pro accent seeds are
 * not role-filtered maps, but the nine `PRO_ACCENT_SEED_NAMES` are all
 * accent-family by construction (and `paletteTokenRole` classifies every one
 * of them "accent"), so the same invariant holds there.
 *
 * Achromatic colourways (Graphite surface, Neutral accent) emit no block: they
 * have no chroma to scale, and their slider is faded in the panel. Pro's
 * surface family is in the same position — see the note in
 * `buildChromaStylesheetCss` — so the surface axis is Fun-only while the
 * accent axis works on both visual styles.
 */

/** Block-local gains derived from the levels; never written by script. */
const SURFACE_GAIN_PROPERTY = "--dw-surface-gain";
const ACCENT_GAIN_PROPERTY = "--dw-accent-gain";

/** Where the generator writes the stylesheet. Readers fetch it via `CHROMA_STYLESHEET_HREF`. */
export const CHROMA_STYLESHEET_PATH = "public/appearance-chroma.css";

/** Guard on every Fun block, same reason as the base sheets: a Fun block must not match Pro. */
const NOT_PRO = ':where(:not([data-visual-style="pro"]))';

type SchemeTokens = Record<string, string>;
type ColourwayTokens = { dark: SchemeTokens; light: SchemeTokens };

/**
 * Rewrite one token value so every chromatic literal's chroma is multiplied by
 * `var(gainProperty)`. Achromatic literals (greys, black, white, shadow ink)
 * pass through untouched; a value with nothing chromatic reports `wrapped: 0`
 * and is dropped by the caller. Handles the whole value grammar the generated
 * maps use: bare hex / `rgb()` / `oklch()`, and literals nested inside
 * `color-mix()`, gradients, shadow lists and existing `oklch(from …)`
 * relative-colour expressions (whose chroma component is multiplied in place).
 */
export function wrapChromaValue(
  value: string,
  gainProperty: string,
): { text: string; wrapped: number } {
  if (!/#|rgba?\(|oklch\(|hsla?\(/.test(value)) return { text: value, wrapped: 0 };
  const gain = `var(${gainProperty})`;
  let out = "";
  let index = 0;
  let wrapped = 0;

  while (index < value.length) {
    const rest = value.slice(index);

    const hex = /^#[0-9a-fA-F]{3,8}\b/.exec(rest);
    if (hex) {
      if (isChromaticLiteral(hex[0])) {
        out += `oklch(from ${hex[0]} l calc(c * ${gain}) h)`;
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
      out += scaleRelativeOklch(inner, gain);
      wrapped += 1;
      continue;
    }
    if (fn[1] === "oklch") {
      const scaled = scaleBareOklch(whole, inner, gain);
      out += scaled ?? whole;
      if (scaled) wrapped += 1;
      continue;
    }
    // rgb()/hsl(): relative colour syntax carries the origin's alpha when the
    // alpha channel is omitted, so plain wrapping preserves translucency.
    if (fn[1].startsWith("hsl") || isChromaticLiteral(whole)) {
      out += `oklch(from ${whole} l calc(c * ${gain}) h)`;
      wrapped += 1;
    } else {
      out += whole;
    }
  }

  return { text: out, wrapped };
}

/** Index of the `)` matching the `(` at `open`. The input is trusted generated CSS. */
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

/**
 * Multiply the chroma component of an existing `oklch(from …)` expression.
 * `calc(c * 1.35)` becomes `calc((c * 1.35) * gain)` — parenthesised, so a
 * `calc(c + x)` form cannot silently change meaning under the multiplication.
 */
function scaleRelativeOklch(inner: string, gain: string): string {
  const afterFrom = inner.trim().replace(/^from\s+/, "");
  const parts = splitTopLevel(afterFrom);
  // parts: [origin, L, C, H] with an optional trailing "/ alpha" kept on H's tail.
  if (parts.length < 4) throw new Error(`Unrecognised relative oklch: oklch(${inner})`);
  const c = parts[2]!;
  const scaled = c.startsWith("calc(")
    ? `calc((${c.slice(5, -1)}) * ${gain})`
    : `calc(${c} * ${gain})`;
  return `oklch(from ${parts[0]} ${parts[1]} ${scaled} ${parts.slice(3).join(" ")})`;
}

/**
 * Multiply the chroma slot of a bare `oklch(L C H …)` literal in place, or
 * return null to leave achromatic literals untouched.
 */
function scaleBareOklch(whole: string, inner: string, gain: string): string | null {
  const parts = splitTopLevel(inner.trim());
  const chroma = Number(parts[1]);
  if (!Number.isFinite(chroma)) {
    // Unparseable chroma slot: wrap the whole literal instead of guessing.
    return `oklch(from ${whole} l calc(c * ${gain}) h)`;
  }
  if (chroma < ACHROMATIC_CHROMA) return null;
  return `oklch(${parts[0]} calc(${parts[1]} * ${gain}) ${parts.slice(2).join(" ")})`;
}

/** Split on top-level whitespace, keeping parenthesised groups whole. */
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

function surfaceBlockSelector(surfaceId: string, theme: string): string {
  const axis =
    surfaceId === BASE_SURFACE_ID ? ":not([data-surface])" : `[data-surface="${surfaceId}"]`;
  return `html[${CHROMA_ATTRIBUTE}]${axis}[data-theme="${theme}"]${NOT_PRO}`;
}

/**
 * The accent axis wears the same dark-chrome island the base accent sheet does:
 * a dark block also matches a `.theme-chrome-dark` subtree on a light page, so
 * the accented header re-saturates with the rest of the accent. The gain
 * property declared on `<html>` by the light block inherits into the island.
 */
function accentBlockSelectors(accentId: string, theme: string): string[] {
  const axis =
    accentId === BASE_ACCENT_ID ? ":not([data-accent])" : `[data-accent="${accentId}"]`;
  const own = `html[${CHROMA_ATTRIBUTE}]${axis}[data-theme="${theme}"]${NOT_PRO}`;
  if (theme !== "dark") return [own];
  return [
    own,
    `html[${CHROMA_ATTRIBUTE}]${axis}[data-theme="light"]${NOT_PRO} .${CHROME_DARK_CLASS}`,
  ];
}

/**
 * One accent's Pro block in one scheme. Shape and order follow the parent
 * axes: engage attribute, accent axis, scheme, then the style key. Four
 * attributes on `html` is (0,4,1) — one above both `pro-theme.css`'s palette
 * (which tops out at (0,3,1) for its dark seeds) and the accent sheet's Pro
 * blocks at (0,3,1), so the wrapped seeds win on specificity rather than on
 * where the bundler puts the `<link>`.
 *
 * No dark-chrome island, unlike {@link accentBlockSelectors}: Pro's charcoal
 * rails read `--ei-accent-on-dark`, which is scheme-independent by design and
 * wrapped at the same value in both halves, so whichever half matches the
 * root already re-saturates the rails by inheritance.
 */
function proAccentBlockSelector(accentId: string, theme: string): string {
  const axis =
    accentId === BASE_ACCENT_ID ? ":not([data-accent])" : `[data-accent="${accentId}"]`;
  return `html[${CHROMA_ATTRIBUTE}]${axis}[data-theme="${theme}"][data-visual-style="pro"]`;
}

function chromaBlock(
  selectors: readonly string[],
  tokens: SchemeTokens,
  gainProperty: string,
  levelProperty: string,
  authored: number,
): string {
  const declarations: string[] = [];
  for (const [token, value] of Object.entries(tokens)) {
    const { text, wrapped } = wrapChromaValue(value, gainProperty);
    if (wrapped > 0) declarations.push(`  ${token}: ${text};`);
  }
  if (declarations.length === 0) return "";
  const denominator = authored.toFixed(4);
  const gain = `  ${gainProperty}: calc(var(${levelProperty}, ${denominator}) / ${denominator});`;
  return `${selectors.join(",\n")} {\n${gain}\n${declarations.join("\n")}\n}\n`;
}

/**
 * Authored levels per colourway — the slider's resting position, its tick, and
 * the gain denominators. Surfaces differ per scheme (a pale light panel sits at
 * a different level than its dark sibling); an accent is one swatch for both.
 * Achromatic colourways are omitted: they have no level, and their blocks are
 * never emitted.
 */
export function buildChromaLevels(): {
  surfaces: Record<string, { dark: number; light: number }>;
  accents: Record<string, number>;
} {
  const surfaces: Record<string, { dark: number; light: number }> = {};
  for (const surface of SURFACES) {
    if (surface.achromatic) continue;
    surfaces[surface.id] = {
      dark: round4(authoredLevel(surface.tint.dark)),
      light: round4(authoredLevel(surface.tint.light)),
    };
  }
  const accents: Record<string, number> = {};
  for (const accent of ACCENTS) {
    if (accent.achromatic) continue;
    accents[accent.id] = round4(authoredLevel(accent.swatch));
  }
  return { surfaces, accents };
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

const HEADER = `/* GENERATED FILE — do not edit by hand.
   Source: src/theme/chromaStylesheet.ts
   Regenerate: npm run generate:chroma-css

   The saturation appearance axis. Loaded ONLY by the pre-paint bootstrap —
   never imported by the application bundle — on every page whose build leaves
   a colour axis unlocked: the bootstrap paints the reader's saved level or the
   site default. Every block requires html[${CHROMA_ATTRIBUTE}] and computes one gain,
   level ÷ authored-level, applied to the chroma of every chromatic literal in
   its colourway's tokens through relative colour syntax. Lightness and hue are
   never touched. An unset level falls back to the authored denominator, so a
   matched block with no level on its axis is inert.

   The harm-reduction ramp, dose tiers and plateau tiers are structurally
   absent: the Fun blocks' input token maps are filtered by paletteTokenRole,
   which routes every semantic family away from both appearance axes, and the
   Pro accent blocks re-seat only the nine --ei-* accent seeds. Fun blocks
   carry the same :where() Pro guard as the base sheets; the accent axis also
   emits Pro blocks, keyed [data-visual-style="pro"], whose gain denominator is
   the Pro ramp's own --ei-accent level per scheme. The surface axis emits no
   Pro half: Pro's one charcoal family is effectively achromatic. Graphite and
   Neutral are achromatic and emit nothing. */
`;

/** The whole stylesheet. Deterministic: declaration order of SURFACES/ACCENTS, dark before light. */
export function buildChromaStylesheetCss(): string {
  const blocks: string[] = [];

  // The surface axis is Fun-only, decided from the authored literals rather
  // than assumed: Pro ships one charcoal/paper family regardless of
  // data-surface (`src/styles/pro-theme.css`), and measured through
  // `chromaMath` its dark seeds (#131313…#212121, borders #3f3f3f/#808080)
  // are pure grey — C = 0 — while the light seeds carry only the deliberate
  // trace of warmth, C 0.003–0.012 straddling ACHROMATIC_CHROMA's 0.005 line
  // (paper #f6f5f1 C 0.0054, sunk #efeee9 C 0.0067, deep #e4e2db C 0.0097).
  // Ramping a whisper is Graphite's situation exactly, so Pro's surface is
  // treated as achromatic: no Pro surface block, and the panel keeps the
  // surface slider disabled on Pro.
  for (const surface of SURFACES) {
    if (surface.achromatic) continue;
    const tokens = (surfaceFunTokens as Record<string, ColourwayTokens>)[surface.id];
    if (!tokens) throw new Error(`No generated tokens for surface "${surface.id}"`);
    for (const theme of ["dark", "light"] as const) {
      blocks.push(
        chromaBlock(
          [surfaceBlockSelector(surface.id, theme)],
          tokens[theme],
          SURFACE_GAIN_PROPERTY,
          SURFACE_LEVEL_PROPERTY,
          authoredLevel(surface.tint[theme]),
        ),
      );
    }
  }

  for (const accent of ACCENTS) {
    if (accent.achromatic) continue;
    const tokens = (accentFunTokens as Record<string, ColourwayTokens>)[accent.id];
    if (!tokens) throw new Error(`No generated tokens for accent "${accent.id}"`);
    for (const theme of ["dark", "light"] as const) {
      blocks.push(
        chromaBlock(
          accentBlockSelectors(accent.id, theme),
          tokens[theme],
          ACCENT_GAIN_PROPERTY,
          ACCENT_LEVEL_PROPERTY,
          authoredLevel(accent.swatch),
        ),
      );
    }
    // The Pro half: the same accent, worn as the nine --ei-* seeds. The gain
    // denominator is the Pro ramp's own authored level — per scheme, because
    // the light and dark ramps sit at different levels — measured on the
    // representative seed shared with the slider rail (see
    // proAccentRepresentativeSeed), so an unset level leaves Pro inert too.
    for (const theme of ["dark", "light"] as const) {
      const seed = proAccentRepresentativeSeed(accent, theme);
      if (seed === null) continue;
      blocks.push(
        chromaBlock(
          [proAccentBlockSelector(accent.id, theme)],
          { ...accent.pro![theme] },
          ACCENT_GAIN_PROPERTY,
          ACCENT_LEVEL_PROPERTY,
          authoredLevel(seed),
        ),
      );
    }
  }

  return `${HEADER}\n${blocks.filter(Boolean).join("\n")}`;
}
