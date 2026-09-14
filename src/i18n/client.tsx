"use client";

import { createContext, useCallback, useContext, type ReactNode } from "react";
import { useSelectedLayoutSegments } from "next/navigation";
import { localeForPathname, translateMessage, type MessageValues, type UiLocale } from "./messages";
import { LOCALE_REGISTRY } from "./localeRegistry.mjs";

const UiLocaleContext = createContext<UiLocale | null>(null);

/** Rendered by a localized page around its subtree. */
export function UiLocaleProvider({ locale, children }: { locale: UiLocale; children: ReactNode }) {
  return <UiLocaleContext.Provider value={locale}>{children}</UiLocaleContext.Provider>;
}

export function useUiLocale(): UiLocale {
  const provided = useContext(UiLocaleContext);
  const segments = useSelectedLayoutSegments() as string[] | null;
  if (provided) return provided;
  if (typeof window !== "undefined" && window.location.hostname.toLowerCase() === LOCALE_REGISTRY["zh-Hans"].publicHost) {
    return "zh-Hans";
  }
  return segments ? localeForPathname(`/${segments.join("/")}`) : "en";
}

/** `t("English literal")` for client components. */
export function useT(): (text: string, values?: MessageValues) => string {
  const locale = useUiLocale();
  return useCallback((text: string, values?: MessageValues) => translateMessage(locale, text, values), [locale]);
}

export { msg } from "./messages";
export type { UiLocale, Translate, MessageValues } from "./messages";
