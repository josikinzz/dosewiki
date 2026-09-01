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
