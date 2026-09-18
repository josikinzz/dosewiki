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
 * scheme, and its hue slot rewritten to `calc(h + var(--dw-*-hue, 0))` — the
 * shift is a bare number because `h` resolves to a `<number>` in `calc()` and
 * numbers cannot meet an `<angle>`.
 * Hue is periodic in CSS `oklch()`, so plain addition needs no wrap-around;
 * lightness is never touched on either axis. One shared gain and one shared
 * shift per block keep the palette's internal relationships (muted panel vs
 * vivid brand) intact while the whole palette rotates and re-saturates
 * together. Unset properties fall back to the authored denominator and 0,
 * so a matched block with nothing on its axis is inert.
 *
 * Every block requires `data-chroma` on the root. The pre-paint bootstrap sets
 * that attribute — and injects this stylesheet — on every page now: a reader
 * with no saved values gets the site defaults (`DEFAULT_*` in
 * `appearanceChroma.ts`), so only a publication that locks both colour axes
 * (Effect Index) ships none of this.
 *
 * The whole sheet sits inside `@supports (color: <CHROMA_SUPPORT_PROBE>)`.
 * Safari 16.4 to 17.x implements an older relative-colour draft in which `h`
 * is an `<angle>`, so `calc(h + 352)` is a type mismatch and every rewritten
 * token would be invalid at computed-value time; Safari 16.3 and older has no
 * relative colour syntax at all. Inside the guard nothing changes for a
 * current browser; outside it the sheet is empty and the base sheets' own
 * values paint. The runtime writers probe the same expression, so such a
 * browser never even engages the attribute.
 *
 * Safety: the input maps are already filtered by `paletteTokenRole`, which
 * routes the harm-reduction ramp (success/caution/unsafe/danger/info), the
 * dose-tier and the plateau-tier families to "semantic" — none of them can
 * appear here, so no level or rotation can restyle a warning. The Pro accent
 * seeds are not role-filtered maps, but the nine `PRO_ACCENT_SEED_NAMES` are
 * all accent-family by construction (and `paletteTokenRole` classifies every
 * one of them "accent"), so the same invariant holds there.
 *
 * Pro's surface family emits *additive* blocks rather than gained ones — see
 * the note in `buildChromaStylesheetCss`: the authored charcoal is
 * (near-)achromatic, so `level ÷ authored` has no denominator, and each seed's
 * chroma slot instead gains `+ K × var(--dw-surface-level, 0)` (per-scheme K,
 * see `PRO_SURFACE_CHROMA_DELTA`) while its hue takes the standard shift. Both
 * colour axes therefore work on both visual styles. The retired non-base
 * colourways emit nothing at all any more: their looks are (hue, level) points
 * now, and their stored ids migrate through `LEGACY_*_TO_HUE`.
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
 * One block's chroma arithmetic. The gained (Fun and Pro-accent) blocks scale:
 * a chroma slot becomes `calc(<c> * var(gain))` and achromatic literals pass
 * through untouched — a grey must not pick up colour under a scale. The Pro
 * surface blocks add: a chroma slot becomes `calc(<c> + K * var(level, 0))`
 * and achromatic literals are wrapped too, because giving the authored
 * charcoal a tint is the whole point of the additive form.
 */
type ChromaArithmetic = {
  /** Rewrite one chroma expression — already parenthesised when it was a calc() body. */
  readonly chroma: (expression: string) => string;
  /** The hue shift, a bare number of degrees (`h` is a `<number>` inside `calc()`). */
  readonly shift: string;
  readonly wrapsAchromatic: boolean;
};

/**
 * Rewrite one token value so every chromatic literal's chroma is multiplied by
 * `var(gainProperty)` and its hue rotated by `var(hueProperty, 0)` (a bare
 * number of degrees — `h` is a `<number>` inside `calc()`).
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
  const gain = `var(${gainProperty})`;
  return rewriteChromaValue(value, {
    chroma: (expression) => `calc(${expression} * ${gain})`,
    shift: `var(${hueProperty}, 0)`,
    wrapsAchromatic: false,
  });
}

/**
 * Rewrite one token value so every colour literal's chroma — achromatic ones
 * included — gains `+ deltaExpression` and its hue rotates by
 * `var(hueProperty, 0)`, over the same value grammar as {@link wrapChromaValue}.
 * `deltaExpression` is a calc() term like `0.0500 * var(--dw-surface-level, 0)`,
 * so an unset or zero level resolves every literal to its authored value.
 */
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
    // rgb()/hsl(): relative colour syntax carries the origin's alpha when the
    // alpha channel is omitted, so plain wrapping preserves translucency.
    if (fn[1].startsWith("hsl") || arithmetic.wrapsAchromatic || isChromaticLiteral(whole)) {
      out += `oklch(from ${whole} l ${arithmetic.chroma("c")} calc(h + ${shift}))`;
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
 * expression. Under a gain, `calc(c * 1.35)` becomes `calc((c * 1.35) * gain)`
 * — parenthesised, so a `calc(c + x)` form cannot silently change meaning
 * under the multiplication — and the hue component gains `+ shift` the same
 * way. The additive arithmetic parenthesises identically.
 */
function scaleRelativeOklch(inner: string, arithmetic: ChromaArithmetic): string {
  const afterFrom = inner.trim().replace(/^from\s+/, "");
  const parts = splitTopLevel(afterFrom);
  // parts: [origin, L, C, H] with an optional trailing "/ alpha" in parts[4…].
  if (parts.length < 4) throw new Error(`Unrecognised relative oklch: oklch(${inner})`);
  const c = parts[2]!;
  const scaled = c.startsWith("calc(") ? arithmetic.chroma(`(${c.slice(5, -1)})`) : arithmetic.chroma(c);
  const tail = parts.length > 4 ? ` ${parts.slice(4).join(" ")}` : "";
  return `oklch(from ${parts[0]} ${parts[1]} ${scaled} ${rotateHue(parts[3]!, arithmetic.shift)}${tail})`;
}

/**
 * Rotate one hue component by `shift`. In `calc()` the relative-colour `h`
 * channel and a bare oklch hue both resolve to plain numbers (degrees), and a
 * number cannot meet an `<angle>` — `calc(310 + 40deg)` is invalid and the
 * whole declaration falls to transparent. So the shift variable holds a bare
 * number and any authored `NNdeg` literal is stripped to its number; an
 * existing `calc()` is parenthesised whole, same reason as the chroma slot.
 */
function rotateHue(hue: string, shift: string): string {
  if (hue.startsWith("calc(")) return `calc((${hue.slice(5, -1)}) + ${shift})`;
  const unitless = /^(-?(?:\d+\.?\d*|\.\d+))deg$/.exec(hue)?.[1] ?? hue;
  return `calc(${unitless} + ${shift})`;
}

/**
 * Rewrite the chroma and hue slots of a bare `oklch(L C H …)` literal in
 * place. Under a gain, achromatic literals return null and stay untouched — a
 * grey must not pick up colour under a scale or a rotation; the additive
 * arithmetic wraps them, that being its purpose.
 */
function scaleBareOklch(
  whole: string,
  inner: string,
  arithmetic: ChromaArithmetic,
): string | null {
  const parts = splitTopLevel(inner.trim());
  const chroma = Number(parts[1]);
  if (!Number.isFinite(chroma)) {
    // Unparseable chroma slot: wrap the whole literal instead of guessing.
    return `oklch(from ${whole} l ${arithmetic.chroma("c")} calc(h + ${arithmetic.shift}))`;
  }
  if (chroma < ACHROMATIC_CHROMA && !arithmetic.wrapsAchromatic) return null;
  const tail = parts.length > 3 ? ` ${parts.slice(3).join(" ")}` : "";
  return `oklch(${parts[0]} ${arithmetic.chroma(parts[1]!)} ${rotateHue(parts[2]!, arithmetic.shift)}${tail})`;
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

/**
 * The surface's Pro block in one scheme. Same shape and the same (0,4,1) as
 * {@link proAccentBlockSelector} — keyed on the retired surface attribute's
 * absence, one above `pro-theme.css`'s palette blocks, so the wrapped seeds
 * win on specificity rather than on where the bundler puts the `<link>`. The
 * chrome rails are structurally absent from the seed map (see
 * `BASE_SURFACE_PRO_SEEDS`), so no dark-chrome island is needed here either.
 */
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

/**
 * Per-scheme chroma added to every Pro surface seed at saturation level 1 —
 * the additive counterpart of the Fun blocks' gain. Pro's authored surfaces
 * are (near-)achromatic, so the gain grammar `level ÷ authored` has no
 * denominator to divide by; the Pro surface blocks *add* chroma instead,
 * `calc(c + K * var(--dw-surface-level, 0))`, which makes the unset state —
 * and Pro's own default level 0 — resolve the authored charcoal exactly.
 *
 * K, tuned through `chromaMath`'s `toOklch`/`maxChroma` against the authored
 * seeds:
 *
 * - **dark 0.05**: at level 1 the dark family (L 0.13–0.25) reaches C 0.05 —
 *   inside the sRGB ceiling around the plum default (Cmax 0.065–0.117 at hue
 *   326) and about 70% of Fun's authored dark panel chroma (#1f0527,
 *   C 0.072): clearly tinted, still Pro-restrained. Cooler hues hold less
 *   (Cmax 0.024–0.043 at hue 200) and gamut-map down gracefully.
 * - **light 0.06**: the light family (L 0.89–1.0) holds far less chroma
 *   (paper #f6f5f1 Cmax 0.027 at hue 326), so 0.06 pins level 1 at each
 *   seed's own gamut ceiling — the most tint that lightness can carry, on par
 *   with Fun's authored light tint (#f6e6f4, C 0.025) — while small levels
 *   stay a paper-warmth-scale cast (level 0.15 adds 0.009). The pure-white
 *   raised step has no headroom at L 1.0 and correctly stays white.
 *
 * Lightness never moves, so no contrast figure recorded in `pro-theme.css`
 * shifts materially — and the WCAG-floored ink ramps and control outline are
 * excluded from the seed map entirely.
 */
export const PRO_SURFACE_CHROMA_DELTA = { dark: 0.05, light: 0.06 } as const;

/**
 * A Pro surface block: no block-local gain property — the level variable is
 * read inline in every chroma slot — and every seed wraps, achromatic or not,
 * since the additive form exists to give charcoal a tint. A seed that stopped
 * holding a colour literal would silently drop off the axis, so that throws.
 */
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
   colour syntax, while each literal's hue slot gains + var(--dw-*-hue, 0) —
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
   scheme; the Pro surface family is authored (near-)achromatic — no level to
   divide by — so its blocks ADD chroma, calc(c + K * var(--dw-surface-level, 0)),
   and an unset level or Pro's own default level 0 resolves the authored
   charcoal exactly. Only the base colourways exist now — every other look is
   a (hue, level) point. */
`;

/**
 * The guard every block sits inside. Blocks are not indented under it: their
 * selectors stay at column 0, which the structural tests key on.
 */
const SUPPORTS_OPEN = `@supports (color: ${CHROMA_SUPPORT_PROBE}) {\n`;

/** The whole stylesheet. Deterministic: each axis Fun then Pro, dark before light. */
export function buildChromaStylesheetCss(): string {
  const blocks: string[] = [];

  // The Fun half of the surface axes: the one authored Orchid family, scaled
  // and rotated through the shared gain grammar.
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

  // The Pro half of the surface axes: additive rather than gained, because
  // the authored family is (near-)achromatic — measured through `chromaMath`,
  // the dark seeds (#131313…#212121, border #3f3f3f) are pure grey (C = 0)
  // and the light seeds carry only a deliberate trace of warmth (C
  // 0.003–0.010 straddling ACHROMATIC_CHROMA's 0.005 line), so `level ÷
  // authored` has no denominator. Each seed's chroma slot gains
  // + K × var(--dw-surface-level, 0) (see PRO_SURFACE_CHROMA_DELTA) and its
  // hue the standard shift, so level 0 — Pro's own site default — and the
  // unset state both resolve the authored charcoal byte-visually unchanged.
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

  return `${HEADER}\n${SUPPORTS_OPEN}${blocks.filter(Boolean).join("\n")}}\n`;
}
