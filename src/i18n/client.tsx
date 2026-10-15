"use client";

import { createContext, useCallback, useContext, type ReactNode } from "react";
import { useSelectedLayoutSegments } from "next/navigation";
import { formatMessage, localeForPathname, parseUiLocale, type MessageValues, type UiLocale } from "./messages";
import { PUBLIC_LOCALES } from "./localeRegistry.mjs";
import { resolveUiMessage } from "./uiMessageDefinitions";

const UiLocaleContext = createContext<UiLocale | null>(null);
const UiMessageLocaleContext = createContext<string | null>(null);
const UiMessagesContext = createContext<Readonly<Record<string, string>>>({});

export function UiMessagesProvider({ messages, locale, children }: {
  messages: Readonly<Record<string, string>>;
  locale?: string;
  children: ReactNode;
}) {
  const inheritedLocale = useContext(UiMessageLocaleContext);
  return <UiMessageLocaleContext.Provider value={locale ?? inheritedLocale}>
    <UiMessagesContext.Provider value={messages}>{children}</UiMessagesContext.Provider>
  </UiMessageLocaleContext.Provider>;
}

export function UiLocaleProvider({ locale, children }: { locale: UiLocale; children: ReactNode }) {
  return <UiLocaleContext.Provider value={locale}>{children}</UiLocaleContext.Provider>;
}

export function useUiLocale(): UiLocale {
  const provided = useContext(UiLocaleContext);
  const segments = useSelectedLayoutSegments() as string[] | null;
  if (provided) return provided;
  if (typeof window !== "undefined") {
    const hostLocale = PUBLIC_LOCALES.find((entry) => entry.publicHost === window.location.hostname);
    if (hostLocale) return parseUiLocale(hostLocale.code);
  }
  return segments ? localeForPathname(`/${segments.join("/")}`) : "en";
}

export function useT(): (text: string, values?: MessageValues) => string {
  const siteLocale = useUiLocale();
  const locale = useContext(UiMessageLocaleContext) ?? siteLocale;
  const messages = useContext(UiMessagesContext);
  return useCallback(
    (text: string, values?: MessageValues) =>
      formatMessage(resolveUiMessage(locale === "en" ? undefined : messages, text), values),
    [locale, messages],
  );
}

export { msg } from "./messages";
export type { UiLocale, Translate, MessageValues } from "./messages";
