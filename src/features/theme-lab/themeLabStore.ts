"use client";

import { useSyncExternalStore } from "react";
import { DEFAULT_LOOK, type LabLook } from "./themeLabLook";
import type { PaletteOverrides } from "./themeLabStorage";
import { activeEdits, withActiveEdits, type ThemeLabState } from "./themeLabTheme";

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
  if (next && fromOpener) opener = fromOpener;
  if (open === next) return;
  open = next;
  emitOpen();
}

export function getThemeLabOpener() {
  return opener;
}

export function useThemeLabOpen() {
  return useSyncExternalStore(subscribeOpen, getThemeLabOpen, () => false);
}

export type ThemeLabThemeState = ThemeLabState & {
  storageOk: boolean;
};

function initialThemeState(): ThemeLabThemeState {
  return { look: DEFAULT_LOOK, editsByLook: {}, storageOk: true };
}

let themeState: ThemeLabThemeState = initialThemeState();
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

export function setThemeLabLook(look: LabLook) {
  updateThemeLabTheme({ look });
}

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

export function resetThemeLabTheme() {
  themeState = initialThemeState();
  for (const listener of themeListeners) listener();
}

export function useThemeLabTheme(): ThemeLabThemeState {
  return useSyncExternalStore(
    subscribeToThemeLabTheme,
    getThemeLabTheme,
    () => serverThemeState,
  );
}
