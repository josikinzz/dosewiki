"use client";

import { createContext, useCallback, useContext, type ReactNode } from "react";
import { useSelectedLayoutSegments } from "next/navigation";
import { localeForPathname, translateMessage, type MessageValues, type UiLocale } from "./messages";

const UiLocaleContext = createContext<UiLocale | null>(null);

/** Rendered by a localized page around its subtree. */
export function UiLocaleProvider({ locale, children }: { locale: UiLocale; children: ReactNode }) {
  return <UiLocaleContext.Provider value={locale}>{children}</UiLocaleContext.Provider>;
}

/**
 * The UI locale a client component renders in. Inside a localized page the
 * provider decides. The root chrome sits above every page, so it reads the
 * matched route tree instead: the mirror is reached through a middleware
 * rewrite, so `usePathname()` still reports the browser URL (`/2c-b`), while
 * the layout segments carry the `/zh` prefix on the server render and on
 * hydration alike. Both are `null`-safe for trees outside the app router.
 */
export function useUiLocale(): UiLocale {
  const provided = useContext(UiLocaleContext);
  const segments = useSelectedLayoutSegments() as string[] | null;
  if (provided) return provided;
  return segments ? localeForPathname(`/${segments.join("/")}`) : "en";
}

/** `t("English literal")` for client components. */
export function useT(): (text: string, values?: MessageValues) => string {
  const locale = useUiLocale();
  return useCallback((text: string, values?: MessageValues) => translateMessage(locale, text, values), [locale]);
}

export { msg } from "./messages";
export type { UiLocale, Translate, MessageValues } from "./messages";
