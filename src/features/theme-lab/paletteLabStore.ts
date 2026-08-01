"use client";

import { useSyncExternalStore } from "react";
import {
  defaultThemeRef,
  sameThemeRef,
  type PaletteOverrides,
  type ThemeRef,
} from "./paletteLabStorage";
import { activeEdits, withActiveEdits, type ThemeLabState } from "./paletteLabTheme";

/**
 * The Theme Lab's cross-tree stores.
 *
 * Two things need sharing between parts of the React tree that never meet:
 *
 * 1. **Open state** — the lab is a single global panel mounted once in the root
 *    layout, while its triggers live wherever the theme toggle does (the footer
 *    on inner pages, the fixed corner cluster on the homepage).
 * 2. **Theme state** (the active theme reference, each theme's own edits, and
 *    the visitor's saved custom slots) — owned here so the always-mounted,
 *    UI-free runtime and the lazily-loaded editor panel read and write *one*
 *    source of truth. Before this split the panel owned the
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

/**
 * A look shown *instead of* the saved one, without becoming it.
 *
 * This is how a shared theme is previewed before it is accepted: the runtime
 * renders this in place of the visitor's own layer, while every persisted field
 * stays exactly as it was. Deliberately not part of the envelope — declining a
 * preview has to leave storage byte-identical, and a preview must never survive
 * a reload.
 */
export type ThemePreview = {
  /** Which shipped preset paints underneath (`html[data-palette]`). */
  paletteId: string;
  /** The complete look to inject over it. */
  overrides: PaletteOverrides;
};

export type PaletteLabThemeState = ThemeLabState & {
  /** False once a storage read or write has failed — the panel says so rather
   *  than claiming the theme is saved to this browser. */
  storageOk: boolean;
  /** Non-null while a shared theme is being previewed. Never persisted. */
  preview: ThemePreview | null;
};

function initialThemeState(): PaletteLabThemeState {
  return {
    activeThemeRef: defaultThemeRef(),
    editsByPreset: {},
    customThemes: [],
    storageOk: true,
    preview: null,
  };
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
    sameThemeRef(next.activeThemeRef, themeState.activeThemeRef) &&
    next.editsByPreset === themeState.editsByPreset &&
    next.customThemes === themeState.customThemes &&
    next.storageOk === themeState.storageOk &&
    next.preview === themeState.preview
  ) {
    return;
  }
  themeState = next;
  for (const listener of themeListeners) listener();
}

/** Switch which theme is worn. Pure navigation: no edit map is touched, so
 *  every theme keeps its own tweaks and coming back shows them again. */
export function setActiveThemeRef(ref: ThemeRef) {
  updatePaletteLabTheme({ activeThemeRef: ref });
}

/** Write the *active* theme's edit map. Every token write in the panel goes
 *  through here, which is what keeps edits from leaking between themes. */
export function setActiveEdits(
  next: PaletteOverrides | ((previous: PaletteOverrides) => PaletteOverrides),
) {
  updatePaletteLabTheme((previous) => ({
    editsByPreset: withActiveEdits(
      previous,
      typeof next === "function" ? next(activeEdits(previous)) : next,
    ),
  }));
}

/**
 * Show a look without adopting it, or clear the preview (`null`).
 *
 * Nothing persisted changes, so the runtime re-renders the document and writes
 * nothing: declining a shared theme is a true no-op on the visitor's storage.
 */
export function setPaletteLabPreview(preview: ThemePreview | null) {
  updatePaletteLabTheme({ preview });
}

/** Drop back to a pristine store. Used when the runtime stops (its last mount
 *  went away), so a remount re-reads storage rather than trusting stale state. */
export function resetPaletteLabTheme() {
  themeState = initialThemeState();
  for (const listener of themeListeners) listener();
}

/** Subscribe a component to the active theme, its edits, and storage health. */
export function usePaletteLabTheme(): PaletteLabThemeState {
  return useSyncExternalStore(
    subscribeToPaletteLabTheme,
    getPaletteLabTheme,
    () => serverThemeState,
  );
}
