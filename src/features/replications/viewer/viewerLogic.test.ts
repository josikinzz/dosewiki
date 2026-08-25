import { describe, expect, it } from "vitest";
import {
  FALLBACK_IMAGE_RATIO,
  FALLBACK_VIDEO_RATIO,
  bufferedRangeContaining,
  resolveMediaAspect,
  seekRatioFromPointer,
  shouldLoopReplicationMotion,
  shouldShowGestureHint,
  standbyMotionSource,
  standbyPosterSource,
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

describe("standbyPosterSource", () => {
  it("mirrors each stage's first paint", () => {
    expect(
      standbyPosterSource({
        type: "image",
        format: "gif",
        url: "https://cdn.test/full.gif",
        motion_poster_url: "https://cdn.test/poster.webp",
      }),
    ).toBe("https://cdn.test/poster.webp");
    expect(
      standbyPosterSource({
        type: "video",
        format: "mp4",
        url: "https://cdn.test/clip.mp4",
        thumbnail_url: "https://cdn.test/thumb.jpg",
      }),
    ).toBe("https://cdn.test/thumb.jpg");
    expect(
      standbyPosterSource({
        type: "video",
        format: "mp4",
        url: "https://cdn.test/clip.mp4",
      }),
    ).toBeNull();
    expect(
      standbyPosterSource({
        type: "image",
        format: "jpg",
        url: "https://cdn.test/art.jpg",
      }),
    ).toBe("https://cdn.test/art.jpg");
  });
});

describe("standbyMotionSource", () => {
  it("warms exactly the file each stage will play", () => {
    expect(
      standbyMotionSource({
        type: "video",
        format: "mp4",
        url: "https://cdn.test/clip.mp4",
      }),
    ).toBe("https://cdn.test/clip.mp4");
    expect(
      standbyMotionSource({
        type: "image",
        format: "gif",
        url: "https://cdn.test/full.gif",
        motion_url: "https://cdn.test/motion.mp4",
        motion_poster_url: "https://cdn.test/poster.webp",
      }),
    ).toBe("https://cdn.test/motion.mp4");
    // A GIF missing either motion asset falls back to a non-moving stage.
    expect(
      standbyMotionSource({
        type: "image",
        format: "gif",
        url: "https://cdn.test/full.gif",
        motion_url: "https://cdn.test/motion.mp4",
      }),
    ).toBeNull();
    expect(
      standbyMotionSource({
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
