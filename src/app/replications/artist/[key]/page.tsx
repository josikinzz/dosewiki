import type { Metadata } from "next";

import {
  getReplicationArtistMetadata,
  ReplicationArtistRoute,
} from "./_components/ReplicationArtistRoute";

// See ReplicationArtistRoute for the page's address and rendering contract.
export const revalidate = 3600;
export const dynamicParams = true;

export async function generateStaticParams() {
  // ~2,000+ credited artists would otherwise prerender on every clean deploy.
  // The sitemap still advertises the full roster from the route plan.
  return [];
}

type ArtistFocusPageProps = {
  params: Promise<{ key: string }>;
};

export async function generateMetadata({
  params,
}: ArtistFocusPageProps): Promise<Metadata> {
  const { key } = await params;
  return getReplicationArtistMetadata(key);
}

export default async function ReplicationArtistPage({
  params,
}: ArtistFocusPageProps) {
  const { key } = await params;
  return <ReplicationArtistRoute artistKey={key} />;
}
