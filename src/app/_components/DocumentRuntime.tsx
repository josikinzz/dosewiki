"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { ThemeProvider } from "@/context/ThemeContext";
import { getInitialAppearance } from "@/theme";
import { isReplicationEmbedPath } from "@server/next/replicationEmbedPolicy";
import { useUiLocale } from "@/i18n/client";

const PublicDocumentRuntime = dynamic(() => import("./PublicDocumentRuntime"));
const ChineseMessagesProvider = dynamic(() => import("@/i18n/ChineseMessagesProvider"));
const RussianMessagesProvider = dynamic(() => import("@/i18n/RussianMessagesProvider"));
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
      ) : locale === "ru" ? (
        <RussianMessagesProvider>{content}</RussianMessagesProvider>
      ) : content}
    </ThemeProvider>
  );
}
