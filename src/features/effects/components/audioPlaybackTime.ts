export const UNKNOWN_PLAYBACK_TIME = "--:--";

function pad(value: number) {
  return value.toString().padStart(2, "0");
}

function isUsableSeconds(seconds: number | null | undefined): seconds is number {
  return typeof seconds === "number" && Number.isFinite(seconds) && seconds >= 0;
}

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

export function getPlaybackProgressRatio(
  currentTime: number | null | undefined,
  duration: number | null | undefined,
): number {
  if (!isUsableSeconds(currentTime) || !isUsableSeconds(duration) || duration === 0) {
    return 0;
  }

  return Math.min(1, currentTime / duration);
}

export function describePlaybackPosition(
  currentTime: number | null | undefined,
  duration: number | null | undefined,
): string {
  const elapsed = formatPlaybackTime(currentTime);

  return isUsableSeconds(duration)
    ? `${elapsed} of ${formatPlaybackTime(duration)}`
    : `${elapsed}, total length unknown`;
}
