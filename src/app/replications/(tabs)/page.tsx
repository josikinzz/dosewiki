import {
  getReplicationsGalleryMetadata,
  ReplicationsGalleryRoute,
} from "./_components/ReplicationsGalleryRoute";

// Statically prerendered on the hourly window shared by the other index pages.
// This route never reads `searchParams`: the browse filters are client-only,
// and `?viewer=` deep-link documents are rewritten by the middleware to
// `./viewer/[slug]`, which owns the per-work social card.
export const revalidate = 3600;

export function generateMetadata() {
  return getReplicationsGalleryMetadata(null);
}

export default function ReplicationsPage() {
  return <ReplicationsGalleryRoute viewerSlug={null} />;
}
