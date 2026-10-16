import type { EssentialGroup, PaletteGroup, PaletteToken } from "./paletteTokens";

export interface AngleSpec {
  fallback: number;
}

export const ANGLE_MAX = 360;

export const ANGLE_NUDGE = 15;

export const ANGLE_CAVEAT =
  "Re-hues every color the theme derives from this seed. A few hand-pinned colors (some gradient stops, the logo, avatars) are literals and will not follow, so expect a small number of stragglers to keep their old hue.";

const angle = (id: string, label: string, hint?: string): PaletteToken => ({
  id,
  label,
  kind: "angle",
  hint,
});

const SEEDS: { id: string; label: string; hint: string; fallback: number }[] = [
  {
    id: "--h-brand",
    label: "Brand",
    hint: "The signature fuchsia, and the busiest seed by far: accent text and links, card and panel rims, glows, the scrollbar, and the whole light-mode canvas and chrome.",
    fallback: 326,
  },
  {
    id: "--h-plum",
    label: "Surfaces",
    hint: "The dark canvas family: page gradient, frosted panels, fields, table rows, the header/footer rail, and the toggle pill.",
    fallback: 318,
  },
  {
    id: "--h-text",
    label: "Text & borders",
    hint: "The tint carried by the light-mode reading hierarchy, plus borders, dividers, and ambient shadows in both themes.",
    fallback: 316,
  },
  {
    id: "--h-violet",
    label: "Informational",
    hint: "Neutral info panels, active tabs, and inline reference controls.",
    fallback: 290,
  },
  {
    id: "--h-green",
    label: "Success & evidence",
    hint: "The safety ramp's success family. Keep it clearly apart from the brand hue.",
    fallback: 160,
  },
  {
    id: "--h-gold",
    label: "Caution",
    hint: "The caution family: callouts, badges, and the use-caution interaction card.",
    fallback: 68,
  },
  {
    id: "--h-orange",
    label: "Unsafe",
    hint: "The unsafe family: avoid badges and the avoid interaction card.",
    fallback: 48,
  },
  {
    id: "--h-rose",
    label: "Danger",
    hint: "The danger family: highest-risk cards, danger callouts and badges.",
    fallback: 14,
  },
  {
    id: "--h-blue",
    label: "Info",
    hint: "The neutral-information family used by info badges and callouts.",
    fallback: 260,
  },
  {
    id: "--h-yellow",
    label: "Code: booleans",
    hint: "Booleans and warning windows in the JSON / code viewer.",
    fallback: 82,
  },
  {
    id: "--h-cyan",
    label: "Code: numbers",
    hint: "Numeric values in the JSON / code viewer.",
    fallback: 232,
  },
];

const SPECS: Record<string, AngleSpec> = Object.fromEntries(
  SEEDS.map((seed) => [seed.id, { fallback: seed.fallback }] as const),
);

export const HUE_GROUP: PaletteGroup = {
  id: "hues",
  title: "Hue seeds",
  major: true,
  blurb:
    "The angles the palette is derived from. Nudging one turns every color the theme builds from it; the brand seed alone drives roughly eighty declarations. A few hand-pinned colors are literals and keep their own hue.",
  tokens: SEEDS.map((seed) => angle(seed.id, seed.label, seed.hint)),
};

export const HUE_TOKEN_IDS: readonly string[] = HUE_GROUP.tokens.map((token) => token.id);

export const HUE_ESSENTIALS: EssentialGroup = {
  id: "essentials-hues",
  title: "Whole-theme hue",
  blurb:
    "Spin the whole site to another color. These three are what every shipped palette re-seats to become itself; a few hand-pinned colors stay where they are.",
  items: [
    {
      id: "--h-brand",
      label: "Brand hue",
      hint: "Turns the signature pink (links, rims, glows, the scrollbar, and the light-mode page) to any other color.",
    },
    {
      id: "--h-plum",
      label: "Surface hue",
      hint: "Turns the dark canvas: page gradient, panels, fields, and the header rail.",
    },
    {
      id: "--h-text",
      label: "Text hue",
      hint: "Turns the tint in text, borders, dividers, and soft shadows.",
    },
  ],
};

export function getAngleSpec(id: string): AngleSpec | undefined {
  return SPECS[id];
}

export function normalizeAngle(degrees: number): number {
  if (!Number.isFinite(degrees)) return 0;
  return ((degrees % ANGLE_MAX) + ANGLE_MAX) % ANGLE_MAX;
}

export function parseAngle(value: string): number | null {
  const match = /^\s*(-?\d*\.?\d+)\s*(deg)?\s*$/.exec(value);
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return null;
  return normalizeAngle(amount);
}

export function formatAngle(degrees: number): string {
  return String(Math.round(normalizeAngle(degrees) * 10) / 10);
}

export function angleValue(id: string, value: string): number {
  return parseAngle(value) ?? getAngleSpec(id)?.fallback ?? 0;
}

export function hueSwatchColor(degrees: number, lightness = 68, chroma = 0.18): string {
  return `oklch(${lightness}% ${chroma} ${formatAngle(degrees)})`;
}
