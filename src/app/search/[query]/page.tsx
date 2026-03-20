import { buildPageMetadata } from "@server/next/metadata";
import { getPublicSearchMatches } from "@server/convex/publicLibrary";
import { LegacyPublicRouteClient } from "../../_components/LegacyPublicRouteClient";

export const revalidate = 3600;

type SearchPageProps = {
  params: Promise<{
    query: string;
  }>;
};

export async function generateMetadata({ params }: SearchPageProps) {
  const { query } = await params;
  const decodedQuery = decodeURIComponent(query);
  const results = await getPublicSearchMatches(decodedQuery, 20);

  return buildPageMetadata({
    title: `Search · ${decodedQuery}`,
    description: `Found ${results.length} matches for ${decodedQuery}.`,
    pathname: `/search/${encodeURIComponent(decodedQuery)}`,
  });
}

export default async function SearchPage({ params }: SearchPageProps) {
  const { query } = await params;
  const decodedQuery = decodeURIComponent(query);

  return <LegacyPublicRouteClient view={{ type: "search", query: decodedQuery }} />;
}
