import { useState, type PropsWithChildren } from "react";

import { ThemeProvider } from "@/context/ThemeContext";
import {
  ACCENT_CHROMA_STORAGE_KEY,
  ACCENT_HUE_STORAGE_KEY,
  SURFACE_CHROMA_STORAGE_KEY,
  SURFACE_HUE_STORAGE_KEY,
} from "@/theme";

/**
 * Root-layout appearance owner for isolated client-component tests.
 *
 * Scheme and style are pinned so a test never inherits the publication's opening choice. The
 * colour coordinates are NOT pinned by default — most tests do not care, and leaving them
 * open keeps them exercising whatever dose.wiki actually opens on. A test that asserts a
 * coordinate's identity should pass the matching `initial*` pin rather than depend on that
 * choice.
 */
export function AppearanceTestProvider({
  children,
  initialSurfaceHue,
  initialAccentHue,
  initialSurfaceChroma,
  initialAccentChroma,
}: PropsWithChildren<{
  /** Integer degrees 0..359; omitted = the site default. */
  initialSurfaceHue?: number;
  initialAccentHue?: number;
  /** Decimal 0..1; omitted = the site default. */
  initialSurfaceChroma?: number;
  initialAccentChroma?: number;
}>) {
  // Seeded as *storage*, once, before the provider mounts: a pin is a saved reader
  // preference, and the provider's hydration pipeline reading it back is exactly the
  // path a real saved value takes. A lazy initializer rather than an effect so the
  // keys exist before ThemeProvider's own mount effect runs.
  useState(() => {
    const pins: Array<[string, number | undefined]> = [
      [SURFACE_HUE_STORAGE_KEY, initialSurfaceHue],
      [ACCENT_HUE_STORAGE_KEY, initialAccentHue],
      [SURFACE_CHROMA_STORAGE_KEY, initialSurfaceChroma],
      [ACCENT_CHROMA_STORAGE_KEY, initialAccentChroma],
    ];
    for (const [key, value] of pins) {
      if (value !== undefined) window.localStorage.setItem(key, String(value));
    }
  });

  return (
    <ThemeProvider initialColorScheme="dark" initialVisualStyle="fun" isVisualStyleLocked={false}>
      {children}
    </ThemeProvider>
  );
}
