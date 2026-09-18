import { describe, expect, it } from "vitest";

import {
  describePlaybackPosition,
  formatPlaybackTime,
  getPlaybackProgressRatio,
  UNKNOWN_PLAYBACK_TIME,
} from "./audioPlaybackTime";

describe("formatPlaybackTime", () => {
  it("formats sub-hour positions as m:ss", () => {
    expect(formatPlaybackTime(0)).toBe("0:00");
    expect(formatPlaybackTime(9)).toBe("0:09");
    expect(formatPlaybackTime(65.9)).toBe("1:05");
    expect(formatPlaybackTime(599)).toBe("9:59");
  });

  it("adds an hours segment past an hour", () => {
    expect(formatPlaybackTime(3600)).toBe("1:00:00");
    expect(formatPlaybackTime(3725)).toBe("1:02:05");
  });

  it("refuses to render unknown durations as zero", () => {
    expect(formatPlaybackTime(null)).toBe(UNKNOWN_PLAYBACK_TIME);
    expect(formatPlaybackTime(undefined)).toBe(UNKNOWN_PLAYBACK_TIME);
    expect(formatPlaybackTime(Number.NaN)).toBe(UNKNOWN_PLAYBACK_TIME);
    expect(formatPlaybackTime(Number.POSITIVE_INFINITY)).toBe(UNKNOWN_PLAYBACK_TIME);
    expect(formatPlaybackTime(-1)).toBe(UNKNOWN_PLAYBACK_TIME);
  });
});

describe("getPlaybackProgressRatio", () => {
  it("returns the elapsed fraction", () => {
    expect(getPlaybackProgressRatio(0, 40)).toBe(0);
    expect(getPlaybackProgressRatio(10, 40)).toBe(0.25);
    expect(getPlaybackProgressRatio(40, 40)).toBe(1);
  });

  it("clamps overruns and falls back to zero when either value is unusable", () => {
    expect(getPlaybackProgressRatio(50, 40)).toBe(1);
    expect(getPlaybackProgressRatio(10, 0)).toBe(0);
    expect(getPlaybackProgressRatio(10, Number.NaN)).toBe(0);
    expect(getPlaybackProgressRatio(10, Number.POSITIVE_INFINITY)).toBe(0);
    expect(getPlaybackProgressRatio(null, 40)).toBe(0);
  });
});

describe("describePlaybackPosition", () => {
  it("pairs elapsed with total when the duration is known", () => {
    expect(describePlaybackPosition(12, 225)).toBe("0:12 of 3:45");
  });

  it("says so when the total is still unknown", () => {
    expect(describePlaybackPosition(12, null)).toBe("0:12, total length unknown");
  });
});
