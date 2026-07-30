import { DEFAULT_PRESET_ID, getPreset, mergeOverrides } from "./palettePresets";
import {
  emptyOverrides,
  isEmptyOverrides,
  themeKey,
  type CustomThemeSlot,
  type PaletteOverrides,
  type ThemeRef,
} from "./paletteLabStorage";

/**
 * Derivation helpers for the v3 theme state: *which* look is active, what the
 * visitor has changed on it, and what the two of those merge into.
 *
 * These live beside the store rather than inside the panel because the runtime
 * (no UI) and the editor (all UI) need exactly the same answers, and because
 * the panel component is at its LOC budget.
 *
 * The rule everything else follows: **edits belong to the theme they diverge
 * from.** Switching themes is navigation — it changes which edit map is in
 * play, never the contents of any of them.
 */

/** The persisted half of the lab's state — everything except storage health. */
export type ThemeLabState = {
  activeThemeRef: ThemeRef;
  editsByPreset: Record<string, PaletteOverrides>;
  customThemes: CustomThemeSlot[];
};

function toPaletteOverrides(value: Record<string, Record<string, string>>): PaletteOverrides {
  return { dark: value.dark ?? {}, light: value.light ?? {} };
}

/** The custom slot the active reference points at, if it points at one that
 *  still exists. */
export function activeCustomSlot(state: ThemeLabState): CustomThemeSlot | undefined {
  if (state.activeThemeRef.kind !== "custom") return undefined;
  return state.customThemes.find((slot) => slot.id === state.activeThemeRef.id);
}

/**
 * True when the active reference resolves to something we actually ship or
 * store. A false here is not an error: the reference is kept as saved and the
 * look falls back to the default preset (see `baseOverrides`).
 */
export function isActiveThemeKnown(state: ThemeLabState): boolean {
  if (state.activeThemeRef.kind === "custom") return activeCustomSlot(state) !== undefined;
  return getPreset(state.activeThemeRef.id).id === state.activeThemeRef.id;
}

/**
 * The shipped preset the active look is built on — the cache key for revert
 * baselines, and the fallback for an unknown or retired reference.
 */
export function activeBasePresetId(state: ThemeLabState): string {
  const slot = activeCustomSlot(state);
  if (slot) return getPreset(slot.basePresetId).id;
  return getPreset(state.activeThemeRef.id).id;
}

/** Everything under the visitor's own edits: the preset layer, plus a custom
 *  slot's saved tokens when one is active. */
export function baseOverrides(state: ThemeLabState): PaletteOverrides {
  const presetLayer = getPreset(activeBasePresetId(state)).overrides;
  const slot = activeCustomSlot(state);
  return toPaletteOverrides(
    slot ? mergeOverrides(presetLayer, slot.overrides) : presetLayer,
  );
}

/** The active theme's own edit map (never shared with any other theme). */
export function activeEdits(state: ThemeLabState): PaletteOverrides {
  return state.editsByPreset[themeKey(state.activeThemeRef)] ?? emptyOverrides();
}

/** Replace the active theme's edit map, pruning it away when it empties out. */
export function withActiveEdits(
  state: ThemeLabState,
  next: PaletteOverrides,
): Record<string, PaletteOverrides> {
  const key = themeKey(state.activeThemeRef);
  const result = { ...state.editsByPreset };
  if (isEmptyOverrides(next)) delete result[key];
  else result[key] = next;
  return result;
}

/** What actually renders: the base layer with the active theme's edits on top
 *  (the visitor wins, per token, per theme). */
export function effectiveOverrides(state: ThemeLabState): PaletteOverrides {
  return toPaletteOverrides(mergeOverrides(baseOverrides(state), activeEdits(state)));
}

/** How many tokens the visitor has changed on the active theme — the panel's
 *  "changed" indicator, scoped to the theme they are on. */
export function activeEditCount(state: ThemeLabState): number {
  const edits = activeEdits(state);
  return Object.keys(edits.dark).length + Object.keys(edits.light).length;
}

export const FALLBACK_PRESET_ID = DEFAULT_PRESET_ID;
