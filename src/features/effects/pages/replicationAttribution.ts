import type { ReplicationWithUrl } from '@/types/replications';
import { hasKnownCreator } from '../components/replicationCredit';

/**
 * The one-line attribution a reuser can copy verbatim, or `null` when the work
 * grants no licence to satisfy.
 *
 * Ordered the way attribution notices conventionally read — title, creator,
 * licence — because a licence like CC BY-SA is only satisfied when the credit
 * and the licence name travel together (the licence URL stays in the copyable
 * text for the same reason, even though the licence row already links it).
 * Unlicensed works return `null` rather than a rights-posture sentence: the
 * licence row is that fact's one home, and repeating it here just restated
 * the byline and the posture a few lines below where they already appear.
 */
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
