import type { ReplicationType } from "@/types/replications";

/**
 * The frame a slide shows while its first video frame is still arriving:
 * GIFs lead with their motion poster, videos with their thumbnail, stills
 * with the artwork itself. The poster overlays undecoded video and fades
 * once a frame has been presented.
 */
export function slidePosterSource(replication: {
  type: ReplicationType;
  format: string;
  url: string;
  thumbnail_url?: string | null;
  motion_poster_url?: string | null;
}): string | null {
  if (replication.format.toLowerCase() === "gif")
    return replication.motion_poster_url ?? null;
  if (replication.type === "video") return replication.thumbnail_url ?? null;
  return replication.url;
}

/** Full videos and controllable GIF motion keep one source for the whole work. */
export function slideMotionSource(replication: {
  type: ReplicationType;
  format: string;
  url: string;
  motion_url?: string | null;
  motion_poster_url?: string | null;
}): string | null {
  if (replication.format.toLowerCase() === "gif") {
    return replication.motion_url && replication.motion_poster_url
      ? replication.motion_url
      : null;
  }
  return replication.type === "video" ? replication.url : null;
}

/** Loop GIF-like motion and ordinary videos whose known duration is under one minute. */
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
