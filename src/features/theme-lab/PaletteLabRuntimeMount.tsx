"use client";

import { useEffect } from "react";
import { startPaletteLabRuntime } from "./paletteLabRuntime";

/**
 * Renders nothing. It exists only to bind the Theme Lab runtime to the lifetime
 * of the protected `/dev/themes` route, so the saved palette is applied while
 * the tool is open — without the editor panel ever being opened or loaded.
 *
 * Leaving the route releases the runtime, which unpaints the palette again: no
 * public page carries this mount, so nothing outside the tool wears an editor's
 * saved look.
 */
export function PaletteLabRuntimeMount() {
  useEffect(() => startPaletteLabRuntime(), []);

  return null;
}
