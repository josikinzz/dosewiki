import { buildPageMetadata } from "@server/next/metadata";
import { getPublicSearchMatches } from "@server/convex/publicLibrary";
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
  const results = await getPublicSearchMatches(decodedQuery, 20);

  return <SearchResultsPage query={decodedQuery} results={results} />;
}
