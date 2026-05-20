import { buildPageMetadata } from "@server/next/metadata";
import { getSearchRouteOutcome } from "@server/next/publicRouteOutcomes";
import { SearchResultsPage } from "@/components/pages/SearchResultsPage";

export const revalidate = 3600;

type SearchPageProps = {
  params: Promise<{
    query: string;
  }>;
};

export async function generateMetadata({ params }: SearchPageProps) {
  const { query } = await params;
  const decodedQuery = decodeURIComponent(query);

  return buildPageMetadata({
    title: `Search · ${decodedQuery}`,
    description: `Search dose.wiki for substances, effects, and categories matching ${decodedQuery}.`,
    pathname: `/search/${encodeURIComponent(decodedQuery)}`,
  });
}

export default async function SearchPage({ params }: SearchPageProps) {
  const { query } = await params;
  const decodedQuery = decodeURIComponent(query);
  const outcome = await getSearchRouteOutcome(decodedQuery, 20);

  return (
    <SearchResultsPage
      query={decodedQuery}
      results={outcome.results}
      emptyState={outcome.state === "found" ? undefined : outcome.emptyState}
    />
  );
}
