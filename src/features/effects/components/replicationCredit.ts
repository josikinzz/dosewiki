import type { ReplicationWithUrl } from '@/types/replications';

/**
 * Shared credit / rights helpers for replication media. Used by the theater
 * lightbox and the gallery tiles so attribution reads identically everywhere.
 */

const RIGHTS_STATUS_LABELS: Record<string, string> = {
  'creator-retained': 'Rights remain with the creator or rightsholder.',
  'explicit-license': 'Reuse follows the item-specific license.',
  unknown: 'Reuse terms are unknown; contact the creator or rightsholder before reuse.',
  'permission-granted': 'Displayed with permission; reuse still depends on the creator or rightsholder.',
  'public-domain': 'Marked as public domain.',
};

export function hasKnownCreator(artist?: string | null) {
  return Boolean(artist && artist.trim() && artist.trim().toLowerCase() !== 'unknown');
}

export function getCreatorLabel(replication: Pick<ReplicationWithUrl, 'artist'>) {
  return hasKnownCreator(replication.artist) ? replication.artist : 'Creator unknown';
}

export function getCreditLine(replication: ReplicationWithUrl) {
  if (replication.credit_line) {
    return replication.credit_line;
  }

  return hasKnownCreator(replication.artist)
    ? `${replication.title} by ${replication.artist}`
    : `${replication.title} (creator unknown)`;
}

export function getRightsSummary(replication: ReplicationWithUrl) {
  if (replication.license_name) {
    return `License: ${replication.license_name}.`;
  }

  return RIGHTS_STATUS_LABELS[replication.rights_status ?? 'creator-retained'];
}
