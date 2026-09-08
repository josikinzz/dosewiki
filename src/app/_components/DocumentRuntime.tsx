"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { ThemeProvider } from "@/context/ThemeContext";
import { getInitialAppearance } from "@/theme";
import { isReplicationEmbedPath } from "@server/next/replicationEmbedPolicy";

// The embed does not render this boundary, so neither the editorial provider,
// theme lab nor analytics runtime is fetched by its document.
const PublicDocumentRuntime = dynamic(() => import("./PublicDocumentRuntime"));
const initialAppearance = getInitialAppearance();

export function DocumentRuntime({ children }: { children: ReactNode }) {
  const embed = isReplicationEmbedPath(usePathname());
  return (
    <ThemeProvider initialColorScheme={initialAppearance.colorScheme}
      initialVisualStyle={initialAppearance.visualStyle} isColorSchemePersistent={!embed}>
      {embed ? children : <PublicDocumentRuntime>{children}</PublicDocumentRuntime>}
    </ThemeProvider>
  );
}
