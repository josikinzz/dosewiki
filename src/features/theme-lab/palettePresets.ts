/**
 * Theme Lab preset palettes.
 *
 * A preset is a named pair of override maps — one per theme — in exactly the
 * shape the lab already injects (`html[data-theme="…"] { token: value }`) and
 * persists. Applying a preset therefore needs no new rendering machinery: the
 * lab merges `preset.overrides` under the user's own edits and writes the
 * result through the existing style tag.
 *
 * Authoring model: most of `site-colors.css` derives from the primitive
 * channel seeds (`--c-*`) and OKLCH hue-angle seeds (`--h-*`), so a preset
 * mostly re-seats those and then pins the short list of hard-coded literal
 * tokens (dark panel/control bases, the dark page-gradient top stop and
 * active-tab fill, search overlay, report bylines, the light logo stop 3,
 * avatar gradient, …). Hue-angle tokens are now first-class editable registry
 * tokens too (the `hues` group), so a preset's hue is exactly the value a
 * visitor's own hue nudge diverges from.
 *
 * Safety constraint (see site-colors.css): the harm-reduction ramp
 * (success / caution / unsafe / danger / info) must stay clearly distinct
 * from each preset's brand accent. Presets whose brand sits on a safety hue
 * re-seat that family — documented per preset in the colourway modules.
 *
 * Layout: this module owns the shape — the id union, the preset type, the
 * default, the hue whitelist, the merge helper — and the registry every
 * importer reads. The colourway declarations are siblings, cut along the accent
 * axis because that is the one grouping of them the rest of the app already
 * depends on: `presetAccentColourways.ts` holds five of the six an accent wears,
 * `presetLabColourways.ts` the five that stay Lab-only, and `journalPreset.ts`
 * and `lagoonPreset.ts` one apiece — Letterpress because it was already its own
 * module, Lagoon because the accent group measured 391 lines against 500 when it
 * was written and a sixth colourway there would have re-created the squeeze this
 * split fixed. Orchid stays here because it *is* the absence of overrides — the
 * authored CSS, the default id, and `getPreset`'s fallback in one declaration.
 * Splitting was the alternative to raising the 925-line cleanup budget this file
 * measured 889 against; the recipes the colourways share moved to
 * `presetRecipes.ts` with them.
 */

import { HUE_TOKEN_IDS } from "./paletteTokensHues";
import { journal } from "./journalPreset";
import { lagoon } from "./lagoonPreset";
import { abyss, canopy, garnet, graphite, sunset } from "./presetAccentColourways";
import { halloween, liberty, parchment, twilight, yuletide } from "./presetLabColourways";

export type PresetThemeName = "dark" | "light";
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
  | "twilight"
  | "graphite"
  | "parchment"
  | "canopy"
  | "garnet"
  | "sunset"
  | "lagoon"
  | "liberty"
  | "halloween"
  | "yuletide"
  | "journal";

export interface PalettePreset {
  id: PalettePresetId;
  name: string;
  tagline: string;
  /** Five representative hexes per theme (canvas, panel, text, brand, accent)
   *  for the picker swatch strips. Display-only. */
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
  twilight,
  graphite,
  parchment,
  canopy,
  garnet,
  sunset,
  lagoon,
  liberty,
  halloween,
  yuletide,
  journal,
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
