import { describe, expect, it } from "vitest";
import {
  shouldLoopReplicationMotion,
  slideMotionSource,
  slidePosterSource,
} from "./qualityLadder";

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

describe("slidePosterSource", () => {
  it("mirrors each slide's first paint", () => {
    expect(slidePosterSource({ type: "image", format: "gif", url: "full.gif", motion_poster_url: "poster.webp" })).toBe("poster.webp");
    expect(slidePosterSource({ type: "video", format: "mp4", url: "clip.mp4", thumbnail_url: "thumb.jpg" })).toBe("thumb.jpg");
    expect(slidePosterSource({ type: "video", format: "mp4", url: "clip.mp4" })).toBeNull();
    expect(slidePosterSource({ type: "image", format: "jpg", url: "art.jpg" })).toBe("art.jpg");
  });
});

describe("slideMotionSource", () => {
  it("uses the catalogued full video even when a preview exists", () => {
    const clip = { type: "video" as const, format: "mp4", url: "clip.mp4", preview_url: "preview.mp4" };
    expect(slideMotionSource(clip)).toBe("clip.mp4");
  });
  it("uses the catalogued video without a preview", () => {
    expect(slideMotionSource({ type: "video", format: "mp4", url: "clip.mp4" })).toBe("clip.mp4");
  });
  it("plays a GIF's controllable rendition only once both assets exist", () => {
    expect(slideMotionSource({ type: "image", format: "gif", url: "full.gif", motion_url: "motion.mp4", motion_poster_url: "poster.webp" })).toBe("motion.mp4");
    expect(slideMotionSource({ type: "image", format: "gif", url: "full.gif", motion_url: "motion.mp4" })).toBeNull();
    expect(slideMotionSource({ type: "image", format: "jpg", url: "art.jpg" })).toBeNull();
  });
});

describe("audio slides", () => {
  it("keeps a clip off both the image and the video layer", () => {
    const clip = { type: "audio" as const, format: "mp3", url: "clip.mp3" };

    // `url` is the audio itself: as a poster it is a broken image, and as a
    // motion source it is a black stage with no frames to present.
    expect(slidePosterSource(clip)).toBeNull();
    expect(slideMotionSource(clip)).toBeNull();
  });
});
