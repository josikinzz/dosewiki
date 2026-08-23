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
