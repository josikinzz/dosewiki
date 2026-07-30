"use client";

import { useEffect } from "react";
import { isEffectIndex } from "@/config/siteFlavor";
import { startPaletteLabRuntime } from "./paletteLabRuntime";

/**
 * Renders nothing. It exists only to bind the Palette Lab runtime to the app's
 * lifetime, so a saved theme applies on every page load — including on routes
 * with no trigger, and without the editor panel ever being opened or loaded.
 *
 * Effect Index wears a locked skin and never offers the lab, so the runtime is
 * not started there at all.
 */
export function PaletteLabRuntimeMount() {
  useEffect(() => {
    if (isEffectIndex()) return;
    return startPaletteLabRuntime();
  }, []);

  return null;
}
