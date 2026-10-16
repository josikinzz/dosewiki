import {
  getReplicationsInfoMetadata,
  ReplicationsInfoRoute,
} from "../_components/ReplicationsInfoRoute";

export const revalidate = 3600;

export function generateMetadata() {
  return getReplicationsInfoMetadata();
}

export default function ReplicationsInfoPage() {
  return <ReplicationsInfoRoute />;
}
