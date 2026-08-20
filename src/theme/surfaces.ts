/**
 * The retired surface axis, kept only as migration vocabulary.
 *
 * dose.wiki no longer ships named surface colourways: the reader-facing surface controls are
 * a continuous hue slider (`--dw-surface-hue`, `src/theme/appearanceChroma.ts`) composed with
 * the saturation slider, both rotating/scaling the one authored base palette — Orchid, the
 * plum at `--h-brand: 326` in `site-colors.css`. Grey is no longer a colourway either; it is
 * saturation level 0 on the chroma axis.
 *
 * What survives here is the legacy id union and the table that carries a reader's old
 * `dosewiki-surface` choice onto the new axes. The hue shifts are each retired colourway's
 * authored `--h-brand` minus Orchid's 326, normalised to 0..359 — frozen history, hard-coded
 * so the migration cannot drift if the Theme Lab's preset payloads (where the colourways
 * live on) are ever edited. `surfaces.axis.test.ts` pins them against the authored seeds.
 */

/** Ids the retired `dosewiki-surface` storage key could hold. Migration vocabulary only. */
export type SurfaceId = "orchid" | "abyss" | "canopy" | "garnet" | "sunset" | "graphite" | "lagoon";

export const BASE_SURFACE_ID: SurfaceId = "orchid";

/**
 * Orchid's representative panel tint per scheme — the swatch hexes the retired picker showed
 * (`palettePresets.ts`, orchid `swatch[1]`). The hue slider's rail and thumb are painted from
 * these now that no Surface object carries a tint.
 */
export const BASE_SURFACE_TINT = { dark: "#1f0527", light: "#f6e6f4" } as const;

export function isSurface(value: string | null | undefined): value is SurfaceId {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(LEGACY_SURFACE_TO_HUE, value)
  );
}

/**
 * Where a saved surface id lands on the new axes: the colourway's authored brand hue as a
 * rotation from the base, plus a chroma pin for the one achromatic colourway. Graphite was
 * never a hue — it pinned the palette's chroma near zero at `--h-brand: 250` — so its heir is
 * saturation level 0, not a rotation; `chroma: 0` overrides any stored chroma level during
 * migration, exactly the look the reader had.
 */
export const LEGACY_SURFACE_TO_HUE: Record<SurfaceId, { hue: number; chroma?: 0 }> = {
  orchid: { hue: 0 },
  abyss: { hue: 249 }, // authored --h-brand 215 − base 326, mod 360
  canopy: { hue: 184 }, // 150 − 326
  garnet: { hue: 59 }, // 25 − 326
  sunset: { hue: 79 }, // 45 − 326
  graphite: { hue: 0, chroma: 0 }, // achromatic: grey is chroma 0 now, not a hue
  lagoon: { hue: 221 }, // 187 − 326
};
