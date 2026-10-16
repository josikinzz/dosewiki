import type { ReplicationType } from "@/types/replications";

export function slidePosterSource(replication: {
  type: ReplicationType;
  format: string;
  url: string;
  thumbnail_url?: string | null;
  motion_poster_url?: string | null;
}): string | null {
  if (replication.type === "audio") return null;
  if (replication.format.toLowerCase() === "gif")
    return replication.motion_poster_url ?? null;
  if (replication.type === "video") return replication.thumbnail_url ?? null;
  return replication.url;
}

export function slideMotionSource(replication: {
  type: ReplicationType;
  format: string;
  url: string;
  motion_url?: string | null;
  motion_poster_url?: string | null;
}): string | null {
  if (replication.type === "audio") return null;
  if (replication.format.toLowerCase() === "gif") {
    return replication.motion_url && replication.motion_poster_url
      ? replication.motion_url
      : null;
  }
  return replication.type === "video" ? replication.url : null;
}

export function shouldLoopReplicationMotion(
  format: string,
  duration: number | null | undefined,
): boolean {
  return (
    format.toLowerCase() === "gif" ||
    (Number.isFinite(duration) &&
      duration !== undefined &&
      duration !== null &&
      duration < 60)
  );
}
