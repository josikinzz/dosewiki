"use client";

import { useSyncExternalStore } from "react";
import { DEFAULT_PRESET_ID, type PalettePresetId } from "./palettePresets";
import { emptyOverrides, type PaletteOverrides } from "./paletteLabStorage";

/**
 * The Palette Lab's cross-tree stores.
 *
 * Two things need sharing between parts of the React tree that never meet:
 *
 * 1. **Open state** — the lab is a single global panel mounted once in the root
 *    layout, while its triggers live wherever the theme toggle does (the footer
 *    on inner pages, the fixed corner cluster on the homepage).
 * 2. **Theme state** (active preset + the visitor's own edits) — owned here so
 *    the always-mounted, UI-free runtime and the lazily-loaded editor panel read
 *    and write *one* source of truth. Before this split the panel owned the
 *    state, so a saved look could not apply until the panel had been opened.
 *
 * These are plain module stores read through `useSyncExternalStore`; neither
 * needs a provider wrapping the app.
 */

/* ---------------------------------------------------------------- open state */

let open = false;
let opener: HTMLElement | null = null;
const openListeners = new Set<() => void>();

function emitOpen() {
  for (const listener of openListeners) listener();
}

function subscribeOpen(listener: () => void) {
  openListeners.add(listener);
  return () => {
    openListeners.delete(listener);
  };
}

export function getPaletteLabOpen() {
  return open;
}

export function setPaletteLabOpen(next: boolean, fromTrigger?: HTMLElement | null) {
  // Remember which trigger opened the lab so focus can return there on close.
  if (next && fromTrigger) opener = fromTrigger;
  if (open === next) return;
  open = next;
  emitOpen();
}

export function togglePaletteLab(fromTrigger?: HTMLElement | null) {
  setPaletteLabOpen(!open, fromTrigger);
}

/** The element that last opened the lab — focus returns here when it closes. */
export function getPaletteLabOpener() {
  return opener;
}

/** Subscribe a component to the lab's open state. */
export function usePaletteLabOpen() {
  return useSyncExternalStore(subscribeOpen, getPaletteLabOpen, () => false);
}

/* --------------------------------------------------------------- theme state */

export type PaletteLabThemeState = {
  /** The shipped palette the look is built on. */
  presetId: PalettePresetId;
  /** The visitor's own edits, merged over the preset when rendering. */
  overrides: PaletteOverrides;
  /** False once a storage read or write has failed — the panel says so rather
   *  than claiming the theme is saved to this browser. */
  storageOk: boolean;
};

function initialThemeState(): PaletteLabThemeState {
  return { presetId: DEFAULT_PRESET_ID, overrides: emptyOverrides(), storageOk: true };
}

let themeState: PaletteLabThemeState = initialThemeState();
/** Referentially stable snapshot for SSR — `useSyncExternalStore` requires it. */
const serverThemeState: PaletteLabThemeState = initialThemeState();
const themeListeners = new Set<() => void>();

export function getPaletteLabTheme(): PaletteLabThemeState {
  return themeState;
}

export function subscribeToPaletteLabTheme(listener: () => void) {
  themeListeners.add(listener);
  return () => {
    themeListeners.delete(listener);
  };
}

type ThemePatch = Partial<PaletteLabThemeState>;

/**
 * Merge a patch into the theme state and notify subscribers. Accepts a function
 * so callers can derive the next value from the current one without racing
 * another writer (the panel's token edits do exactly this).
 */
export function updatePaletteLabTheme(
  patch: ThemePatch | ((previous: PaletteLabThemeState) => ThemePatch),
) {
  const resolved = typeof patch === "function" ? patch(themeState) : patch;
  const next: PaletteLabThemeState = { ...themeState, ...resolved };
  if (
    next.presetId === themeState.presetId &&
    next.overrides === themeState.overrides &&
    next.storageOk === themeState.storageOk
  ) {
    return;
  }
  themeState = next;
  for (const listener of themeListeners) listener();
}

/** Drop back to a pristine store. Used when the runtime stops (its last mount
 *  went away), so a remount re-reads storage rather than trusting stale state. */
export function resetPaletteLabTheme() {
  themeState = initialThemeState();
  for (const listener of themeListeners) listener();
}

/** Subscribe a component to the active preset, edits, and storage health. */
export function usePaletteLabTheme(): PaletteLabThemeState {
  return useSyncExternalStore(
    subscribeToPaletteLabTheme,
    getPaletteLabTheme,
    () => serverThemeState,
  );
}
