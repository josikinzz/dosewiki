import { notFound } from "next/navigation";

import { parseReplicationViewerSlug } from "@/features/replications/galleryUrlState";
import {
  getReplicationsGalleryMetadata,
  ReplicationsGalleryRoute,
} from "../../_components/ReplicationsGalleryRoute";

export const revalidate = 3600;
export const dynamicParams = true;

export function generateStaticParams() {
  return [];
}

type ReplicationViewerPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: ReplicationViewerPageProps) {
  const { slug } = await params;
  return getReplicationsGalleryMetadata(
    parseReplicationViewerSlug(new URLSearchParams({ viewer: slug })),
  );
}

export default async function ReplicationViewerPage({ params }: ReplicationViewerPageProps) {
  const { slug } = await params;
  const viewerSlug = parseReplicationViewerSlug(new URLSearchParams({ viewer: slug }));
  if (!viewerSlug) notFound();
  return <ReplicationsGalleryRoute viewerSlug={viewerSlug} />;
}
