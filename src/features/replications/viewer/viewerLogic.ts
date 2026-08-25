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

/** sessionStorage key remembering the reader's viewer sound choice. */
export const VIEWER_SOUND_STORAGE_KEY = "replication-viewer-sound";

/**
 * Muted unless this session explicitly turned sound on — the reels default.
 * Any unreadable or unrecognised value falls back to muted, never to sound.
 */
export function resolveViewerMuted(stored: string | null): boolean {
  return stored !== "on";
}

/** sessionStorage key remembering the reader's sticky rotate-mode choice. */
export const VIEWER_ROTATE_STORAGE_KEY = "replication-viewer-rotate";

/**
 * Rotate mode is off unless this session explicitly turned it on — the same
 * contract as sound. Any unreadable or unrecognised value lands upright.
 */
export function resolveViewerRotateMode(stored: string | null): boolean {
  return stored === "on";
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

/**
 * The motion file a neighboring work's stage will play, for warming while it
 * is still parked beside the stage: mirrors the stage's source choice — GIFs
 * play their controllable rendition only once both motion assets exist,
 * videos play their catalogued file, stills play nothing.
 */
export function standbyMotionSource(replication: {
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
  if (replication.type === "video") return replication.url;
  return null;
}

/** The slice of TimeRanges the seek bar reads; matches the DOM interface. */
export interface PlayableRanges {
  length: number;
  start(index: number): number;
  end(index: number): number;
}

/**
 * The buffered stretch the playhead currently rides, or null while nothing
 * around it is loaded. Only this range is painted on the seek bar — the
 * YouTube grammar: gray shows how far ahead this playback can reach, not
 * every disjoint fragment ever fetched.
 */
export function bufferedRangeContaining(
  buffered: PlayableRanges,
  currentTime: number,
): { start: number; end: number } | null {
  for (let index = 0; index < buffered.length; index += 1) {
    const start = buffered.start(index);
    const end = buffered.end(index);
    if (currentTime >= start && currentTime <= end) return { start, end };
  }
  return null;
}

/**
 * Clamp a pointer position over the seek bar to a playable [0, 1] ratio.
 * Axis-agnostic: the upright bar feeds clientX/left/width, the rotated
 * vertical bar feeds clientY/top/height — progress runs from trackStart.
 */
export function seekRatioFromPointer(
  pointerPosition: number,
  trackStart: number,
  trackExtent: number,
): number {
  if (!Number.isFinite(trackExtent) || trackExtent <= 0) return 0;
  return Math.min(
    Math.max((pointerPosition - trackStart) / trackExtent, 0),
    1,
  );
}
