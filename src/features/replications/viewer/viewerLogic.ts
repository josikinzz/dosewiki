import type { ReplicationType } from "@/types/replications";

/** Pure media decisions shared by every replication stage. */

/** Aspect assumed for media whose intrinsic size hasn't arrived yet. */
export const FALLBACK_IMAGE_RATIO = 4 / 3;
export const FALLBACK_VIDEO_RATIO = 16 / 9;

/**
 * The aspect the crop math runs against, by trust order: a ratio probed from
 * the loaded media itself beats the catalogued dimensions (rows imported
 * before dimensions were recorded lack them, and a few carry stale ones),
 * which beat the per-type guess. The guess only positions the first paint —
 * degenerate inputs must resolve to *something* rather than crop on NaN.
 */
export function resolveMediaAspect(
  type: ReplicationType,
  width: number | null | undefined,
  height: number | null | undefined,
  probed?: number,
): number {
  if (probed !== undefined && Number.isFinite(probed) && probed > 0)
    return probed;
  if (width && height && width > 0 && height > 0) return width / height;
  return type === "video" ? FALLBACK_VIDEO_RATIO : FALLBACK_IMAGE_RATIO;
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

/** localStorage key remembering that the swipe onboarding hint was shown. */
export const GESTURE_HINT_STORAGE_KEY = "replication-viewer-gesture-hint";

/**
 * Show the one-time swipe tutor only where swiping is the input model
 * (coarse pointers) and only until it has been shown once on this device.
 */
export function shouldShowGestureHint(
  stored: string | null,
  coarsePointer: boolean,
): boolean {
  return coarsePointer && stored === null;
}

/**
 * The frame a neighboring work shows while parked beside the stage: exactly
 * the source its own stage will paint first, so the swap lands on a warm,
 * identical image. GIFs lead with their motion poster, videos with their
 * thumbnail, stills with the artwork itself.
 */
export function standbyPosterSource(replication: {
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
