import { Suspense } from "react";
import { buildPageMetadata } from "@server/next/metadata";
import { LiveSearchResultsPage } from "@/components/pages/LiveSearchResultsPage";

export const revalidate = 3600;

type SearchIndexPageProps = {
  searchParams?: Promise<{
    q?: string | string[];
  }>;
};

const getSearchQuery = (value: string | string[] | undefined) => {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw?.trim() ?? "";
};

export async function generateMetadata({ searchParams }: SearchIndexPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const query = getSearchQuery(resolvedSearchParams?.q);

  return buildPageMetadata({
    title: query ? `Search · ${query}` : "Search",
    description: query
      ? `Search dose.wiki for substances, effects, reports, and profiles matching ${query}.`
      : "Search dose.wiki for substances, effects, reports, and profiles.",
    pathname: "/search",
    noIndex: true,
  });
}

export default async function SearchIndexPage({ searchParams }: SearchIndexPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const query = getSearchQuery(resolvedSearchParams?.q);

  return (
    <Suspense fallback={null}>
      <LiveSearchResultsPage initialQuery={query} />
    </Suspense>
  );
}
