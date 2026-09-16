import { ELEVATION_GROUP } from "./paletteTokensElevation";
import { RADIUS_TOKEN_IDS, formatRem, parseRem } from "./paletteTokensRadius";

/**
 * The flatness axes: bulk controls over token families that already exist.
 *
 * Depth, glow, and corners are not new state — they are conveniences that write
 * ordinary per-token overrides (the same `--theme-elevation-*`, halo/glow, and
 * `--radius*` tokens the catalog edits one at a time), so they persist, export,
 * and restore pre-paint through the machinery those tokens already ride.
 * Each step's values are derived from the *active look's own baselines* at
 * apply time, which is what keeps "Soft" meaning "this look's shadows, faded"
 * rather than some hardcoded look.
 *
 * Blur is the one axis that cannot be a token substitution: ~50 call sites
 * hardcode `backdrop-blur` utilities, and the Effect Index skin proves a single
 * document-level rule is the honest kill switch. It still rides the edit maps —
 * as the `--theme-backdrop-blur` token — but the appliers (runtime + bootstrap)
 * translate its `off` value into `html[data-blur="off"]`, which the global rule
 * in site-colors.css keys on.
 */


/** Every elevation token except the deliberate `none` sentinel. */
export const DEPTH_TOKEN_IDS = ELEVATION_GROUP.tokens
  .map((token) => token.id)
  .filter((id) => id !== "--theme-elevation-none");

/** The ambient glow family: page halos plus the homepage washes. */
export const GLOW_TOKEN_IDS = [
  "--theme-page-halo-top",
  "--theme-page-halo-left",
  "--theme-page-halo-right",
  "--theme-home-glow-top",
  "--theme-home-glow-bottom",
];

export interface FlatnessStep {
  id: string;
  label: string;
  /** null = the baseline itself (apply removes the overrides). 0 = fully flat. */
  factor: number | null;
}

export const DEPTH_STEPS: FlatnessStep[] = [
  { id: "default", label: "Default", factor: null },
  { id: "soft", label: "Soft", factor: 0.5 },
  { id: "flat", label: "Flat", factor: 0 },
];

export const GLOW_STEPS: FlatnessStep[] = [
  { id: "full", label: "Full", factor: null },
  { id: "faint", label: "Faint", factor: 0.4 },
  { id: "off", label: "Off", factor: 0 },
];

/** The four radius-scale tokens the compiled `rounded-*` utilities read. */
export const CORNER_TOKEN_IDS: string[] = [...RADIUS_TOKEN_IDS];

/**
 * Corner steps are baseline-relative like the other axes: "Sharp" is 0.375× the
 * active theme's own radii and "Square" is hard zero. The stock scale now ships
 * sharp (base.css authors the values the old round scale's "Sharp" step
 * produced), so on stock, "Sharp" cuts sharper still — the same honest
 * relativity "Soft" has for shadows.
 */
export const CORNER_STEPS: FlatnessStep[] = [
  { id: "default", label: "Default", factor: null },
  { id: "sharp", label: "Sharp", factor: 0.375 },
  { id: "square", label: "Square", factor: 0 },
];

const FLAT_SHADOW = "0 0 #0000";

function scaleNumber(raw: string, factor: number): string {
  const isPercent = raw.endsWith("%");
  const value = parseFloat(raw);
  if (Number.isNaN(value)) return raw;
  const scaled = value * factor;
  const rounded = Math.round(scaled * 1000) / 1000;
  return isPercent ? `${rounded}%` : `${rounded}`;
}

/**
 * Fade every color inside a token value by `factor`, across the alpha spellings
 * the theme actually uses (baselines arrive var()-substituted from computed
 * style, so the formats are uniform):
 *
 * - modern slash alpha:   `rgb(2 6 23 / 0.5)`, `oklch(46% 0.12 300 / 0.06)`
 * - legacy comma alpha:   `rgba(126, 34, 206, 0.13)`
 * - color-mix to transparent: `color-mix(in srgb, X 60%, transparent)`
 * - a bare opaque color used as a shadow color: wrapped in a color-mix fade
 */
export function fadeColorsIn(value: string, factor: number): string {
  let result = value;

  // Slash alphas inside any color function.
  result = result.replace(
    /(\/\s*)([0-9.]+%?)(\s*\))/g,
    (_, before: string, alpha: string, after: string) =>
      `${before}${scaleNumber(alpha, factor)}${after}`,
  );

  // Legacy rgba()/hsla() comma alphas.
  result = result.replace(
    /((?:rgba|hsla)\([^()]+,\s*)([0-9.]+)(\s*\))/g,
    (_, before: string, alpha: string, after: string) =>
      `${before}${scaleNumber(alpha, factor)}${after}`,
  );

  // color-mix percentages mixed toward transparent.
  result = result.replace(
    /(color-mix\(in srgb,\s*[^,]+?\s)([0-9.]+)(%\s*,\s*transparent\))/g,
    (_, before: string, pct: string, after: string) =>
      `${before}${scaleNumber(pct, factor)}${after}`,
  );

  return result;
}

/** Does this value carry any alpha spelling `fadeColorsIn` can scale? */
function hasScalableAlpha(value: string): boolean {
  return fadeColorsIn(value, 0.5) !== value;
}

/**
 * The overrides one depth step writes: every elevation token faded toward
 * flat. A value whose color has no alpha spelling (e.g. a bare
 * `rgb(2 6 23)` substituted from a color token) is wrapped in a
 * color-mix fade instead, and `factor === 0` short-circuits to no-elevation.
 */
export function depthOverrides(
  baseline: (id: string) => string,
  factor: number,
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const id of DEPTH_TOKEN_IDS) {
    const value = baseline(id).trim();
    if (!value) continue;
    if (factor === 0) {
      map[id] = FLAT_SHADOW;
    } else if (hasScalableAlpha(value)) {
      map[id] = fadeColorsIn(value, factor);
    } else {
      // Bare opaque color(s): fade each color function occurrence wholesale.
      map[id] = value.replace(
        /((?:rgb|hsl|oklch|oklab|lab|color)\((?:[^()]|\([^()]*\))*\))/g,
        (color) => `color-mix(in srgb, ${color} ${Math.round(factor * 100)}%, transparent)`,
      );
    }
  }
  return map;
}

/** The overrides one glow step writes: ambient washes faded, or `transparent`. */
export function glowOverrides(
  baseline: (id: string) => string,
  factor: number,
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const id of GLOW_TOKEN_IDS) {
    const value = baseline(id).trim();
    if (!value) continue;
    map[id] = factor === 0 ? "transparent" : fadeColorsIn(value, factor);
  }
  return map;
}

/** The overrides one corner step writes: the radius scale, uniformly shrunk.
 *  A baseline the slider spec cannot parse (a `calc()`, a percentage) is left
 *  alone rather than guessed at. */
export function cornerOverrides(
  baseline: (id: string) => string,
  factor: number,
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const id of CORNER_TOKEN_IDS) {
    const rem = parseRem(baseline(id).trim());
    if (rem === null) continue;
    map[id] = formatRem(rem * factor);
  }
  return map;
}

/**
 * Which step the current values correspond to: the step whose computed writes
 * match exactly, `null` when the visitor's own per-token edits are in charge.
 *
 * A token with no override still matches a step when that step's computed write
 * equals the baseline (the write path's delete-on-equal rule stores nothing for
 * it) or when the step cannot write it at all (an unparseable corner baseline).
 * Without this, a look that ships some tokens already flat — light mode's
 * `0 0 #0000` avatar elevations, Pro's flat controls and transparent halos —
 * makes every non-default step undetectable, so the chips never highlight what
 * was just tapped.
 */
export function detectStep(
  steps: FlatnessStep[],
  ids: string[],
  overrides: (id: string) => string | undefined,
  baseline: (id: string) => string,
  compute: (baseline: (id: string) => string, factor: number) => Record<string, string>,
): string | null {
  const withIds = ids.filter((id) => baseline(id).trim() !== "");
  for (const step of steps) {
    if (step.factor === null) {
      if (withIds.every((id) => overrides(id) === undefined)) return step.id;
      continue;
    }
    const expected = compute(baseline, step.factor);
    const matches = withIds.every((id) => {
      const want = expected[id]?.trim();
      const have = overrides(id)?.trim();
      if (have !== undefined) return have === want;
      return want === undefined || want === baseline(id).trim();
    });
    if (matches) return step.id;
  }
  return null;
}

