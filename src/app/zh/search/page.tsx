/**
 * The Simplified Chinese mirror of `/search`, reached only through the
 * middleware rewrite from `zh.dose.wiki/search?q=...` (the query survives the
 * rewrite). Same live results component; the mirror sets the request locale
 * so the chrome, the titles, and the client-fetched result labels resolve
 * Chinese, and it carries `noindex` with a canonical link back to the English
 * search page.
 */
import { Suspense } from "react";

import { LiveSearchResultsPage } from "@/components/pages/LiveSearchResultsPage";
import { SITE_FLAVOR_CONFIG } from "@/config/siteFlavor";
import { UiLocaleProvider } from "@/i18n/client"
import { setRequestLocale, t } from "@/i18n/server";
import { LIVE_LOCALES } from "@server/next/localeHostPolicy";
import { buildPageMetadata } from "@server/next/metadata";
import { getPublicSearchSuggestions } from "@server/data/publicLibrary";

export const revalidate = 3600;

const LOCALE = LIVE_LOCALES["zh.dose.wiki"];

type LocalizedSearchPageProps = {
  searchParams?: Promise<{
    q?: string | string[];
  }>;
};

const searchQueryFromParam = (value: string | string[] | undefined) => {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw?.trim() ?? "";
};

export async function generateMetadata({ searchParams }: LocalizedSearchPageProps) {
  setRequestLocale(LOCALE.code);
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const query = searchQueryFromParam(resolvedSearchParams?.q);
  return buildPageMetadata({
    title: query ? t('Search Results for "{{query}}"', { query }) : t("Search"),
    description: query
      ? t(
          "Search {{siteName}} for substances, effects, reports, and profiles matching {{query}}.",
          { siteName: SITE_FLAVOR_CONFIG.name, query },
        )
      : t("Search {{siteName}} for substances, effects, reports, and profiles.", {
          siteName: SITE_FLAVOR_CONFIG.name,
        }),
    pathname: "/search",
    noIndex: true,
  });
}

export default async function LocalizedSearchPage({ searchParams }: LocalizedSearchPageProps) {
  setRequestLocale(LOCALE.code);
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const query = searchQueryFromParam(resolvedSearchParams?.q);
  const initialResults = query
    ? await getPublicSearchSuggestions(query, 60, LOCALE.code)
    : [];

  return (
    <UiLocaleProvider locale={LOCALE.code}>
      <div lang={LOCALE.htmlLang}>
        <Suspense fallback={null}>
          <LiveSearchResultsPage initialQuery={query} initialResults={initialResults} />
        </Suspense>
      </div>
    </UiLocaleProvider>
  );
}
