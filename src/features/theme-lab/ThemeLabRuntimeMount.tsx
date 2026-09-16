"use client";

import { useEffect } from "react";
import { useTheme } from "@/context/ThemeContext";
import { startThemeLabRuntime } from "./themeLabRuntime";
import { setThemeLabLook } from "./themeLabStore";

/**
 * Binds the Theme Lab runtime to DoseWiki's root layout. Saved edits apply on
 * every page without loading or opening the editor panel.
 *
 * This is also where the lab learns which look it is editing. It renders inside
 * the one appearance owner (`src/app/layout.tsx`), so the reader's own visual
 * style arrives here as context rather than being re-derived from the document —
 * which is what keeps the lab's edit isolation keyed to the same axis the
 * reader's controls move. Hue and saturation are not part of the key: they are
 * continuous positions over the one authored palette, and the lab's literal
 * edits out-rank them wherever the sliders sit.
 *
 * The look is pushed from an effect declared *before* the one that starts the
 * runtime, because effects fire in declaration order: the store therefore knows
 * the look before hydration reads the envelope, so the first paint applies the
 * worn look's edits rather than the default look's.
 */
export function ThemeLabRuntimeMount({ onReady }: { onReady?: (ready: boolean) => void } = {}) {
  const { visualStyle } = useTheme();

  useEffect(() => {
    setThemeLabLook({ visualStyle });
  }, [visualStyle]);

  useEffect(() => {
    const stop = startThemeLabRuntime();
    onReady?.(true);
    return stop;
  }, [onReady]);

  return null;
}
