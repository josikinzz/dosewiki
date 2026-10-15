import type { Metadata } from "next";

import {
  getReplicationArtistMetadata,
  ReplicationArtistRoute,
} from "./_components/ReplicationArtistRoute";

export const revalidate = 3600;
export const dynamicParams = true;

export async function generateStaticParams() {
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
