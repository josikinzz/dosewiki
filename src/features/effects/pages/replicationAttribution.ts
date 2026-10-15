import type { ReplicationWithUrl } from '@/types/replications';
import { hasKnownCreator } from '../components/replicationCredit';

export function buildAttributionLine(replication: ReplicationWithUrl): string | null {
  if (!replication.license_name) return null;

  const title = replication.title?.trim() || 'Untitled';
  const creator = hasKnownCreator(replication.artist)
    ? replication.artist.trim()
    : replication.rightsholder?.trim() || null;

  const credit = creator ? `${title} by ${creator}` : `${title} (creator unknown)`;
  const licence = replication.license_url
    ? `${replication.license_name} (${replication.license_url})`
    : replication.license_name;

  return `${credit}, licensed under ${licence}.`;
}
