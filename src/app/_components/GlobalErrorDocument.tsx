"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { SITE_FLAVOR } from "@/config/siteFlavor";
import { UiLocaleProvider, useUiLocale } from "@/i18n/client";
import { localeForPathname } from "@/i18n/messages";
import { getInitialAppearance } from "@/theme";
import { RouteErrorPage } from "./RouteErrorPage";

// The Chinese catalog stays out of the English reader's bundle, as in `DocumentRuntime`.
const ChineseMessagesProvider = dynamic(() => import("@/i18n/ChineseMessagesProvider"));
const initialAppearance = getInitialAppearance();

/**
 * The document `global-error.tsx` renders in place of the failed root layout,
 * so it owns `<html>`, `<body>`, and the message context. The segments the
 * locale hook normally reads belong to the layout that failed, so the pathname
 * decides the locale here.
 */
export function GlobalErrorDocument({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const hostLocale = useUiLocale();
  const pathLocale = localeForPathname(usePathname());
  const locale = hostLocale !== "en" ? hostLocale : pathLocale;
  const page = <RouteErrorPage error={error} reset={reset} boundary="global" />;

  return (
    <html
      lang={locale}
      data-site={SITE_FLAVOR}
      data-theme={initialAppearance.colorScheme}
      data-visual-style={initialAppearance.visualStyle}
    >
      <body className="app-container theme-page-shell relative">
        <UiLocaleProvider locale={locale}>
          {locale === "zh-Hans" ? <ChineseMessagesProvider>{page}</ChineseMessagesProvider> : page}
        </UiLocaleProvider>
      </body>
    </html>
  );
}
