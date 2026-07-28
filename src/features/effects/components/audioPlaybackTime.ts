/** Shown whenever a clip's position or duration is not yet known. */
export const UNKNOWN_PLAYBACK_TIME = "--:--";

function pad(value: number) {
  return value.toString().padStart(2, "0");
}

function isUsableSeconds(seconds: number | null | undefined): seconds is number {
  return typeof seconds === "number" && Number.isFinite(seconds) && seconds >= 0;
}

/**
 * Formats a media position as `m:ss` (or `h:mm:ss` past an hour). Unknown or
 * unusable values render as {@link UNKNOWN_PLAYBACK_TIME} so a clip whose
 * metadata never arrives cannot masquerade as a zero-length one.
 */
export function formatPlaybackTime(seconds: number | null | undefined): string {
  if (!isUsableSeconds(seconds)) {
    return UNKNOWN_PLAYBACK_TIME;
  }

  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remainder = total % 60;

  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(remainder)}`
    : `${minutes}:${pad(remainder)}`;
}

/** Elapsed fraction of a clip, clamped to 0–1; 0 while the duration is unknown. */
export function getPlaybackProgressRatio(
  currentTime: number | null | undefined,
  duration: number | null | undefined,
): number {
  if (!isUsableSeconds(currentTime) || !isUsableSeconds(duration) || duration === 0) {
    return 0;
  }

  return Math.min(1, currentTime / duration);
}

/** Spoken position for the seek slider, e.g. "0:12 of 3:45". */
export function describePlaybackPosition(
  currentTime: number | null | undefined,
  duration: number | null | undefined,
): string {
  const elapsed = formatPlaybackTime(currentTime);

  return isUsableSeconds(duration)
    ? `${elapsed} of ${formatPlaybackTime(duration)}`
    : `${elapsed}, total length unknown`;
}
