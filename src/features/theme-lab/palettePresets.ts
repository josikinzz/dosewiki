/**
 * The shared colourway payloads.
 *
 * A colourway is a named pair of override maps — one per colour scheme — in
 * exactly the shape `html[data-theme="…"] { token: value }`. Seven of them ship
 * as the Theme Lab's colour data, and as the authored record the legacy hue
 * tables (`LEGACY_SURFACE_TO_HUE`/`LEGACY_ACCENT_TO_HUE` in `src/theme`) were
 * measured against: since the hue axis retired the swatch pickers, only Orchid
 * renders — every other look is a hue/saturation rotation of it — and the axis
 * tests read these payloads via {@link getPreset} to pin those rotations to the
 * angles each colourway authored. Nothing renders a payload directly.
 *
 * Authoring model: most of `site-colors.css` derives from the primitive channel
 * seeds (`--c-*`) and OKLCH hue-angle seeds (`--h-*`), so a colourway mostly
 * re-seats those and then pins the short list of hard-coded literal tokens (dark
 * panel/control bases, the dark page-gradient top stop and active-tab fill,
 * search overlay, report bylines, the light logo stop 3, avatar gradient, …).
 * Hue-angle tokens are first-class editable registry tokens too (the `hues`
 * group), so a colourway's hue is exactly the value a visitor's own hue nudge in
 * the Theme Lab diverges from.
 *
 * Safety constraint (see site-colors.css): the harm-reduction ramp
 * (success / caution / unsafe / danger / info) must stay clearly distinct from
 * each colourway's brand accent. Colourways whose brand sits on a safety hue
 * re-seat that family — documented per colourway in the declaration modules.
 *
 * Layout: this module owns the shape — the id union, the payload type, the
 * default, the hue whitelist, the merge helper — and the registry every importer
 * reads. The declarations are siblings: `presetAccentColourways.ts` holds five of
 * them and `lagoonPreset.ts` one, Lagoon separately because the accent group
 * measured 391 lines against 500 when it was written. Orchid stays here because
 * it *is* the absence of overrides — the authored CSS, the default id, and
 * `getPreset`'s fallback in one declaration. The recipes the colourways share
 * live in `presetRecipes.ts`.
 */

import { HUE_TOKEN_IDS } from "./paletteTokensHues";
import { lagoon } from "./lagoonPreset";
import { abyss, canopy, garnet, graphite, sunset } from "./presetAccentColourways";

export type ThemeOverrideMap = Record<string, string>;

/**
 * Override maps keyed by theme name ("dark" / "light"). Structurally the same
 * shape as the lab's own `Overrides` record (whose key type is the app-wide
 * `ColorScheme`, a string), so presets and user edits merge without casts. The
 * definition tests enforce that every preset carries both theme keys.
 */
export type PresetOverrides = Record<string, ThemeOverrideMap>;

export type PalettePresetId =
  | "orchid"
  | "abyss"
  | "graphite"
  | "canopy"
  | "garnet"
  | "sunset"
  | "lagoon";

export interface PalettePreset {
  id: PalettePresetId;
  name: string;
  tagline: string;
  /** No chroma to scale: the saturation axis skips this colourway entirely. */
  achromatic?: true;
  /** Five representative hexes per colour scheme, in order: canvas, panel, text,
   *  brand, accent. Display-only, and the panel hex is load-bearing —
   *  `src/theme/surfaces.ts` reads index 1 as the surface's tint, which is the
   *  colour the Surfaces swatch row paints. */
  swatch: { dark: string[]; light: string[] };
  overrides: PresetOverrides;
}

export const DEFAULT_PRESET_ID: PalettePresetId = "orchid";

/**
 * Hue-angle seeds a preset may re-seat.
 *
 * Kept as a name the preset tests read, but no longer a hand-maintained
 * whitelist: the seeds are registry tokens now, so this *is* the registry's hue
 * group. Anything a preset can name here, a visitor can also nudge in the lab.
 */
export const PRESET_HUE_TOKEN_IDS: readonly string[] = HUE_TOKEN_IDS;

/** Merge override sets per theme; `extra` (the user's edits) wins per token. */
export function mergeOverrides(base: PresetOverrides, extra: PresetOverrides): PresetOverrides {
  return {
    dark: { ...base.dark, ...extra.dark },
    light: { ...base.light, ...extra.light },
  };
}

/* ------------------------------------------------------------------------- */

/** The shipped fuchsia/plum look — zero overrides; the authored CSS as-is. */
const orchid: PalettePreset = {
  id: "orchid",
  name: "Orchid",
  tagline: "The shipped look — neon fuchsia over black plum glass.",
  swatch: {
    dark: ["#110617", "#1f0527", "#ffffff", "#d946ef", "#f0abfc"],
    light: ["#fdfcfd", "#f6e6f4", "#3c2144", "#a827b8", "#c026d3"],
  },
  overrides: { dark: {}, light: {} },
};

/* ------------------------------------------------------------------------- */

export const PALETTE_PRESETS: PalettePreset[] = [
  orchid,
  abyss,
  graphite,
  canopy,
  garnet,
  sunset,
  lagoon,
];

const PRESET_BY_ID = new Map<string, PalettePreset>(
  PALETTE_PRESETS.map((preset) => [preset.id, preset]),
);

export function isKnownPresetId(id: string | null | undefined): id is PalettePresetId {
  return typeof id === "string" && PRESET_BY_ID.has(id);
}

/** Resolve a preset id from storage; unknown / missing ids degrade to the
 *  default so a renamed or removed preset never errors. */
export function getPreset(id: string | null | undefined): PalettePreset {
  return (isKnownPresetId(id) ? PRESET_BY_ID.get(id) : undefined) ?? orchid;
}
