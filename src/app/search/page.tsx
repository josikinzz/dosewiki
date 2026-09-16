import { Suspense } from "react";
import { LiveSearchResultsPage } from "@/components/pages/LiveSearchResultsPage";
import { getSearchIndexMetadata, searchQueryFromParam } from "./_components/searchIndexMetadata";
import { getPublicSearchSuggestions } from "@server/data/publicLibrary";

export const revalidate = 3600;

type SearchIndexPageProps = {
  searchParams?: Promise<{
    q?: string | string[];
  }>;
};

export async function generateMetadata({ searchParams }: SearchIndexPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  return getSearchIndexMetadata(searchQueryFromParam(resolvedSearchParams?.q));
}

export default async function SearchIndexPage({ searchParams }: SearchIndexPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const query = searchQueryFromParam(resolvedSearchParams?.q);
  const initialResults = query
    ? await getPublicSearchSuggestions(query, 60, "en")
    : [];

  return (
    <Suspense fallback={null}>
      <LiveSearchResultsPage initialQuery={query} initialResults={initialResults} />
    </Suspense>
  );
}
