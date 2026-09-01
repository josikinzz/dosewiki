import { describe, expect, it } from "vitest";
import {
  FALLBACK_IMAGE_RATIO,
  FALLBACK_VIDEO_RATIO,
  bufferedRangeContaining,
  describeSeekPosition,
  formatPlaybackClock,
  resolveMediaAspect,
  seekRatioFromPointer,
  shouldLoopReplicationMotion,
  shouldShowGestureHint,
  slideMotionSource,
  slidePosterSource,
} from "./viewerLogic";

describe("resolveMediaAspect", () => {
  it("prefers a probed ratio over catalogued dimensions", () => {
    expect(resolveMediaAspect("video", 1600, 900, 4 / 3)).toBeCloseTo(
      4 / 3,
      10,
    );
  });

  it("falls back to catalogued dimensions when nothing was probed", () => {
    expect(resolveMediaAspect("image", 1200, 1600, undefined)).toBeCloseTo(
      3 / 4,
      10,
    );
  });

  it("guesses by type when the row carries no dimensions", () => {
    expect(resolveMediaAspect("video", undefined, undefined, undefined)).toBe(
      FALLBACK_VIDEO_RATIO,
    );
    expect(resolveMediaAspect("image", null, null, undefined)).toBe(
      FALLBACK_IMAGE_RATIO,
    );
  });

  it("ignores junk probes and junk dimensions", () => {
    expect(resolveMediaAspect("image", 1600, 900, Number.NaN)).toBeCloseTo(
      16 / 9,
      10,
    );
    expect(resolveMediaAspect("image", 1600, 900, 0)).toBeCloseTo(16 / 9, 10);
    expect(resolveMediaAspect("video", 0, 900, undefined)).toBe(
      FALLBACK_VIDEO_RATIO,
    );
  });
});

describe("shouldLoopReplicationMotion", () => {
  it("loops GIF-like motion regardless of recorded duration", () => {
    expect(shouldLoopReplicationMotion("gif", 120)).toBe(true);
    expect(shouldLoopReplicationMotion("GIF", undefined)).toBe(true);
  });

  it("loops ordinary motion only below sixty seconds", () => {
    expect(shouldLoopReplicationMotion("mp4", 59.999)).toBe(true);
    expect(shouldLoopReplicationMotion("mp4", 60)).toBe(false);
    expect(shouldLoopReplicationMotion("mp4", 600)).toBe(false);
    expect(shouldLoopReplicationMotion("mp4", undefined)).toBe(false);
  });
});

describe("shouldShowGestureHint", () => {
  it("shows only on coarse pointers and only until first shown", () => {
    expect(shouldShowGestureHint(null, true)).toBe(true);
    expect(shouldShowGestureHint("seen", true)).toBe(false);
    expect(shouldShowGestureHint(null, false)).toBe(false);
  });
});

describe("slidePosterSource", () => {
  it("mirrors each slide's first paint", () => {
    expect(
      slidePosterSource({
        type: "image",
        format: "gif",
        url: "https://cdn.test/full.gif",
        motion_poster_url: "https://cdn.test/poster.webp",
      }),
    ).toBe("https://cdn.test/poster.webp");
    expect(
      slidePosterSource({
        type: "video",
        format: "mp4",
        url: "https://cdn.test/clip.mp4",
        thumbnail_url: "https://cdn.test/thumb.jpg",
      }),
    ).toBe("https://cdn.test/thumb.jpg");
    expect(
      slidePosterSource({
        type: "video",
        format: "mp4",
        url: "https://cdn.test/clip.mp4",
      }),
    ).toBeNull();
    expect(
      slidePosterSource({
        type: "image",
        format: "jpg",
        url: "https://cdn.test/art.jpg",
      }),
    ).toBe("https://cdn.test/art.jpg");
  });
});

describe("slideMotionSource", () => {
  it("feeds the preview rendition to the feed and reserves the full file", () => {
    const clip = {
      type: "video" as const,
      format: "mp4",
      url: "https://cdn.test/clip.mp4",
      preview_url: "https://cdn.test/clip-preview.mp4",
    };
    expect(slideMotionSource(clip)).toBe("https://cdn.test/clip-preview.mp4");
    expect(slideMotionSource(clip, "preview")).toBe(
      "https://cdn.test/clip-preview.mp4",
    );
    expect(slideMotionSource(clip, "full")).toBe("https://cdn.test/clip.mp4");
  });

  it("falls back to the catalogued file when no preview was generated", () => {
    expect(
      slideMotionSource({
        type: "video",
        format: "mp4",
        url: "https://cdn.test/clip.mp4",
      }),
    ).toBe("https://cdn.test/clip.mp4");
  });

  it("plays a GIF's controllable rendition only once both assets exist", () => {
    expect(
      slideMotionSource({
        type: "image",
        format: "gif",
        url: "https://cdn.test/full.gif",
        motion_url: "https://cdn.test/motion.mp4",
        motion_poster_url: "https://cdn.test/poster.webp",
      }),
    ).toBe("https://cdn.test/motion.mp4");
    // A GIF missing either motion asset falls back to a non-moving slide.
    expect(
      slideMotionSource({
        type: "image",
        format: "gif",
        url: "https://cdn.test/full.gif",
        motion_url: "https://cdn.test/motion.mp4",
      }),
    ).toBeNull();
    expect(
      slideMotionSource({
        type: "image",
        format: "jpg",
        url: "https://cdn.test/art.jpg",
      }),
    ).toBeNull();
  });
});

describe("bufferedRangeContaining", () => {
  const ranges = (spans: Array<[number, number]>) => ({
    length: spans.length,
    start: (index: number) => spans[index][0],
    end: (index: number) => spans[index][1],
  });

  it("returns the buffered stretch the playhead rides", () => {
    expect(bufferedRangeContaining(ranges([[0, 12]]), 6)).toEqual({
      start: 0,
      end: 12,
    });
    expect(
      bufferedRangeContaining(
        ranges([
          [0, 4],
          [10, 20],
        ]),
        15,
      ),
    ).toEqual({ start: 10, end: 20 });
  });

  it("returns null in a gap or with nothing buffered", () => {
    expect(
      bufferedRangeContaining(
        ranges([
          [0, 4],
          [10, 20],
        ]),
        7,
      ),
    ).toBeNull();
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
    expect(describeSeekPosition(125, 169)).toBe(
      "2 minutes 5 seconds of 2 minutes 49 seconds",
    );
  });

  it("singularizes one minute and one second", () => {
    expect(describeSeekPosition(61, 61)).toBe(
      "1 minute 1 second of 1 minute 1 second",
    );
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
