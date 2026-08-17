import type { EssentialGroup, PaletteGroup, PaletteToken } from "./paletteTokens";

/**
 * The corner-radius group of the Theme Lab registry — the first *length* tokens
 * the lab manages, kept beside the main registry so `paletteTokens.ts` stays
 * under its cleanup budget.
 *
 * Why this is a registry addition and not a styling refactor: Tailwind compiles
 * every non-pill `rounded-*` utility down to `border-radius: var(--radius…)`, so
 * the geometry of ~90% of the site's corners is already a handful of custom
 * properties. Re-seating them is exactly what the Pro skin does to square the
 * site off, which is the proof the mechanism works (see
 * `PRO_STYLE_RADIUS` below).
 *
 * Only the four variables the compiled utilities actually reference are exposed:
 *
 *   --radius      → rounded-lg / -md / -sm (cards, buttons, inputs, rows)
 *   --radius-xl   → rounded-xl (panels, tiles, chips)
 *   --radius-2xl  → rounded-2xl (large panels, dialogs)
 *   --radius-3xl  → rounded-3xl (hero surfaces)
 *
 * Deliberately absent:
 *
 * - `rounded-full` / `rounded-[9999px]` pills and circles. They compile to a
 *   literal, not a variable, so avatars, dots, toggles and pill chips stay
 *   circular at every setting — the sweep cannot reach them, by design.
 * - `--radius-sm` / `--radius-md` / `--radius-xs` / `--radius-4xl`. The project's
 *   Tailwind config re-points `rounded-sm/-md` at `calc(var(--radius) - …)`, and
 *   nothing uses the other two, so a slider for them would move nothing.
 * - The ~18 arbitrary-value call sites (`rounded-[2rem]`, `rounded-[0.12rem]`,
 *   bare `rounded`). They are hardcoded lengths; migrating them onto the scale is
 *   follow-up work, not part of this control.
 *
 * The type import is deliberately type-only: `paletteTokens.ts` imports this
 * module at runtime, so a value import back would close a cycle.
 *
 * Two surfaces edit these tokens: the per-token sliders here (Essentials and
 * Sections views) and the gallery's one-tap "Corners" axis row
 * (`flatnessAxes.ts`), which scales the whole group at once.
 */

/** What the slider for a length token needs to know, in `rem`. */
export interface LengthSpec {
  min: number;
  max: number;
  step: number;
  /**
   * The authored value, used when the browser cannot report a computed one
   * (jsdom, or a token the stylesheet has not emitted yet). Never written to
   * storage on its own — only a value the visitor actually chose is an edit.
   */
  fallback: string;
}

const length = (id: string, label: string, hint?: string): PaletteToken => ({
  id,
  label,
  kind: "length",
  hint,
});

/**
 * Ranges are per-token rather than shared: `--radius` bottoms out at 0 (fully
 * sharp) and tops out at 2rem, past which cards read as lozenges; the larger
 * steps get proportionally more headroom so the scale keeps its ordering when
 * dragged to the top.
 */
const SPECS: Record<string, LengthSpec> = {
  // Fallbacks mirror the authored stock scale in base.css, which ships sharp.
  "--radius": { min: 0, max: 2, step: 0.0625, fallback: "0.375rem" },
  "--radius-xl": { min: 0, max: 2.5, step: 0.0625, fallback: "0.28125rem" },
  "--radius-2xl": { min: 0, max: 3, step: 0.0625, fallback: "0.375rem" },
  "--radius-3xl": { min: 0, max: 3.5, step: 0.0625, fallback: "0.5625rem" },
};

export const RADIUS_GROUP: PaletteGroup = {
  id: "radius",
  title: "Corner roundness",
  // Expanded on open: shape is the first non-color axis the lab offers, and a
  // collapsed row of sliders reads as one more color group.
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

/** Ids in this group, in registry order. */
export const RADIUS_TOKEN_IDS: readonly string[] = RADIUS_GROUP.tokens.map((token) => token.id);

/** The plain-language entry point: the same four sliders, in the Essentials view. */
export const RADIUS_ESSENTIALS: EssentialGroup = {
  id: "essentials-radius",
  title: "Corner roundness",
  blurb:
    "Drag these to make the whole site softer or sharper. Round pills and circular avatars stay round.",
  items: [
    {
      id: "--radius",
      label: "Corner roundness",
      hint: "The main knob — cards, buttons, inputs, and rows across every page.",
    },
    { id: "--radius-xl", label: "Panel corners", hint: "Frosted panels, tiles, chips, and menus." },
    { id: "--radius-2xl", label: "Large panel corners", hint: "Dialogs, sheets, and wide panels." },
    { id: "--radius-3xl", label: "Hero corners", hint: "Article hero and feature surfaces." },
  ],
};

/** The slider bounds for a length token, or undefined when it is not one. */
export function getLengthSpec(id: string): LengthSpec | undefined {
  return SPECS[id];
}

/**
 * Read a CSS length as a number of `rem`. Only the units the radius scale can
 * actually be authored in are understood; anything else (a `calc()`, a
 * percentage, an empty computed value) returns null and the caller falls back to
 * the token's authored default rather than guessing.
 */
export function parseRem(value: string): number | null {
  const match = /^\s*(-?\d*\.?\d+)\s*(rem|px|em)?\s*$/.exec(value);
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return null;
  if (match[2] === "px") return amount / 16;
  return amount;
}

/** Write a slider position back as CSS, trimming the float noise `rem` invites. */
export function formatRem(rem: number): string {
  const rounded = Math.round(rem * 10000) / 10000;
  return `${rounded}rem`;
}

/**
 * The Pro skin's flattened geometry, restated as radius-token values.
 *
 * That skin squares the site off by redefining the `rounded-*` utilities under
 * its own attribute; the same look comes out of these four tokens with no
 * component or stylesheet touched, which is the self-check that this control is
 * wired to the real mechanism. Test-facing only — the Pro stylesheet is
 * untouched by the lab, which writes a user layer over it and never edits the
 * file.
 */
export const PRO_STYLE_RADIUS: Record<string, string> = {
  "--radius": "0.1875rem",
  "--radius-xl": "0.25rem",
  "--radius-2xl": "0.25rem",
  "--radius-3xl": "0.25rem",
};
