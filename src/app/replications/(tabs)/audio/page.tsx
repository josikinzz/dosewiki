import {
  getReplicationAudioMetadata,
  ReplicationAudioRoute,
} from "../_components/ReplicationAudioRoute";

export function generateMetadata() {
  return getReplicationAudioMetadata();
}

export default function ReplicationAudioPage() {
  return <ReplicationAudioRoute />;
}
