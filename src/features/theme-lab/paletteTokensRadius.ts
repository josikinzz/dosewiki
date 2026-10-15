import type { EssentialGroup, PaletteGroup, PaletteToken } from "./paletteTokens";

export interface LengthSpec {
  min: number;
  max: number;
  step: number;
  fallback: string;
}

const length = (id: string, label: string, hint?: string): PaletteToken => ({
  id,
  label,
  kind: "length",
  hint,
});

const SPECS: Record<string, LengthSpec> = {
  "--radius": { min: 0, max: 2, step: 0.0625, fallback: "0.375rem" },
  "--radius-xl": { min: 0, max: 2.5, step: 0.0625, fallback: "0.28125rem" },
  "--radius-2xl": { min: 0, max: 3, step: 0.0625, fallback: "0.375rem" },
  "--radius-3xl": { min: 0, max: 3.5, step: 0.0625, fallback: "0.5625rem" },
};

export const RADIUS_GROUP: PaletteGroup = {
  id: "radius",
  title: "Corner roundness",
  major: true,
  blurb:
    "How round the site's corners are, from fully rounded to sharp. Each slider is one step of the shared radius scale, so a single drag reshapes every card, button, panel and input that asks for that step. Pills and circles (avatars, dots, toggles) are fixed and never follow.",
  tokens: [
    length(
      "--radius",
      "Cards, buttons & fields",
      "The base step: cards, buttons, inputs, table rows, and catalog rows.",
    ),
    length("--radius-xl", "Panels & tiles", "Frosted panels, tiles, chips, and menus."),
    length("--radius-2xl", "Large panels", "Dialogs, sheets, and the widest content panels."),
    length("--radius-3xl", "Hero surfaces", "Article hero and the largest feature surfaces."),
  ],
};

export const RADIUS_TOKEN_IDS: readonly string[] = RADIUS_GROUP.tokens.map((token) => token.id);

export const RADIUS_ESSENTIALS: EssentialGroup = {
  id: "essentials-radius",
  title: "Corner roundness",
  blurb:
    "Drag these to make the whole site softer or sharper. Round pills and circular avatars stay round.",
  items: [
    {
      id: "--radius",
      label: "Corner roundness",
      hint: "The main knob: cards, buttons, inputs, and rows across every page.",
    },
    { id: "--radius-xl", label: "Panel corners", hint: "Frosted panels, tiles, chips, and menus." },
    { id: "--radius-2xl", label: "Large panel corners", hint: "Dialogs, sheets, and wide panels." },
    { id: "--radius-3xl", label: "Hero corners", hint: "Article hero and feature surfaces." },
  ],
};

export function getLengthSpec(id: string): LengthSpec | undefined {
  return SPECS[id];
}

export function parseRem(value: string): number | null {
  const match = /^\s*(-?\d*\.?\d+)\s*(rem|px|em)?\s*$/.exec(value);
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return null;
  if (match[2] === "px") return amount / 16;
  return amount;
}

export function formatRem(rem: number): string {
  const rounded = Math.round(rem * 10000) / 10000;
  return `${rounded}rem`;
}

export const PRO_STYLE_RADIUS: Record<string, string> = {
  "--radius": "0.1875rem",
  "--radius-xl": "0.25rem",
  "--radius-2xl": "0.25rem",
  "--radius-3xl": "0.25rem",
};
