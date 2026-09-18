import type { VisualStyle } from "@/theme";
import { isVisualStyle } from "@/theme/visualStyle";

/**
 * The appearance the Theme Lab's edits belong to.
 *
 * A token edit is a statement about one rendering base: `--theme-accent: #0ff`
 * typed on a Fun page says nothing about what that token should be in Pro,
 * where `pro-theme.css` re-seats hundreds of `--theme-*` tokens. So edits are
 * keyed by visual style, which makes flipping the style pure navigation —
 * nothing is overwritten, and coming back to a style shows its own tweaks
 * again.
 *
 * The style is the *only* axis in the key. The hue and saturation sliders are
 * continuous positions over the one authored palette, not separate looks: an
 * edit is a literal colour that out-ranks the rotated tokens wherever the
 * sliders sit, so it follows the reader across every hue rather than parking.
 * `colorScheme` is deliberately absent too: `PaletteOverrides` already holds a
 * `dark` map and a `light` map, so one style's edit map covers both schemes
 * and flipping day/night selects a half rather than a key.
 */
export type LabLook = { visualStyle: VisualStyle };

/** The look a reader who has chosen nothing is wearing. */
export const DEFAULT_LOOK: LabLook = { visualStyle: "fun" };

/** Storage key for a look's edit map: the visual style's own validated slug. */
export function lookKey(look: LabLook): string {
  return look.visualStyle;
}

/**
 * Read a stored key back into a look, or `null` when it names an appearance
 * this build does not have.
 *
 * Envelopes written before the hue axis keyed looks as a
 * `style|accent|surface` triple. The base colourway's triple still describes
 * the palette this build ships, so it re-files onto the bare style key; every
 * other triple named an authored colourway that no longer exists — its values
 * are literal colours sampled against a palette this build does not render, so
 * the key is dropped rather than repainted over a live one.
 */
export function parseLookKey(value: unknown): LabLook | null {
  if (typeof value !== "string") return null;
  const [visualStyle, accent, surface, ...rest] = value.split("|");
  if (rest.length > 0 || !isVisualStyle(visualStyle)) return null;
  if (accent === undefined && surface === undefined) return { visualStyle };
  // Legacy triple: only the base look survives the colourways' retirement.
  return accent === "default" && surface === "orchid" ? { visualStyle } : null;
}
