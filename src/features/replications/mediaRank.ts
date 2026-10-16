export type MediaRank = 0 | 1 | 2;

export interface MediaRankInput {
  type: string;
  format?: string | null;
  has_audio?: boolean | null;
}

export function replicationMediaRank(media: MediaRankInput): MediaRank {
  if (media.type === "video") return media.has_audio === true ? 0 : 1;
  return media.format?.toLowerCase() === "gif" ? 1 : 2;
}

export function sortByMediaRank<T>(
  items: readonly T[],
  pick: (item: T) => MediaRankInput,
): T[] {
  return [...items].sort(
    (a, b) => replicationMediaRank(pick(a)) - replicationMediaRank(pick(b)),
  );
}
