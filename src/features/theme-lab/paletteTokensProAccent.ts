import type { PaletteGroup, PaletteToken } from "./paletteTokens";

const color = (id: string, label: string, hint?: string): PaletteToken => ({
  id,
  label,
  kind: "color",
  hint,
});

export const PRO_ACCENT_GROUP: PaletteGroup = {
  id: "pro-accent",
  title: "Clinical accent seeds",
  blurb:
    "Clinical's --ei-* accent family: the half of an accent that src/theme/accents.ts carries per colour scheme. Only paints under the Clinical visual style. Paper (--ei-fade) sits in the same authored block but is not accent, so it is not here.",
  tokens: [
    color("--ei-accent", "Clinical accent: base", "The link colour on paper. Clinical budgets it at 7.4:1 on charcoal."),
    color("--ei-accent-strong", "Clinical accent: strong", "The emphatic step. Clinical budgets it at 9.2:1 on charcoal."),
    color("--ei-accent-soft", "Clinical accent: soft"),
    color("--ei-accent-muted", "Clinical accent: muted"),
    color(
      "--ei-accent-on-dark",
      "Clinical accent: on charcoal",
      "The step the charcoal header and footer rails wear. Authored once, in the day block, and read in both schemes, but an accent's blocks are per-scheme, so an accent states it in both halves at one value.",
    ),
    color("--ei-selection", "Clinical selection wash"),
    color("--ei-ring-soft", "Clinical ring: soft"),
    color("--ei-highlight", "Clinical search-hit fill"),
    color(
      "--ei-on-accent",
      "Clinical ink on accent",
      "Ink ON a filled accent, so it follows the fill's lightness rather than the accent's hue: white over a dark fill, near-black over a light one.",
    ),
  ],
};
