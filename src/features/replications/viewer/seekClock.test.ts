import { describe, expect, it } from "vitest";

import {
  bufferedRangeContaining,
  describeSeekPosition,
  formatPlaybackClock,
  seekRatioFromPointer,
} from "./seekClock";

describe("bufferedRangeContaining", () => {
  const ranges = (spans: Array<[number, number]>) => ({
    length: spans.length,
    start: (index: number) => spans[index][0],
    end: (index: number) => spans[index][1],
  });

  it("returns the buffered stretch the playhead rides", () => {
    expect(bufferedRangeContaining(ranges([[0, 12]]), 6)).toEqual({ start: 0, end: 12 });
    expect(bufferedRangeContaining(ranges([[0, 4], [10, 20]]), 15)).toEqual({ start: 10, end: 20 });
  });

  it("returns null in a gap or with nothing buffered", () => {
    expect(bufferedRangeContaining(ranges([[0, 4], [10, 20]]), 7)).toBeNull();
    expect(bufferedRangeContaining(ranges([]), 0)).toBeNull();
  });
});

describe("seekRatioFromPointer", () => {
  it("maps the pointer proportionally along the track", () => {
    expect(seekRatioFromPointer(25, 0, 100)).toBeCloseTo(0.25, 10);
    expect(seekRatioFromPointer(75, 50, 100)).toBeCloseTo(0.25, 10);
  });

  it("clamps to the track's ends", () => {
    expect(seekRatioFromPointer(-10, 0, 100)).toBe(0);
    expect(seekRatioFromPointer(140, 0, 100)).toBe(1);
  });

  it("treats a degenerate track as the start", () => {
    expect(seekRatioFromPointer(40, 0, 0)).toBe(0);
    expect(seekRatioFromPointer(40, 0, Number.NaN)).toBe(0);
  });
});

describe("describeSeekPosition", () => {
  it("speaks minutes and seconds of both position and total", () => {
    expect(describeSeekPosition(125, 169)).toBe("2 minutes 5 seconds of 2 minutes 49 seconds");
  });
  it("singularizes one minute and one second", () => {
    expect(describeSeekPosition(61, 61)).toBe("1 minute 1 second of 1 minute 1 second");
  });
  it("omits a zero minute but never a zero-second start", () => {
    expect(describeSeekPosition(0, 43)).toBe("0 seconds of 43 seconds");
  });
  it("drops trailing zero seconds on whole minutes", () => {
    expect(describeSeekPosition(60, 120)).toBe("1 minute of 2 minutes");
  });
  it("rounds fractional playback clocks and clamps negatives", () => {
    expect(describeSeekPosition(14.6, 43.23)).toBe("15 seconds of 43 seconds");
    expect(describeSeekPosition(-2, 43)).toBe("0 seconds of 43 seconds");
  });
});

describe("formatPlaybackClock", () => {
  it("renders minute:second with padded seconds", () => {
    expect(formatPlaybackClock(0)).toBe("0:00");
    expect(formatPlaybackClock(7)).toBe("0:07");
    expect(formatPlaybackClock(102)).toBe("1:42");
  });
  it("floors fractional seconds so the clock never leads the frame", () => {
    expect(formatPlaybackClock(42.9)).toBe("0:42");
  });
  it("adds an hour segment for long recordings", () => {
    expect(formatPlaybackClock(3723)).toBe("1:02:03");
  });
  it("clamps negatives to zero", () => {
    expect(formatPlaybackClock(-5)).toBe("0:00");
  });
});
