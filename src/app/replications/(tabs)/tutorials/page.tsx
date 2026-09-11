import {
  getReplicationTutorialsMetadata,
  ReplicationTutorialsRoute,
} from "../_components/ReplicationTutorialsRoute";

export function generateMetadata() {
  return getReplicationTutorialsMetadata();
}

export default function ReplicationTutorialsPage() {
  return <ReplicationTutorialsRoute />;
}
