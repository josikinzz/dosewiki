import type {
  AudioReplicationMetadata,
  ReplicationWithUrl,
} from "@/types/replications";

export interface AudioReplicationIndexEntry {
  effectSlug: string;
  effectName: string;
  audio: AudioReplicationMetadata;
}

interface AudioReplicationSource {
  slug: string;
  name: string;
  audio_replications?: AudioReplicationMetadata[];
}

/**
 * Project a stored audio replication onto the shape the audio card renders.
 *
 * `AudioReplicationMetadata` and `ReplicationRecord` already share
 * `ReplicationRightsMetadata`, so this is a narrowing rather than a
 * translation: the rights fields carry across unchanged and the resolved media
 * URL becomes the clip's `resource`. Spelled out field by field rather than
 * spread, for the same reason as `projectPublicGalleryReplicationPreview` —
 * storage IDs, taxonomy and provenance have no reader on this surface, and
 * these entries serialize into the RSC payload of every page that lists them.
 */
export function audioReplicationFromRow(
  row: ReplicationWithUrl,
): AudioReplicationMetadata {
  return {
    title: row.title,
    artist: row.artist,
    ...(row.artist_url ? { artist_url: row.artist_url } : {}),
    resource: row.url,
    ...(row.rights_status ? { rights_status: row.rights_status } : {}),
    ...(row.license_name ? { license_name: row.license_name } : {}),
    ...(row.license_url ? { license_url: row.license_url } : {}),
    ...(row.credit_line ? { credit_line: row.credit_line } : {}),
    ...(row.source_url ? { source_url: row.source_url } : {}),
    ...(row.rightsholder ? { rightsholder: row.rightsholder } : {}),
    ...(row.permission_notes ? { permission_notes: row.permission_notes } : {}),
    ...(row.removal_contact ? { removal_contact: row.removal_contact } : {}),
  };
}

/**
 * Flattens every effect's audio replications into one list for the audio index.
 * Clips without a playable resource are dropped rather than rendered as an
 * empty player.
 *
 * Two sources feed this, because audio arrived in the archive twice. The
 * originals are inline `subjectiveEffects.audio_replications` clips served from
 * `public/audio/`; the second wave are `type: "audio"` rows in the
 * `replications` table, which carry their own rights metadata and a permalink.
 * A stored row wins over an inline clip with the same effect and title: it is
 * the same recording with more provenance attached, so listing both would show
 * one clip twice.
 *
 * A stored row with no owning effect is not listed here. This index is
 * organised by effect and every entry's context link points at one — the same
 * reason the homepage carousel skips an unattached row — and such a row still
 * reaches readers through its permalink and `/api/v1/replications`.
 */
export function collectAudioReplications(
  effects: readonly AudioReplicationSource[],
  storedRows: readonly ReplicationWithUrl[] = [],
): AudioReplicationIndexEntry[] {
  const effectNameBySlug = new Map(
    effects.map((effect) => [effect.slug, effect.name]),
  );
  const entries: AudioReplicationIndexEntry[] = [];
  const storedClipKeys = new Set<string>();

  for (const row of storedRows) {
    // Rows carry `effect_slug: "unknown"` when nothing real is attached.
    const effectSlug = row.effect_slug;
    if (!row.url?.trim() || !effectSlug || effectSlug === "unknown") {
      continue;
    }

    storedClipKeys.add(`${effectSlug}\u0000${row.title.trim().toLowerCase()}`);
    entries.push({
      effectSlug,
      effectName:
        effectNameBySlug.get(effectSlug) ?? effectSlug.replace(/-/g, " "),
      audio: audioReplicationFromRow(row),
    });
  }

  for (const effect of effects) {
    for (const audio of effect.audio_replications ?? []) {
      if (!audio?.resource?.trim()) {
        continue;
      }
      if (
        storedClipKeys.has(
          `${effect.slug}\u0000${audio.title.trim().toLowerCase()}`,
        )
      ) {
        continue;
      }

      entries.push({ effectSlug: effect.slug, effectName: effect.name, audio });
    }
  }

  return entries.sort(
    (left, right) =>
      left.effectName.localeCompare(right.effectName) ||
      left.audio.title.localeCompare(right.audio.title),
  );
}

export function countAudioReplicationArtists(entries: readonly AudioReplicationIndexEntry[]): number {
  return new Set(
    entries
      .map((entry) => entry.audio.artist?.trim().toLowerCase())
      .filter((artist): artist is string => Boolean(artist) && artist !== "unknown"),
  ).size;
}
