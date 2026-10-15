import { ELEVATION_GROUP } from "./paletteTokensElevation";
import { RADIUS_TOKEN_IDS, formatRem, parseRem } from "./paletteTokensRadius";

export const DEPTH_TOKEN_IDS = ELEVATION_GROUP.tokens
  .map((token) => token.id)
  .filter((id) => id !== "--theme-elevation-none");

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

export const CORNER_TOKEN_IDS: string[] = [...RADIUS_TOKEN_IDS];

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

export function fadeColorsIn(value: string, factor: number): string {
  let result = value;

  result = result.replace(
    /(\/\s*)([0-9.]+%?)(\s*\))/g,
    (_, before: string, alpha: string, after: string) =>
      `${before}${scaleNumber(alpha, factor)}${after}`,
  );

  result = result.replace(
    /((?:rgba|hsla)\([^()]+,\s*)([0-9.]+)(\s*\))/g,
    (_, before: string, alpha: string, after: string) =>
      `${before}${scaleNumber(alpha, factor)}${after}`,
  );

  result = result.replace(
    /(color-mix\(in srgb,\s*[^,]+?\s)([0-9.]+)(%\s*,\s*transparent\))/g,
    (_, before: string, pct: string, after: string) =>
      `${before}${scaleNumber(pct, factor)}${after}`,
  );

  return result;
}

function hasScalableAlpha(value: string): boolean {
  return fadeColorsIn(value, 0.5) !== value;
}

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
      map[id] = value.replace(
        /((?:rgb|hsl|oklch|oklab|lab|color)\((?:[^()]|\([^()]*\))*\))/g,
        (color) => `color-mix(in srgb, ${color} ${Math.round(factor * 100)}%, transparent)`,
      );
    }
  }
  return map;
}

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

