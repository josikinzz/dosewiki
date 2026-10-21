"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { SITE_FLAVOR } from "@/config/siteFlavor";
import { UiLocaleProvider, useUiLocale } from "@/i18n/client";
import { htmlLanguage, localeForPathname } from "@/i18n/messages";
import { getInitialAppearance } from "@/theme";
import { RouteErrorPage } from "./RouteErrorPage";

const ChineseMessagesProvider = dynamic(() => import("@/i18n/ChineseMessagesProvider"));
const initialAppearance = getInitialAppearance();

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
      lang={htmlLanguage(locale)}
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
