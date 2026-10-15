import { formatMessage, msg, type Translate } from '@/i18n/messages';
import type { ReplicationWithUrl } from '@/types/replications';

const RIGHTS_STATUS_LABELS: Record<string, string> = {
  'creator-retained': msg('Rights remain with the creator or rightsholder.'),
  'explicit-license': msg('Reuse follows the item-specific license.'),
  unknown: msg('Reuse terms are unknown; contact the creator or rightsholder before reuse.'),
  'permission-granted': msg('Displayed with permission; reuse still depends on the creator or rightsholder.'),
  'public-domain': msg('Marked as public domain.'),
};

const UNATTRIBUTED_CREDIT_MARKERS: Record<string, true> = {
  unknown: true,
  "unknown artist": true,
  anonymous: true,
};

export function hasKnownCreator(artist?: string | null) {
  const marker = artist?.trim().toLowerCase();
  return Boolean(marker && !UNATTRIBUTED_CREDIT_MARKERS[marker]);
}

export function getCreatorByline(
  replication: Pick<ReplicationWithUrl, 'artist'>,
  translate: Translate = formatMessage,
) {
  return hasKnownCreator(replication.artist)
    ? translate(msg('by {{artist}}'), { artist: replication.artist! })
    : translate(msg('Creator unknown'));
}

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
