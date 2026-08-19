"use client";

import { useEffect } from "react";
import { startPaletteLabRuntime } from "./paletteLabRuntime";

/**
 * Binds the Palette Lab runtime to DoseWiki's root layout. Saved palettes apply
 * on every page without loading or opening the editor panel.
 */
export function PaletteLabRuntimeMount() {
  useEffect(() => startPaletteLabRuntime(), []);

  return null;
}
