/**
 * The Simplified Chinese mirror of `/reports`, reached only through the
 * middleware rewrite from `zh.dose.wiki/reports`. Same index component over
 * the localized report previews; the mirror carries `noindex` with a
 * canonical link back to the English index.
 */
import { UiLocaleProvider } from "@/i18n/client"
import { setRequestLocale } from "@/i18n/server";
import { LIVE_LOCALES } from "@server/next/localeHostPolicy";
import { REPORTS_INDEX_DEFAULT_VIEW, reportsIndexViewPath } from "@/utils/indexViewRoutes";
import {
  getReportsIndexMetadata,
  ReportsIndexRoute,
} from "../../reports/_components/ReportsIndexRoute";

export const revalidate = 3600;

const LOCALE = LIVE_LOCALES["zh.dose.wiki"];

const ENGLISH_PATHNAME = reportsIndexViewPath(REPORTS_INDEX_DEFAULT_VIEW);

export async function generateMetadata() {
  setRequestLocale(LOCALE.code);
  return getReportsIndexMetadata(ENGLISH_PATHNAME, {
    noIndex: true,
    canonicalPathname: ENGLISH_PATHNAME,
    locale: LOCALE,
  });
}

export default async function LocalizedReportsPage() {
  setRequestLocale(LOCALE.code);

  return (
    <UiLocaleProvider locale={LOCALE.code}>
      <div lang={LOCALE.htmlLang}>
        <ReportsIndexRoute
          initialView={REPORTS_INDEX_DEFAULT_VIEW}
          pathname={ENGLISH_PATHNAME}
          locale={LOCALE}
        />
      </div>
    </UiLocaleProvider>
  );
}