/**
 * Audio-first media rank for every public replication playlist.
 *
 * The immersive viewer walks whatever order a surface assembled, so the
 * default "playlist" experience is decided here: a video with a soundtrack is
 * the richest thing a playlist can open on, silent motion (soundless videos
 * and GIF loops) comes next, and stills close the walk. `has_audio` is stored
 * per row (true = probed and has a track, false = proven silent, absent =
 * never probed); an unprobed video is treated as silent rather than promoted
 * on hope.
 *
 * The rank is deliberately the *primary* key everywhere — it outranks even
 * editor-chosen orders like an effect's `gallery_order` or a contributor's
 * `replicationOrder` — while each surface's existing order survives untouched
 * within a rank (`sortByMediaRank` is stable).
 */

export type MediaRank = 0 | 1 | 2;

export interface MediaRankInput {
  type: string;
  format?: string | null;
  has_audio?: boolean | null;
}

/**
 * 0 — video with a confirmed audio track.
 * 1 — other motion media: silent or unprobed video, or a GIF-format loop.
 * 2 — everything else (stills, and any row the caller could not type).
 */
export function replicationMediaRank(media: MediaRankInput): MediaRank {
  if (media.type === "video") return media.has_audio === true ? 0 : 1;
  return media.format?.toLowerCase() === "gif" ? 1 : 2;
}

/**
 * Stable audio-first sort: rank is the only key, so the caller's incoming
 * order is preserved within each rank. Never mutates the input.
 */
export function sortByMediaRank<T>(
  items: readonly T[],
  pick: (item: T) => MediaRankInput,
): T[] {
  return [...items].sort(
    (a, b) => replicationMediaRank(pick(a)) - replicationMediaRank(pick(b)),
  );
}
