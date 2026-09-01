import { describe, expect, it } from "vitest";
import type { ReplicationViewerMedia } from "./viewerModel";
import {
  decide,
  previewTruncated,
  resumeAfterSwap,
  shouldLoopReplicationMotion,
  slideMotionSource,
  slidePosterSource,
  type LadderContext,
} from "./qualityLadder";

const replication: ReplicationViewerMedia = {
  slug: "work",
  title: "Work",
  artist: "Artist",
  type: "video",
  format: "mp4",
  url: "https://example.test/full.mp4",
  preview_url: "https://example.test/preview.mp4",
  duration: 30,
};

function context(overrides: Partial<LadderContext> = {}): LadderContext {
  return {
    replication,
    quality: "preview",
    hqAvailable: true,
    dataSaver: false,
    ...overrides,
  };
}

describe("previewTruncated", () => {
  it.each([
    ["catalogued duration beyond tolerance", context(), 10, true],
    [
      "catalogued duration within tolerance",
      context({ replication: { ...replication, duration: 11 } }),
      10,
      false,
    ],
    [
      "generator-cap preview without a catalogued duration",
      context({ replication: { ...replication, duration: undefined } }),
      9.85,
      true,
    ],
    [
      "short preview without a catalogued duration",
      context({ replication: { ...replication, duration: undefined } }),
      6,
      false,
    ],
  ])("detects %s", (_label, ctx, duration, expected) => {
    expect(previewTruncated(ctx, duration)).toBe(expected);
  });
});

describe("decide", () => {
  it.each([
    [
      "continues an ended truncated preview",
      { type: "ended", elementDuration: 10 } as const,
      context(),
      {
        kind: "switch",
        quality: "full",
        src: replication.url,
        time: 10,
        play: true,
      },
    ],
    [
      "upgrades a settled preview",
      { type: "settled", currentTime: 4 } as const,
      context(),
      {
        kind: "switch",
        quality: "full",
        src: replication.url,
        time: 4,
        play: true,
      },
    ],
    [
      "holds a settled preview for data saver",
      { type: "settled", currentTime: 4 } as const,
      context({ dataSaver: true }),
      { kind: "stay" },
    ],
    [
      "escalates a seek past the preview end",
      {
        type: "seek",
        target: 12,
        elementDuration: 10,
        paused: false,
        ended: false,
      } as const,
      context(),
      {
        kind: "switch",
        quality: "full",
        src: replication.url,
        time: 12,
        play: true,
      },
    ],
  ])("%s", (_label, event, ctx, expected) => {
    expect(decide(event, ctx)).toEqual(expected);
  });

  it.each([
    ["full", false, false, replication.url, true],
    ["preview", false, false, replication.preview_url, true],
  ] as const)(
    "switches HQ to %s while preserving playhead and playback",
    (desired, paused, ended, src, play) => {
      const quality = desired === "full" ? "preview" : "full";
      expect(
        decide(
          { type: "hq", desired, currentTime: 7, paused, ended },
          context({ quality }),
        ),
      ).toEqual({ kind: "switch", quality: desired, src, time: 7, play });
    },
  );

  it.each([
    ["truncated preview", context(), 10, false],
    [
      "normal short work",
      context({ replication: { ...replication, duration: 20 } }),
      20,
      true,
    ],
  ])("sets metadata looping for a %s", (_label, ctx, duration, loop) => {
    expect(decide({ type: "metadata", elementDuration: duration }, ctx)).toEqual(
      { kind: "stay", loop },
    );
  });
});

describe("resumeAfterSwap", () => {
  it.each([
    [false, false, true],
    [false, true, true],
    [true, false, false],
    [true, true, true],
  ])("maps paused=%s ended=%s to %s", (paused, ended, expected) => {
    expect(resumeAfterSwap(paused, ended)).toBe(expected);
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

describe("slidePosterSource", () => {
  it("mirrors each slide's first paint", () => {
    expect(slidePosterSource({ type: "image", format: "gif", url: "full.gif", motion_poster_url: "poster.webp" })).toBe("poster.webp");
    expect(slidePosterSource({ type: "video", format: "mp4", url: "clip.mp4", thumbnail_url: "thumb.jpg" })).toBe("thumb.jpg");
    expect(slidePosterSource({ type: "video", format: "mp4", url: "clip.mp4" })).toBeNull();
    expect(slidePosterSource({ type: "image", format: "jpg", url: "art.jpg" })).toBe("art.jpg");
  });
});

describe("slideMotionSource", () => {
  it("feeds the preview rendition to the feed and reserves the full file", () => {
    const clip = { type: "video" as const, format: "mp4", url: "clip.mp4", preview_url: "preview.mp4" };
    expect(slideMotionSource(clip)).toBe("preview.mp4");
    expect(slideMotionSource(clip, "preview")).toBe("preview.mp4");
    expect(slideMotionSource(clip, "full")).toBe("clip.mp4");
  });
  it("falls back to the catalogued file when no preview was generated", () => {
    expect(slideMotionSource({ type: "video", format: "mp4", url: "clip.mp4" })).toBe("clip.mp4");
  });
  it("plays a GIF's controllable rendition only once both assets exist", () => {
    expect(slideMotionSource({ type: "image", format: "gif", url: "full.gif", motion_url: "motion.mp4", motion_poster_url: "poster.webp" })).toBe("motion.mp4");
    expect(slideMotionSource({ type: "image", format: "gif", url: "full.gif", motion_url: "motion.mp4" })).toBeNull();
    expect(slideMotionSource({ type: "image", format: "jpg", url: "art.jpg" })).toBeNull();
  });
});
