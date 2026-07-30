"use client";

import { useSyncExternalStore } from "react";

/**
 * A tiny cross-tree store for the Palette Lab's open state.
 *
 * The lab is now a single global panel mounted once in the root layout (so it
 * survives navigation and is available on every page, including the homepage),
 * while its trigger button lives wherever the theme toggle does — the footer on
 * inner pages, the fixed corner cluster on the homepage. Those triggers and the
 * panel live in different parts of the React tree, so a module-level store with
 * `useSyncExternalStore` is the simplest way to share open/close between them
 * without a provider wrapping the whole app.
 */
let open = false;
let opener: HTMLElement | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
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
  emit();
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
  return useSyncExternalStore(subscribe, getPaletteLabOpen, () => false);
}
