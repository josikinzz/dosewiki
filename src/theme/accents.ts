export type AccentId = "default" | "blue" | "green" | "red" | "amber" | "neutral" | "teal";

export type ProAccentSeeds = Readonly<Record<string, string>>;

export const BASE_ACCENT_ID: AccentId = "default";

export const PRO_ACCENT_SEED_NAMES = {
  light: [
    "--ei-accent",
    "--ei-accent-strong",
    "--ei-accent-soft",
    "--ei-accent-muted",
    "--ei-accent-on-dark",
    "--ei-selection",
    "--ei-ring-soft",
    "--ei-highlight",
    "--ei-on-accent",
  ],
  dark: [
    "--ei-accent",
    "--ei-accent-strong",
    "--ei-accent-soft",
    "--ei-accent-muted",
    "--ei-accent-on-dark",
    "--ei-selection",
    "--ei-ring-soft",
    "--ei-highlight",
    "--ei-on-accent",
  ],
} as const;

export const BASE_ACCENT_SWATCH = "#f0abfc";

export const BASE_ACCENT_PRO_SEEDS: { readonly light: ProAccentSeeds; readonly dark: ProAccentSeeds } = {
  light: {
    "--ei-accent": "#8f618f",
    "--ei-accent-strong": "#684968",
    "--ei-accent-soft": "#a87ba9",
    "--ei-accent-muted": "#785178",
    "--ei-accent-on-dark": "#cfa0cf",
    "--ei-selection": "#e9d9e8",
    "--ei-ring-soft": "#d4b7d4",
    "--ei-highlight": "#e9dfe9",
    "--ei-on-accent": "#ffffff",
  },
  dark: {
    "--ei-accent": "#cfa1d0",
    "--ei-accent-strong": "#e0b7e0",
    "--ei-accent-soft": "#a67da7",
    "--ei-accent-muted": "#b589b5",
    "--ei-accent-on-dark": "#cfa0cf",
    "--ei-selection": "#534153",
    "--ei-ring-soft": "#926f92",
    "--ei-highlight": "#574557",
    "--ei-on-accent": "#1b1b1b",
  },
};

export function isAccent(value: string | null | undefined): value is AccentId {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(LEGACY_ACCENT_TO_HUE, value)
  );
}

export const LEGACY_ACCENT_TO_HUE: Record<AccentId, { hue: number; chroma?: 0 }> = {
  default: { hue: 0 },
  blue: { hue: 249 },
  green: { hue: 184 },
  red: { hue: 59 },
  amber: { hue: 79 },
  neutral: { hue: 0, chroma: 0 },
  teal: { hue: 221 },
};
