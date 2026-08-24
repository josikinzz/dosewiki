import { describe, expect, it } from "vitest";
import {
  FALLBACK_IMAGE_RATIO,
  FALLBACK_VIDEO_RATIO,
  resolveMediaAspect,
  shouldLoopReplicationMotion,
  shouldShowGestureHint,
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
