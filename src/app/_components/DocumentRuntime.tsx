"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { ThemeProvider } from "@/context/ThemeContext";
import { getInitialAppearance } from "@/theme";
import { isReplicationEmbedPath } from "@server/next/replicationEmbedPolicy";
import { useUiLocale } from "@/i18n/client";

// The embed does not render this boundary, so neither the editorial provider,
// theme lab nor analytics runtime is fetched by its document.
const PublicDocumentRuntime = dynamic(() => import("./PublicDocumentRuntime"));
// SSR-enabled: translated HTML waits for its active messages, not an English fallback.
const ChineseMessagesProvider = dynamic(() => import("@/i18n/ChineseMessagesProvider"));
const initialAppearance = getInitialAppearance();

export function DocumentRuntime({ children }: { children: ReactNode }) {
  const embed = isReplicationEmbedPath(usePathname());
  const locale = useUiLocale();
  const content = embed ? children : <PublicDocumentRuntime>{children}</PublicDocumentRuntime>;
  return (
    <ThemeProvider initialColorScheme={initialAppearance.colorScheme}
      initialVisualStyle={initialAppearance.visualStyle} isColorSchemePersistent={!embed}>
      {locale === "zh-Hans" ? (
        <ChineseMessagesProvider>{content}</ChineseMessagesProvider>
      ) : content}
    </ThemeProvider>
  );
}
