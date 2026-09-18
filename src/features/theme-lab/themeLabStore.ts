"use client";

import { useSyncExternalStore } from "react";
import { DEFAULT_LOOK, type LabLook } from "./themeLabLook";
import type { PaletteOverrides } from "./themeLabStorage";
import { activeEdits, withActiveEdits, type ThemeLabState } from "./themeLabTheme";

/**
 * The Theme Lab's cross-tree stores.
 *
 * Two things need sharing between parts of the React tree that never meet:
 *
 * 1. **Open state** — the panel portals itself to `<body>`, while appearance
 *    controls in the homepage, footer, or any other page open it.
 * 2. **Theme state** (the look being worn, and each look's own edits) — owned
 *    here so the UI-free runtime and the lazily loaded editor panel read and
 *    write *one* source of truth. Before this split the panel owned the state, so
 *    a saved look could not apply until the panel had been opened.
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

export function getThemeLabOpen() {
  return open;
}

export function setThemeLabOpen(next: boolean, fromOpener?: HTMLElement | null) {
  // Remember which control opened the lab so focus can return there on close.
  if (next && fromOpener) opener = fromOpener;
  if (open === next) return;
  open = next;
  emitOpen();
}

/** The element that last opened the lab — focus returns here when it closes. */
export function getThemeLabOpener() {
  return opener;
}

/** Subscribe a component to the lab's open state. */
export function useThemeLabOpen() {
  return useSyncExternalStore(subscribeOpen, getThemeLabOpen, () => false);
}

/* --------------------------------------------------------------- theme state */

export type ThemeLabThemeState = ThemeLabState & {
  /** False once a storage read or write has failed — the panel says so rather
   *  than claiming the theme is saved to this browser. */
  storageOk: boolean;
};

function initialThemeState(): ThemeLabThemeState {
  return { look: DEFAULT_LOOK, editsByLook: {}, storageOk: true };
}

let themeState: ThemeLabThemeState = initialThemeState();
/** Referentially stable snapshot for SSR — `useSyncExternalStore` requires it. */
const serverThemeState: ThemeLabThemeState = initialThemeState();
const themeListeners = new Set<() => void>();

export function getThemeLabTheme(): ThemeLabThemeState {
  return themeState;
}

export function subscribeToThemeLabTheme(listener: () => void) {
  themeListeners.add(listener);
  return () => {
    themeListeners.delete(listener);
  };
}

type ThemePatch = Partial<ThemeLabThemeState>;

/**
 * Merge a patch into the theme state and notify subscribers. Accepts a function
 * so callers can derive the next value from the current one without racing
 * another writer (the panel's token edits do exactly this).
 *
 * The look is compared axis by axis rather than by identity: it arrives from an
 * effect in {@link ThemeLabRuntimeMount} as a fresh object on every appearance
 * commit, so a reference check would wake every subscriber (and re-serialize the
 * envelope) on renders that changed nothing.
 */
export function updateThemeLabTheme(
  patch: ThemePatch | ((previous: ThemeLabThemeState) => ThemePatch),
) {
  const resolved = typeof patch === "function" ? patch(themeState) : patch;
  const next: ThemeLabThemeState = { ...themeState, ...resolved };
  if (
    next.look.visualStyle === themeState.look.visualStyle &&
    next.editsByLook === themeState.editsByLook &&
    next.storageOk === themeState.storageOk
  ) {
    return;
  }
  themeState = next;
  for (const listener of themeListeners) listener();
}

/** Switch which look the lab is editing. Pure navigation: no edit map is
 *  touched, so every look keeps its own tweaks and coming back shows them
 *  again. */
export function setThemeLabLook(look: LabLook) {
  updateThemeLabTheme({ look });
}

/** Write the *active* look's edit map. Every token write in the panel goes
 *  through here, which is what keeps edits from leaking between looks. */
export function setActiveEdits(
  next: PaletteOverrides | ((previous: PaletteOverrides) => PaletteOverrides),
) {
  updateThemeLabTheme((previous) => ({
    editsByLook: withActiveEdits(
      previous,
      typeof next === "function" ? next(activeEdits(previous)) : next,
    ),
  }));
}

/** Drop back to a pristine store. Used when the runtime stops (its last mount
 *  went away), so a remount re-reads storage rather than trusting stale state. */
export function resetThemeLabTheme() {
  themeState = initialThemeState();
  for (const listener of themeListeners) listener();
}

/** Subscribe a component to the active look, its edits, and storage health. */
export function useThemeLabTheme(): ThemeLabThemeState {
  return useSyncExternalStore(
    subscribeToThemeLabTheme,
    getThemeLabTheme,
    () => serverThemeState,
  );
}
