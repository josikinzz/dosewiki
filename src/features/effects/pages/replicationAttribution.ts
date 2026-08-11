import type { ReplicationWithUrl } from '@/types/replications';
import { hasKnownCreator } from '../components/replicationCredit';

/**
 * The one-line attribution a reuser can copy verbatim.
 *
 * Ordered the way attribution notices conventionally read — title, creator,
 * licence — because a licence like CC BY-SA is only satisfied when the credit
 * and the licence name travel together. Falls back to the rights posture when no
 * explicit licence is set, so the line never implies reuse is permitted.
 */
export function buildAttributionLine(replication: ReplicationWithUrl): string {
  const title = replication.title?.trim() || 'Untitled';
  const creator = hasKnownCreator(replication.artist)
    ? replication.artist.trim()
    : replication.rightsholder?.trim() || null;

  const credit = creator ? `${title} by ${creator}` : `${title} (creator unknown)`;

  if (replication.license_name) {
    const licence = replication.license_url
      ? `${replication.license_name} (${replication.license_url})`
      : replication.license_name;

    return `${credit}, licensed under ${licence}.`;
  }

  return `${credit}. Rights remain with the creator or rightsholder; contact them before reuse.`;
}
