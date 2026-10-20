import { Suspense } from "react";

import { LiveSearchResultsPage } from "@/components/pages/LiveSearchResultsPage";
import { UiLocaleProvider } from "@/i18n/client"
import { setRequestLocale } from "@/i18n/server";
import { LIVE_LOCALES } from "@server/next/localeHostPolicy";
import { getPublicSearchSuggestions } from "@server/data/publicLibrary";
import { getSearchIndexMetadata, searchQueryFromParam } from "../../search/_components/searchIndexMetadata";

export const revalidate = 3600;

const LOCALE = LIVE_LOCALES["ru.dose.wiki"];

type LocalizedSearchPageProps = {
  searchParams?: Promise<{
    q?: string | string[];
  }>;
};

export async function generateMetadata({ searchParams }: LocalizedSearchPageProps) {
  setRequestLocale(LOCALE.code);
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  return getSearchIndexMetadata(searchQueryFromParam(resolvedSearchParams?.q));
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
