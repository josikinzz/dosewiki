export const REAGENT_RESULT_PALETTE = {
  white: "#ffffff",
  clear: "#ffffff",
  colorless: "#ffffff",
  gray: "#666666",
  grey: "#666666",
  black: "#111111",
  blue: "#0067ce",
  "light blue": "#41a7f8",
  "dark blue": "#020f69",
  green: "#3f8a1f",
  "light green": "#7aefa6",
  "dark green": "#204a1c",
  olive: "#204a1c",
  yellow: "#f0d41d",
  "pale yellow": "#ffffcc",
  gold: "#deb22e",
  amber: "#deb22e",
  orange: "#fd7322",
  "dark orange": "#c04d01",
  red: "#ff0000",
  "light red": "#ff6666",
  "dark red": "#8c113e",
  maroon: "#8c113e",
  pink: "#ff6fcf",
  "light pink": "#d59aca",
  purple: "#830c93",
  "light purple": "#8064a2",
  "dark purple": "#270d45",
  violet: "#50268d",
  brown: "#8e563a",
  "dark brown": "#51240b",
  tan: "#8e563a",
  cream: "#fde9d9",
  peach: "#fde9d9",
} as const;

export const REAGENT_RESULT_NEUTRAL_COLOR = "#4a4a4a";
export const REAGENT_RESULT_FALLBACK_COLOR = REAGENT_RESULT_PALETTE.gray;

type ReagentResultColorName = keyof typeof REAGENT_RESULT_PALETTE

const REAGENT_NO_REACTION_TERMS = ["no reaction", "no change"] as const;

export function parseReagentResultColors(description: string): string[] {
  const normalized = description.toLowerCase().trim();

  if (
    REAGENT_NO_REACTION_TERMS.some((term) => normalized.includes(term)) ||
    normalized === "none" ||
    normalized === "n/a"
  ) {
    return [REAGENT_RESULT_NEUTRAL_COLOR];
  }

  const parts = normalized
    .split(/[→>/,-]|(?:\s+to\s+)/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  const colors: string[] = [];

  for (const part of parts) {
    if (part in REAGENT_RESULT_PALETTE) {
      colors.push(REAGENT_RESULT_PALETTE[part as ReagentResultColorName]);
      continue;
    }

    for (const [colorName, hex] of Object.entries(REAGENT_RESULT_PALETTE)) {
      if (part.includes(colorName)) {
        colors.push(hex);
        break;
      }
    }
  }

  return colors.length > 0 ? colors : [REAGENT_RESULT_FALLBACK_COLOR];
}

export function buildReagentResultGradient(colors: string[]): string {
  if (colors.length === 1) return colors[0];
  return `linear-gradient(to right, ${colors.join(", ")})`;
}

export function buildReagentResultLabelGradient(colors: string[]): string {
  const mutedColors = colors.map((hex) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const gray = (r + g + b) / 3;
    const desatFactor = 0.5;
    const darkFactor = 0.4;

    const newR = Math.round(
      (r * (1 - desatFactor) + gray * desatFactor) * darkFactor,
    );
    const newG = Math.round(
      (g * (1 - desatFactor) + gray * desatFactor) * darkFactor,
    );
    const newB = Math.round(
      (b * (1 - desatFactor) + gray * desatFactor) * darkFactor,
    );

    return `rgb(${newR},${newG},${newB})`;
  });

  if (mutedColors.length === 1) return mutedColors[0];
  return `linear-gradient(to right, ${mutedColors.join(", ")})`;
}
