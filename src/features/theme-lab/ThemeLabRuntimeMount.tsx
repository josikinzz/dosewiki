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
 * the one appearance owner (`src/app/layout.tsx`), so the reader's own style,
 * accent and surface choices arrive here as context rather than being re-derived
 * from the document — which is what keeps the lab's edit isolation keyed to the
 * same four axes the reader's controls move.
 *
 * The look is pushed from an effect declared *before* the one that starts the
 * runtime, because effects fire in declaration order: the store therefore knows
 * the look before hydration reads the envelope, so the first paint applies the
 * worn look's edits rather than the default look's.
 */
export function ThemeLabRuntimeMount() {
  const { visualStyle, accent, surface } = useTheme();

  useEffect(() => {
    setThemeLabLook({ visualStyle, accent, surface });
  }, [visualStyle, accent, surface]);

  useEffect(() => startThemeLabRuntime(), []);

  return null;
}
