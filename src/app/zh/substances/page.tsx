/**
 * The Simplified Chinese mirror of `/substances`, reached only through the
 * middleware rewrite from `zh.dose.wiki/substances`. Same index component and
 * loaders; the mirror carries `noindex` with a canonical link back to the
 * English index, and its UI strings render through the catalog with English
 * fallbacks.
 */
import { UiLocaleProvider } from "@/i18n/client"
import { setRequestLocale } from "@/i18n/server";
import { LIVE_LOCALES } from "@server/next/localeHostPolicy";
import { SUBSTANCE_INDEX_DEFAULT_VIEW, substanceIndexViewPath } from "@/utils/indexViewRoutes";
import {
  getSubstancesIndexMetadata,
  SubstancesIndexRoute,
} from "../../substances/_components/SubstancesIndexRoute";

export const revalidate = 3600;

const LOCALE = LIVE_LOCALES["zh.dose.wiki"];

const ENGLISH_PATHNAME = substanceIndexViewPath(SUBSTANCE_INDEX_DEFAULT_VIEW);

export async function generateMetadata() {
  setRequestLocale(LOCALE.code);
  return getSubstancesIndexMetadata(ENGLISH_PATHNAME, {
    noIndex: true,
    canonicalPathname: ENGLISH_PATHNAME,
  });
}

export default async function LocalizedSubstancesPage() {
  setRequestLocale(LOCALE.code);

  return (
    <UiLocaleProvider locale={LOCALE.code}>
      <div lang={LOCALE.htmlLang}>
        <SubstancesIndexRoute
          initialView={SUBSTANCE_INDEX_DEFAULT_VIEW}
          pathname={ENGLISH_PATHNAME}
        />
      </div>
    </UiLocaleProvider>
  );
}