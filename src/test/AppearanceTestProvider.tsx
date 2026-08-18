import type { PropsWithChildren } from "react";

import { ThemeProvider } from "@/context/ThemeContext";
import type { AccentId } from "@/theme";

/**
 * Root-layout appearance owner for isolated client-component tests.
 *
 * Scheme and style are pinned so a test never inherits the publication's opening choice. The
 * accent is NOT pinned by default — most tests do not care, and leaving it open keeps them
 * exercising whatever dose.wiki actually opens on. A test that asserts an accent's identity
 * should pass `initialAccent` rather than depend on that choice.
 */
export function AppearanceTestProvider({
  children,
  initialAccent,
}: PropsWithChildren<{ initialAccent?: AccentId }>) {
  return (
    <ThemeProvider
      initialColorScheme="dark"
      initialVisualStyle="fun"
      initialAccent={initialAccent}
      isVisualStyleLocked={false}
    >
      {children}
    </ThemeProvider>
  );
}
