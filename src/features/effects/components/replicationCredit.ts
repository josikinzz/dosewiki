import { formatMessage, msg, type Translate } from '@/i18n/messages';
import type { ReplicationWithUrl } from '@/types/replications';

/**
 * Shared credit / rights helpers for replication media. Used by the theater
 * lightbox and the gallery tiles so attribution reads identically everywhere.
 * Each helper that composes reader-visible text takes the rendering surface's
 * `t` as `translate`, defaulting to English formatting.
 */

const RIGHTS_STATUS_LABELS: Record<string, string> = {
  'creator-retained': msg('Rights remain with the creator or rightsholder.'),
  'explicit-license': msg('Reuse follows the item-specific license.'),
  unknown: msg('Reuse terms are unknown; contact the creator or rightsholder before reuse.'),
  'permission-granted': msg('Displayed with permission; reuse still depends on the creator or rightsholder.'),
  'public-domain': msg('Marked as public domain.'),
};

/**
 * Credit lines that mark the *absence* of an attributable creator rather than
 * naming one. "Unknown" is the corpus's empty-credit marker; "Unknown Artist"
 * is the Reddit-intake marker for missing or deleted posters (see
 * `server/lib/replicationAttribution.ts`, and `NON_PROFILE_IDENTITIES` in
 * `server/lib/contributorProfileImports.ts`); "Anonymous" is the marker
 * contributor profile whose works fold into the Unattributed bucket (T-1) —
 * the word must never render as a creator on replication surfaces. "Various
 * artists" and "Midjourney" are markers too, but there the marker *is* the
 * credit, so they stay known creators with their own sections.
 */
const UNATTRIBUTED_CREDIT_MARKERS: Record<string, true> = {
  unknown: true,
  "unknown artist": true,
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
export function getCreatorByline(
  replication: Pick<ReplicationWithUrl, 'artist'>,
  translate: Translate = formatMessage,
) {
  return hasKnownCreator(replication.artist)
    ? translate(msg('by {{artist}}'), { artist: replication.artist! })
    : translate(msg('Creator unknown'));
}

/**
 * Credit sentence for the lightbox caption, which already renders the title
 * on its own line — the fallback deliberately avoids repeating it.
 */
export function getCaptionCredit(replication: ReplicationWithUrl, translate: Translate = formatMessage) {
  const credit = replication.credit_line?.trim();
  if (credit) {
    return /[.!?]$/.test(credit) ? credit : `${credit}.`;
  }

  return hasKnownCreator(replication.artist)
    ? translate(msg('By {{artist}}.'), { artist: replication.artist! })
    : translate(msg('Creator unknown.'));
}

export function getRightsSummary(replication: ReplicationWithUrl, translate: Translate = formatMessage) {
  if (replication.license_name) {
    return translate(msg('License: {{name}}.'), { name: replication.license_name });
  }

  return translate(RIGHTS_STATUS_LABELS[replication.rights_status ?? 'creator-retained']);
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
