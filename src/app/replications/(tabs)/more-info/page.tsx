import {
  getReplicationsInfoMetadata,
  ReplicationsInfoRoute,
} from "../_components/ReplicationsInfoRoute";

// Both blocks on this page are editable copy (Postgres reads), so the segment
// follows the other index pages onto the hourly ISR window; a Copy Studio
// save revalidates it immediately through the shared copy cache tag.
export const revalidate = 3600;

export function generateMetadata() {
  return getReplicationsInfoMetadata();
}

export default function ReplicationsInfoPage() {
  return <ReplicationsInfoRoute />;
}
