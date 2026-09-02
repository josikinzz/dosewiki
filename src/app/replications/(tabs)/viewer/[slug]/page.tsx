import { notFound } from "next/navigation";

import { parseReplicationViewerSlug } from "@/features/replications/galleryUrlState";
import {
  getReplicationsGalleryMetadata,
  ReplicationsGalleryRoute,
} from "../../_components/ReplicationsGalleryRoute";

// The middleware's rewrite target for `/replications?viewer=<slug>` document
// requests (see `getReplicationViewerRewriteUrl`). It renders the same static
// gallery page with the linked work's social card and, when that work lies
// beyond the prerendered rails, the work itself in the initial payload. Each
// shared slug enters the hourly ISR cache on first request, so the gallery
// index itself stays fully static while deep links still unfurl correctly.
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
  // Only the middleware addresses this route, and it forwards only slugs that
  // already pass the viewer-param grammar; anything else is a hand-typed URL.
  if (!viewerSlug) notFound();
  return <ReplicationsGalleryRoute viewerSlug={viewerSlug} />;
}
