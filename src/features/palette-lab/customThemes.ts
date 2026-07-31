import { getPreset } from "./palettePresets";
import {
  presetRef,
  themeKey,
  type CustomThemeSlot,
  type PaletteOverrides,
  type ThemeRef,
} from "./paletteLabStorage";
import {
  activeBasePresetId,
  effectiveOverrides,
  type ThemeLabState,
} from "./paletteLabTheme";
import { updatePaletteLabTheme } from "./paletteLabStore";
import { clearThemeBaselineCache } from "./presetBaselines";

/**
 * Named custom theme slots: save-as, rename, delete.
 *
 * A slot is *the resolved look*, not a pointer at one. Saving captures the
 * active theme's own layer merged with the visitor's edits, for both themes at
 * once, so the slot keeps rendering the look it was saved from even if the
 * shipped preset it started on is retuned — or removed — in a later deploy.
 *
 * `basePresetId` rides along as provenance rather than as the slot's substance:
 * it names the compiled preset block that paints underneath (which is what lets
 * a slot restore pre-paint, from the stylesheet, with no flash) and keys the
 * revert baselines. Deliberately *not* captured: the hundreds of tokens the
 * palette derives from a handful of seeds. Flattening those into literals is
 * exactly the mistake that once broke every alternate palette, and it would
 * freeze a slot out of every future improvement to the derivation.
 *
 * Everything here is a pure state → patch function plus a thin store action, so
 * the panel component stays a renderer (it is at its LOC budget) and the rules
 * can be exercised without a DOM.
 */

/** A sensible ceiling. Slots are small, but an unbounded list is an unbounded
 *  localStorage envelope and an unusable gallery. */
export const MAX_CUSTOM_THEMES = 12;

/** Longest name we store. Long enough to be descriptive, short enough that a
 *  card in the two-column gallery still reads. */
export const MAX_CUSTOM_THEME_NAME = 40;

/** Patch shape the store's updater accepts. */
type ThemeLabPatch = Partial<ThemeLabState>;

/**
 * The five representative colors a gallery card strips. Shipped presets carry a
 * hand-authored swatch; a slot has no author, so it borrows its base preset's
 * strip and swaps in whichever of these it actually names.
 */
const SWATCH_TOKEN_IDS = [
  "--theme-body-bg",
  "--theme-panel-base",
  "--theme-text-primary",
  "--theme-section-heading",
  "--theme-accent",
] as const;

export function normalizeCustomThemeName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, MAX_CUSTOM_THEME_NAME);
}

/** `custom-1`, `custom-2`, … — one past the highest suffix in use, so an id is
 *  never handed out twice in a session even after a delete. */
function nextSlotId(slots: readonly CustomThemeSlot[]): string {
  let highest = 0;
  for (const slot of slots) {
    const match = /^custom-(\d+)$/.exec(slot.id);
    if (!match) continue;
    const value = Number(match[1]);
    if (Number.isFinite(value) && value > highest) highest = value;
  }
  return `custom-${highest + 1}`;
}

/** Make `name` unique among the existing slots by suffixing a count, so two
 *  saves of the same palette are still tellable apart in the gallery. */
function uniqueName(name: string, slots: readonly CustomThemeSlot[], exceptId?: string): string {
  const taken = new Set(
    slots.filter((slot) => slot.id !== exceptId).map((slot) => slot.name.toLowerCase()),
  );
  if (!taken.has(name.toLowerCase())) return name;
  for (let n = 2; n < 1000; n += 1) {
    const candidate = `${name} ${n}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return name;
}

/** What the save field is prefilled with: the palette being worn, marked as the
 *  visitor's own take on it. */
export function suggestCustomThemeName(state: ThemeLabState): string {
  const base = getPreset(activeBasePresetId(state)).name;
  return uniqueName(`My ${base}`, state.customThemes);
}

export function canSaveCustomTheme(state: ThemeLabState): boolean {
  return state.customThemes.length < MAX_CUSTOM_THEMES;
}

export function findCustomSlot(
  state: ThemeLabState,
  id: string,
): CustomThemeSlot | undefined {
  return state.customThemes.find((slot) => slot.id === id);
}

export function customThemeRef(id: string): ThemeRef {
  return { kind: "custom", id };
}

/** The resolved look the visitor is wearing right now, in slot form. */
export function captureCurrentLook(state: ThemeLabState): {
  overrides: PaletteOverrides;
  basePresetId: string;
} {
  return {
    overrides: effectiveOverrides(state),
    basePresetId: activeBasePresetId(state),
  };
}

/**
 * Save the current look as a new slot and wear it.
 *
 * The theme it was captured *from* is untouched: its edit map stays filed under
 * its own key, so saving a slot is additive rather than a move. The new slot
 * starts with no edits of its own — everything it needs is already in its
 * overrides — which is also why it reads as "No changes" the moment it lands.
 */
export function addCustomTheme(state: ThemeLabState, rawName: string): ThemeLabPatch {
  if (!canSaveCustomTheme(state)) return {};
  const captured = captureCurrentLook(state);
  const name = uniqueName(
    normalizeCustomThemeName(rawName) || suggestCustomThemeName(state),
    state.customThemes,
  );
  const slot: CustomThemeSlot = {
    id: nextSlotId(state.customThemes),
    name,
    overrides: captured.overrides,
    basePresetId: captured.basePresetId,
  };
  return {
    customThemes: [...state.customThemes, slot],
    activeThemeRef: customThemeRef(slot.id),
  };
}

export function renameCustomTheme(
  state: ThemeLabState,
  id: string,
  rawName: string,
): ThemeLabPatch {
  const name = normalizeCustomThemeName(rawName);
  const existing = findCustomSlot(state, id);
  if (!name || !existing || name === existing.name) return {};
  const unique = uniqueName(name, state.customThemes, id);
  return {
    customThemes: state.customThemes.map((slot) =>
      slot.id === id ? { ...slot, name: unique } : slot,
    ),
  };
}

/**
 * Drop a slot, its edit map, and — when it was the one being worn — the
 * reference to it. A deleted slot falls back to the shipped preset it was
 * derived from, which is the nearest thing to "the look you had".
 */
export function deleteCustomTheme(state: ThemeLabState, id: string): ThemeLabPatch {
  const slot = findCustomSlot(state, id);
  if (!slot) return {};
  const ref = customThemeRef(id);
  const editsByPreset = { ...state.editsByPreset };
  delete editsByPreset[themeKey(ref)];
  const patch: ThemeLabPatch = {
    customThemes: state.customThemes.filter((entry) => entry.id !== id),
    editsByPreset,
  };
  if (state.activeThemeRef.kind === "custom" && state.activeThemeRef.id === id) {
    patch.activeThemeRef = presetRef(getPreset(slot.basePresetId).id);
  }
  return patch;
}

/** Gallery strip for a slot: its base preset's swatch with the slot's own
 *  values swapped in wherever it names one. Display only. */
export function customThemeSwatch(slot: CustomThemeSlot): { dark: string[]; light: string[] } {
  const base = getPreset(slot.basePresetId).swatch;
  const strip = (theme: "dark" | "light") =>
    SWATCH_TOKEN_IDS.map(
      (token, index) => slot.overrides[theme]?.[token] ?? base[theme][index] ?? "transparent",
    );
  return { dark: strip("dark"), light: strip("light") };
}

/* ------------------------------------------------------------------ actions */

/** Save the current look under `name` and switch to it. */
export function saveCurrentLookAsCustomTheme(name: string): void {
  updatePaletteLabTheme((previous) => addCustomTheme(previous, name));
}

export function renameCustomThemeSlot(id: string, name: string): void {
  updatePaletteLabTheme((previous) => renameCustomTheme(previous, id, name));
}

export function deleteCustomThemeSlot(id: string): void {
  // The slot's baselines were sampled against *its* tokens; a later slot could
  // otherwise inherit them through a recycled storage key.
  clearThemeBaselineCache(themeKey(customThemeRef(id)));
  updatePaletteLabTheme((previous) => deleteCustomTheme(previous, id));
}
