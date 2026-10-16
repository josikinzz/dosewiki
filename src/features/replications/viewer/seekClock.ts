export interface PlayableRanges {
  length: number;
  start(index: number): number;
  end(index: number): number;
}

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

export function seekRatioFromPointer(
  pointerPosition: number,
  trackStart: number,
  trackExtent: number,
): number {
  if (!Number.isFinite(trackExtent) || trackExtent <= 0) return 0;
  return Math.min(Math.max((pointerPosition - trackStart) / trackExtent, 0), 1);
}

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

export function describeSeekPosition(
  currentSeconds: number,
  totalSeconds: number,
): string {
  return `${describeSeconds(currentSeconds)} of ${describeSeconds(totalSeconds)}`;
}

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
