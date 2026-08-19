import {
  BASE_ACCENT,
  BASE_SURFACE,
  isAccent,
  isSurface,
  isVisualStyle,
  type AccentId,
  type SurfaceId,
  type VisualStyle,
} from "@/theme";

/**
 * The appearance the Theme Lab's edits belong to.
 *
 * A token edit is a statement about one look: `--theme-accent: #0ff` typed while
 * wearing Fun/Orchid/teal says nothing about what that token should be in Pro, or
 * on Garnet. So edits are keyed by the look they were made against, which makes
 * changing accent or surface pure navigation — nothing is overwritten, and coming
 * back to a look shows its own tweaks again. That is the same isolation the lab's
 * old per-preset keying gave, re-based on the appearance axes the reader actually
 * has.
 *
 * `colorScheme` is deliberately *not* part of the key: `PaletteOverrides`
 * already holds a `dark` map and a `light` map, so one look's edit map covers both
 * schemes and flipping day/night selects a half rather than a key.
 */
export type LabLook = { visualStyle: VisualStyle; accent: AccentId; surface: SurfaceId };

/** The look a reader who has chosen nothing is wearing — the appearance the
 *  stylesheets render with no root attribute present. */
export const DEFAULT_LOOK: LabLook = {
  visualStyle: "fun",
  accent: BASE_ACCENT,
  surface: BASE_SURFACE,
};

/** Storage key for a look's edit map. Ordered style → accent → surface and
 *  pipe-joined; every axis value is a validated slug, so no value can contain the
 *  separator and no two looks can collide on one key. */
export function lookKey(look: LabLook): string {
  return `${look.visualStyle}|${look.accent}|${look.surface}`;
}

/**
 * Read a stored key back into a look, or `null` when it names an appearance this
 * build does not have.
 *
 * Every axis is validated rather than trusted: a retired accent or surface id
 * would key an edit map onto a look that no longer renders, and the literal
 * colours in that map would then paint over whatever palette the reader is
 * actually wearing.
 */
export function parseLookKey(value: unknown): LabLook | null {
  if (typeof value !== "string") return null;
  const parts = value.split("|");
  if (parts.length !== 3) return null;
  const [visualStyle, accent, surface] = parts;
  if (!isVisualStyle(visualStyle) || !isAccent(accent) || !isSurface(surface)) return null;
  return { visualStyle, accent, surface };
}
