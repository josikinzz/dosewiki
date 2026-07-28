import type { AudioReplicationMetadata } from "@/types/replications";

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
 * Flattens every effect's audio replications into one list for the audio index.
 * Clips without a playable resource are dropped rather than rendered as an
 * empty player.
 */
export function collectAudioReplications(
  effects: readonly AudioReplicationSource[],
): AudioReplicationIndexEntry[] {
  const entries: AudioReplicationIndexEntry[] = [];

  for (const effect of effects) {
    for (const audio of effect.audio_replications ?? []) {
      if (!audio?.resource?.trim()) {
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
