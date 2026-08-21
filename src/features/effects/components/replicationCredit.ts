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

/**
 * Credit lines that mark the *absence* of an attributable creator rather than
 * naming one. "Unknown" is the corpus's empty-credit marker; "Anonymous" is
 * the marker contributor profile whose works fold into the Unattributed
 * bucket (T-1) — the word must never render as a creator on replication
 * surfaces. "Various artists" and "Midjourney" are markers too, but there the
 * marker *is* the credit, so they stay known creators with their own sections.
 */
const UNATTRIBUTED_CREDIT_MARKERS: Record<string, true> = {
  unknown: true,
  anonymous: true,
};

export function hasKnownCreator(artist?: string | null) {
  const marker = artist?.trim().toLowerCase();
  return Boolean(marker && !UNATTRIBUTED_CREDIT_MARKERS[marker]);
}

/**
 * Byline for tile overlays and captions: "by <artist>" when the creator is
 * known, "Creator unknown" otherwise — callers must not prepend their own
 * "by", or unknown creators read as "by Creator unknown".
 */
export function getCreatorByline(replication: Pick<ReplicationWithUrl, 'artist'>) {
  return hasKnownCreator(replication.artist) ? `by ${replication.artist}` : 'Creator unknown';
}

/**
 * Credit sentence for the lightbox caption, which already renders the title
 * on its own line — the fallback deliberately avoids repeating it.
 */
export function getCaptionCredit(replication: ReplicationWithUrl) {
  const credit = replication.credit_line?.trim();
  if (credit) {
    return /[.!?]$/.test(credit) ? credit : `${credit}.`;
  }

  return hasKnownCreator(replication.artist)
    ? `By ${replication.artist}.`
    : 'Creator unknown.';
}

export function getRightsSummary(replication: ReplicationWithUrl) {
  if (replication.license_name) {
    return `License: ${replication.license_name}.`;
  }

  return RIGHTS_STATUS_LABELS[replication.rights_status ?? 'creator-retained'];
}

function hostOf(url?: string | null) {
  if (!url) return null;
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * A `source_url` only earns a "Source" link when it points somewhere other than
 * the file we are already showing. Much of the corpus was backfilled with the
 * asset's own CDN location, which makes "Source" a link back to the same image —
 * a dead affordance that looks broken next to a real credit block.
 */
export function getExternalSourceUrl(replication: ReplicationWithUrl): string | null {
  const source = replication.source_url?.trim();
  if (!source) return null;

  const sourceHost = hostOf(source);
  if (!sourceHost) return null;

  if (source === replication.url) return null;
  if (sourceHost === hostOf(replication.url)) return null;
  if (sourceHost === hostOf(replication.thumbnail_url)) return null;

  return source;
}
