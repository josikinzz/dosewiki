import { CHROME_DARK_CLASS } from "@/theme/chromeDark";
import { BASE_ACCENT_ID, BASE_ACCENT_PRO_SEEDS, BASE_ACCENT_SWATCH } from "./accents";
import {
  ACCENT_HUE_PROPERTY,
  ACCENT_LEVEL_PROPERTY,
  CHROMA_ATTRIBUTE,
  SURFACE_HUE_PROPERTY,
  SURFACE_LEVEL_PROPERTY,
} from "./appearanceChroma";
import { BASE_SURFACE_ID, BASE_SURFACE_TINT } from "./surfaces";
import {
  ACHROMATIC_CHROMA,
  authoredLevel,
  isChromaticLiteral,
  proAccentRepresentativeSeed,
} from "./chromaMath";
import accentFunTokens from "./accentFunTokens.generated.json";
import surfaceFunTokens from "./surfaceFunTokens.generated.json";

/**
 * The saturation and hue appearance axes, compiled into plain CSS.
 *
 * The reader owns one *level* (0..1) and one *hue rotation* (0..359 degrees)
 * per colour axis: a colour at level t renders with chroma `t × Cmax(L,H)`
 * (see `chromaMath.ts`), rotated `<shift>` degrees around the hue wheel. This
 * module turns the two role-filtered base Fun token maps — Orchid surfaces and
 * the Default plum accent, the only authored colourways left — and, for the
 * accent axis, the base Pro `--ei-*` seeds, into blocks that apply that model
 * with pure CSS: every chromatic literal in a token's value is re-emitted
 * through relative colour syntax with its chroma multiplied by a per-block
 * *gain*,
 *
 *   --dw-surface-gain: calc(var(--dw-surface-level, <authored>) / <authored>);
 *
 * where `<authored>` is the base colourway's own representative level in that
 * scheme, and its hue slot rewritten to `calc(h + var(--dw-*-hue, 0deg))`.
 * Hue is periodic in CSS `oklch()`, so plain addition needs no wrap-around;
 * lightness is never touched on either axis. One shared gain and one shared
 * shift per block keep the palette's internal relationships (muted panel vs
 * vivid brand) intact while the whole palette rotates and re-saturates
 * together. Unset properties fall back to the authored denominator and 0deg,
 * so a matched block with nothing on its axis is inert.
 *
 * Every block requires `data-chroma` on the root. The pre-paint bootstrap sets
 * that attribute — and injects this stylesheet — on every page now: a reader
 * with no saved values gets the site defaults (`DEFAULT_*` in
 * `appearanceChroma.ts`), so only a publication that locks both colour axes
 * (Effect Index) ships none of this.
 *
 * Safety: the input maps are already filtered by `paletteTokenRole`, which
 * routes the harm-reduction ramp (success/caution/unsafe/danger/info), the
 * dose-tier and the plateau-tier families to "semantic" — none of them can
 * appear here, so no level or rotation can restyle a warning. The Pro accent
 * seeds are not role-filtered maps, but the nine `PRO_ACCENT_SEED_NAMES` are
 * all accent-family by construction (and `paletteTokenRole` classifies every
 * one of them "accent"), so the same invariant holds there.
 *
 * Pro's surface family emits no block — see the note in
 * `buildChromaStylesheetCss` — so the surface axes are Fun-only while the
 * accent axes work on both visual styles. The retired non-base colourways
 * emit nothing at all any more: their looks are (hue, level) points now, and
 * their stored ids migrate through `LEGACY_*_TO_HUE`.
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
 * `var(gainProperty)` and its hue rotated by `var(hueProperty, 0deg)`.
 * Achromatic literals (greys, black, white, shadow ink) pass through
 * untouched — a grey must not pick up colour under a rotation; a value with
 * nothing chromatic reports `wrapped: 0` and is dropped by the caller.
 * Handles the whole value grammar the generated maps use: bare hex / `rgb()`
 * / `oklch()`, and literals nested inside `color-mix()`, gradients, shadow
 * lists and existing `oklch(from …)` relative-colour expressions (whose
 * chroma and hue components are rewritten in place).
 */
export function wrapChromaValue(
  value: string,
  gainProperty: string,
  hueProperty: string,
): { text: string; wrapped: number } {
  if (!/#|rgba?\(|oklch\(|hsla?\(/.test(value)) return { text: value, wrapped: 0 };
  const gain = `var(${gainProperty})`;
  const shift = `var(${hueProperty}, 0deg)`;
  let out = "";
  let index = 0;
  let wrapped = 0;

  while (index < value.length) {
    const rest = value.slice(index);

    const hex = /^#[0-9a-fA-F]{3,8}\b/.exec(rest);
    if (hex) {
      if (isChromaticLiteral(hex[0])) {
        out += `oklch(from ${hex[0]} l calc(c * ${gain}) calc(h + ${shift}))`;
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
      out += scaleRelativeOklch(inner, gain, shift);
      wrapped += 1;
      continue;
    }
    if (fn[1] === "oklch") {
      const scaled = scaleBareOklch(whole, inner, gain, shift);
      out += scaled ?? whole;
      if (scaled) wrapped += 1;
      continue;
    }
    // rgb()/hsl(): relative colour syntax carries the origin's alpha when the
    // alpha channel is omitted, so plain wrapping preserves translucency.
    if (fn[1].startsWith("hsl") || isChromaticLiteral(whole)) {
      out += `oklch(from ${whole} l calc(c * ${gain}) calc(h + ${shift}))`;
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
 * Rewrite the chroma and hue components of an existing `oklch(from …)`
 * expression. `calc(c * 1.35)` becomes `calc((c * 1.35) * gain)` —
 * parenthesised, so a `calc(c + x)` form cannot silently change meaning under
 * the multiplication — and the hue component gains `+ shift` the same way.
 */
function scaleRelativeOklch(inner: string, gain: string, shift: string): string {
  const afterFrom = inner.trim().replace(/^from\s+/, "");
  const parts = splitTopLevel(afterFrom);
  // parts: [origin, L, C, H] with an optional trailing "/ alpha" in parts[4…].
  if (parts.length < 4) throw new Error(`Unrecognised relative oklch: oklch(${inner})`);
  const c = parts[2]!;
  const scaled = c.startsWith("calc(")
    ? `calc((${c.slice(5, -1)}) * ${gain})`
    : `calc(${c} * ${gain})`;
  const tail = parts.length > 4 ? ` ${parts.slice(4).join(" ")}` : "";
  return `oklch(from ${parts[0]} ${parts[1]} ${scaled} ${rotateHue(parts[3]!, shift)}${tail})`;
}

/**
 * Rotate one hue component by `shift`. A bare number means degrees in
 * `oklch()` but cannot meet an angle inside `calc()`, so it is given its unit;
 * an existing `calc()` is parenthesised whole, same reason as the chroma slot.
 */
function rotateHue(hue: string, shift: string): string {
  if (hue.startsWith("calc(")) return `calc((${hue.slice(5, -1)}) + ${shift})`;
  const withUnit = /^-?(\d+\.?\d*|\.\d+)$/.test(hue) ? `${hue}deg` : hue;
  return `calc(${withUnit} + ${shift})`;
}

/**
 * Rewrite the chroma and hue slots of a bare `oklch(L C H …)` literal in
 * place, or return null to leave achromatic literals untouched: a grey must
 * not pick up colour under a gain or a rotation.
 */
function scaleBareOklch(whole: string, inner: string, gain: string, shift: string): string | null {
  const parts = splitTopLevel(inner.trim());
  const chroma = Number(parts[1]);
  if (!Number.isFinite(chroma)) {
    // Unparseable chroma slot: wrap the whole literal instead of guessing.
    return `oklch(from ${whole} l calc(c * ${gain}) calc(h + ${shift}))`;
  }
  if (chroma < ACHROMATIC_CHROMA) return null;
  const tail = parts.length > 3 ? ` ${parts.slice(3).join(" ")}` : "";
  return `oklch(${parts[0]} calc(${parts[1]} * ${gain}) ${rotateHue(parts[2]!, shift)}${tail})`;
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

/**
 * The base selectors carry `:not([data-surface])`/`:not([data-accent])` even
 * though nothing writes those attributes any more: the base sheets key their
 * own blocks that way, and the extra (0,1,0) is what keeps these blocks'
 * specificity above the palettes they rewrite (see {@link proAccentBlockSelector}).
 */
function surfaceBlockSelector(theme: string): string {
  return `html[${CHROMA_ATTRIBUTE}]:not([data-surface])[data-theme="${theme}"]${NOT_PRO}`;
}

/**
 * The accent axis wears the same dark-chrome island the base accent sheet does:
 * a dark block also matches a `.theme-chrome-dark` subtree on a light page, so
 * the accented header re-saturates with the rest of the accent. The gain
 * property declared on `<html>` by the light block inherits into the island.
 */
function accentBlockSelectors(theme: string): string[] {
  const own = `html[${CHROMA_ATTRIBUTE}]:not([data-accent])[data-theme="${theme}"]${NOT_PRO}`;
  if (theme !== "dark") return [own];
  return [
    own,
    `html[${CHROMA_ATTRIBUTE}]:not([data-accent])[data-theme="light"]${NOT_PRO} .${CHROME_DARK_CLASS}`,
  ];
}

/**
 * The accent's Pro block in one scheme. Shape and order follow the parent
 * axes: engage attribute, accent axis, scheme, then the style key. Four
 * attribute-weight simple selectors on `html` is (0,4,1) — one above both
 * `pro-theme.css`'s palette (which tops out at (0,3,1) for its dark seeds)
 * and the accent sheet's Pro block at (0,3,1), so the wrapped seeds win on
 * specificity rather than on where the bundler puts the `<link>`.
 *
 * No dark-chrome island, unlike {@link accentBlockSelectors}: Pro's charcoal
 * rails read `--ei-accent-on-dark`, which is scheme-independent by design and
 * wrapped at the same value in both halves, so whichever half matches the
 * root already re-saturates the rails by inheritance.
 */
function proAccentBlockSelector(theme: string): string {
  return `html[${CHROMA_ATTRIBUTE}]:not([data-accent])[data-theme="${theme}"][data-visual-style="pro"]`;
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

/**
 * Authored levels of the base colourways — the sliders' resting positions,
 * their ticks, and the gain denominators. The surface differs per scheme (the
 * pale light panel sits at a different level than its dark sibling); the
 * accent is one swatch for both.
 */
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

const HEADER = `/* GENERATED FILE — do not edit by hand.
   Source: src/theme/chromaStylesheet.ts
   Regenerate: npm run generate:chroma-css

   The saturation and hue appearance axes. Loaded ONLY by the pre-paint
   bootstrap — never imported by the application bundle — on every page whose
   build leaves a colour axis unlocked: the bootstrap paints the reader's
   saved values or the site defaults. Every block requires html[${CHROMA_ATTRIBUTE}]
   and computes one gain, level ÷ authored-level, applied to the chroma of
   every chromatic literal in the base palette's tokens through relative
   colour syntax, while each literal's hue slot gains + var(--dw-*-hue, 0deg).
   Lightness is never touched, and hue is periodic in oklch() so plain
   addition needs no wrap-around. Unset properties fall back to the authored
   denominator and 0deg, so a matched block with nothing on its axis is inert.

   The harm-reduction ramp, dose tiers and plateau tiers are structurally
   absent: the Fun blocks' input token maps are filtered by paletteTokenRole,
   which routes every semantic family away from the appearance axes, and the
   Pro accent blocks re-seat only the nine --ei-* accent seeds. Fun blocks
   carry the same :where() Pro guard as the base sheets; the accent axes also
   emit Pro blocks, keyed [data-visual-style="pro"], whose gain denominator is
   the Pro ramp's own --ei-accent level per scheme. The surface axes emit no
   Pro half: Pro's one charcoal family is effectively achromatic. Only the
   base colourways exist now — every other look is a (hue, level) point. */
`;

/** The whole stylesheet. Deterministic: surface then accent then Pro, dark before light. */
export function buildChromaStylesheetCss(): string {
  const blocks: string[] = [];

  // The surface axes are Fun-only, decided from the authored literals rather
  // than assumed: Pro ships one charcoal/paper family regardless of surface
  // (`src/styles/pro-theme.css`), and measured through `chromaMath` its dark
  // seeds (#131313…#212121, borders #3f3f3f/#808080) are pure grey — C = 0 —
  // while the light seeds carry only the deliberate trace of warmth, C
  // 0.003–0.012 straddling ACHROMATIC_CHROMA's 0.005 line (paper #f6f5f1 C
  // 0.0054, sunk #efeee9 C 0.0067, deep #e4e2db C 0.0097). Ramping or
  // rotating a whisper would surface noise, so Pro's surface is treated as
  // achromatic: no Pro surface block, and the panel keeps both surface
  // sliders disabled on Pro.
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
  // The Pro half: the same accent axes, worn as the nine --ei-* seeds. The
  // gain denominator is the Pro ramp's own authored level — per scheme,
  // because the light and dark ramps sit at different levels — measured on
  // the representative seed shared with the slider rail (see
  // proAccentRepresentativeSeed), so an unset level leaves Pro inert too.
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

  return `${HEADER}\n${blocks.filter(Boolean).join("\n")}`;
}
