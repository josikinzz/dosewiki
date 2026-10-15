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
