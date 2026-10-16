import {
  getReplicationsGalleryMetadata,
  ReplicationsGalleryRoute,
} from "./_components/ReplicationsGalleryRoute";

export const revalidate = 3600;

export function generateMetadata() {
  return getReplicationsGalleryMetadata(null);
}

export default function ReplicationsPage() {
  return <ReplicationsGalleryRoute viewerSlug={null} />;
}
