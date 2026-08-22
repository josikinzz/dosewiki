/**
 * The public launch floor for dose.wiki, and the arithmetic the holding page counts down
 * with.
 *
 * The floor is midnight at the *start* of 31 August 2026, America/Los_Angeles — the moment
 * the 31st begins, not the moment it ends. Los Angeles is on PDT (UTC−7) that day; DST does
 * not end until 1 November 2026, so the offset is not in question and the instant is stored
 * as a plain UTC timestamp rather than reconstructed through a timezone library at runtime.
 * `launchAtMatchesPacificMidnight` in the tests is the guard on that constant.
 *
 * The date is a floor, not an automatic launch: reaching zero unblocks nothing on its own
 * (see `docs/agents/deployment.md`), it only stops the clock.
 */

/** Midnight, 31 August 2026, America/Los_Angeles (PDT, UTC−7). */
export const LAUNCH_AT_MS = Date.UTC(2026, 7, 31, 7, 0, 0);

/** The launch instant as a reader-facing label, used before the clock starts ticking. */
export const LAUNCH_AT_LABEL = "31 Aug 2026 · 00:00 PT";

export type LaunchCountdown = {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  /** Whole milliseconds left; never negative. */
  remainingMs: number;
};

const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = 60 * MS_PER_SECOND;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;

/**
 * The time left until launch, or `null` once it has passed. `null` rather than a zeroed
 * countdown so callers cannot render "0d 00:00:00" indefinitely after the floor.
 */
export function getLaunchCountdown(nowMs: number, launchAtMs = LAUNCH_AT_MS): LaunchCountdown | null {
  const remainingMs = launchAtMs - nowMs;

  if (remainingMs <= 0) {
    return null;
  }

  return {
    days: Math.floor(remainingMs / MS_PER_DAY),
    hours: Math.floor(remainingMs / MS_PER_HOUR) % 24,
    minutes: Math.floor(remainingMs / MS_PER_MINUTE) % 60,
    seconds: Math.floor(remainingMs / MS_PER_SECOND) % 60,
    remainingMs,
  };
}

const pad = (value: number) => String(value).padStart(2, "0");

/**
 * `8d 16:42:05`, dropping the day part on the last day. Fixed width per field so the
 * digits do not reflow on every tick.
 */
export function formatLaunchCountdown(countdown: LaunchCountdown): string {
  const clock = `${pad(countdown.hours)}:${pad(countdown.minutes)}:${pad(countdown.seconds)}`;

  return countdown.days > 0 ? `${countdown.days}d ${clock}` : clock;
}
