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

/** One colour scheme's worth of Pro surface seeds. Keys are `--ei-*` custom property names. */
export type ProSurfaceSeeds = Readonly<Record<string, string>>;

/**
 * The Pro surface seeds the surface axis owns, copied from the authored declarations in
 * `pro-theme.css` (light block :85-92/:193, dark block :563-578/:624) and pinned against
 * them by `chromaStylesheet.test.ts` — the sheet stays the single source; this map cannot
 * drift from it silently. `pro-theme.css` itself is never edited for this axis: Effect
 * Index reads those literals byte for byte.
 *
 * The eight names are the page *material*: the canvas, the four surface steps, the content
 * chrome, the quiet hairline that outlines that material, and `--ei-fade` — the canvas at
 * 88% alpha (the scrim that fades a collapsed dose table into the page), which must follow
 * the canvas or the scrim detaches from the paper it fades into.
 *
 * Deliberately absent, unlike the Fun surface family (where `paletteTokenRole` routes every
 * non-accent, non-semantic token here — inks included, because Orchid's ink is authored
 * plum-tinted):
 *
 * - The ink ramps (`--ei-ink*`, `--ei-on-dark*`) and the greyscale intensity
 *   ramp (`--ei-level-*`): Pro's text is neutral by design, and every step is
 *   tuned to a WCAG floor that an added chroma would quietly erode.
 * - `--ei-border-strong`: the control outline, held to SC 1.4.11's 3:1 floor per scheme.
 * - The chrome rails (`--ei-chrome-dark`/`-darker`/`-sunk`/`-raised`/`-border`): charcoal
 *   in BOTH schemes — the bracketing is the page shell, not a surface — and their inks are
 *   excluded above, so tinting the rails alone would strand them.
 * - The shadows: occlusion, not colour.
 */
export const BASE_SURFACE_PRO_SEEDS: {
  readonly light: ProSurfaceSeeds;
  readonly dark: ProSurfaceSeeds;
} = {
  light: {
    "--ei-paper": "#f6f5f1",
    "--ei-surface": "#fbfaf8",
    "--ei-surface-raised": "#ffffff",
    "--ei-surface-sunk": "#efeee9",
    "--ei-surface-deep": "#e4e2db",
    "--ei-chrome": "#efeee9",
    "--ei-border": "#dcdad3",
    "--ei-fade": "rgb(246 245 241 / 0.88)",
  },
  dark: {
    "--ei-paper": "#131313",
    "--ei-surface": "#191919",
    "--ei-surface-raised": "#212121",
    "--ei-surface-sunk": "#0c0c0c",
    "--ei-surface-deep": "#070707",
    "--ei-chrome": "#191919",
    "--ei-border": "#3f3f3f",
    "--ei-fade": "rgb(19 19 19 / 0.88)",
  },
};

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
