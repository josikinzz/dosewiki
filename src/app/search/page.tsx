import { Suspense } from "react";
import { LiveSearchResultsPage } from "@/components/pages/LiveSearchResultsPage";
import { getSearchIndexMetadata, searchQueryFromParam } from "./_components/searchIndexMetadata";

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

  return (
    <Suspense fallback={null}>
      <LiveSearchResultsPage initialQuery={query} />
    </Suspense>
  );
}
