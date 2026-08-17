import type { PropsWithChildren } from "react";

import { ThemeProvider } from "@/context/ThemeContext";

/** Root-layout appearance owner for isolated client-component tests. */
export function AppearanceTestProvider({ children }: PropsWithChildren) {
  return (
    <ThemeProvider initialColorScheme="dark" initialVisualStyle="fun" isVisualStyleLocked={false}>
      {children}
    </ThemeProvider>
  );
}
