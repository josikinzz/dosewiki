import { describe, expect, it } from "vitest";
import {
  formatLaunchCountdown,
  getLaunchCountdown,
  LAUNCH_AT_MS,
} from "./launchCountdown";

const pacificWallClock = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Los_Angeles",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

describe("launch countdown", () => {
  it("targets midnight at the start of 31 August 2026 in Pacific time", () => {
    // The constant is a hardcoded UTC instant, which is only correct while Los Angeles is
    // on PDT that day. This is the guard on that assumption.
    expect(pacificWallClock.format(LAUNCH_AT_MS)).toBe("2026-08-31, 00:00:00");
  });

  it("counts the whole remaining interval, not the calendar difference", () => {
    const countdown = getLaunchCountdown(LAUNCH_AT_MS - (((2 * 24 + 3) * 60 + 4) * 60 + 5) * 1000);

    expect(countdown).toEqual({
      days: 2,
      hours: 3,
      minutes: 4,
      seconds: 5,
      remainingMs: 183_845_000,
    });
  });

  it("stops rather than counting up once the floor has passed", () => {
    expect(getLaunchCountdown(LAUNCH_AT_MS)).toBeNull();
    expect(getLaunchCountdown(LAUNCH_AT_MS + 1)).toBeNull();
  });

  it("keeps a fixed-width clock and drops the day field on the last day", () => {
    expect(formatLaunchCountdown(getLaunchCountdown(LAUNCH_AT_MS - 90_061_000)!)).toBe(
      "1d 01:01:01",
    );
    expect(formatLaunchCountdown(getLaunchCountdown(LAUNCH_AT_MS - 5_000)!)).toBe("00:00:05");
  });
});
