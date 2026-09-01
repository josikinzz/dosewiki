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

/** The rendition the pooled player should feed a slide. */
export type SlideQuality = "preview" | "full";

/**
 * The frame a slide shows beneath its video while frames are still arriving:
 * GIFs lead with their motion poster, videos with their thumbnail, stills
 * with the artwork itself. The underlay sits below the media element, so a
 * painted frame simply covers it.
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

/**
 * The motion file a slide's pooled element plays. GIFs play their
 * controllable rendition only once both motion assets exist; videos play
 * their preview rendition so swipes land on an already-buffered small file —
 * the catalogued full file is reserved for the explicit HQ escape (and for
 * rows whose preview was never generated); stills play nothing.
 */
export function slideMotionSource(
  replication: {
    type: ReplicationType;
    format: string;
    url: string;
    preview_url?: string | null;
    motion_url?: string | null;
    motion_poster_url?: string | null;
  },
  quality: SlideQuality = "preview",
): string | null {
  if (replication.format.toLowerCase() === "gif") {
    return replication.motion_url && replication.motion_poster_url
      ? replication.motion_url
      : null;
  }
  if (replication.type !== "video") return null;
  if (quality === "full") return replication.url;
  return replication.preview_url ?? replication.url;
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
  return Math.min(Math.max((pointerPosition - trackStart) / trackExtent, 0), 1);
}

/** One duration in words, for spoken seek positions: "2 minutes 5 seconds". */
function describeSeconds(totalSeconds: number): string {
  const whole = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(whole / 60);
  const seconds = whole % 60;
  const parts: string[] = [];
  if (minutes > 0) {
    parts.push(`${minutes} minute${minutes === 1 ? "" : "s"}`);
  }
  if (seconds > 0 || minutes === 0) {
    parts.push(`${seconds} second${seconds === 1 ? "" : "s"}`);
  }
  return parts.join(" ");
}

/**
 * The seek slider's spoken position. Bare `aria-valuenow` seconds read as
 * meaningless numbers; this names both position and total.
 */
export function describeSeekPosition(
  currentSeconds: number,
  totalSeconds: number,
): string {
  return `${describeSeconds(currentSeconds)} of ${describeSeconds(totalSeconds)}`;
}

/**
 * A compact visual playback clock: `0:07`, `1:42`, `1:02:03`. Fractional
 * seconds floor — the clock never reads ahead of the frame on screen.
 */
export function formatPlaybackClock(totalSeconds: number): string {
  const whole = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const seconds = whole % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(seconds)}`
    : `${minutes}:${pad(seconds)}`;
}
