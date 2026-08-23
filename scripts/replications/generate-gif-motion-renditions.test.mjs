import { describe, expect, it } from "vitest";

import {
  buildGifMotionFfmpegArgs,
  buildMotionPosterFfmpegArgs,
  isAcceptableGifMotion,
  planGifMotionGeneration,
  verifyRenditionDimensions,
  verifyGifMotionGeneration,
} from "./generate-gif-motion-renditions.mjs";

const row = (overrides = {}) => ({
  _id: "row-id",
  slug: "animated-grid",
  title: "Animated Grid",
  artist: "Artist",
  role: "replication",
  type: "image",
  format: "gif",
  storage_id: "originalstorage0001",
  url: "https://glad-minnow-656.convex.cloud/api/storage/originalstorage0001",
  ...overrides,
});

describe("planGifMotionGeneration", () => {
  it("plans only GIF replication rows", () => {
    const plan = planGifMotionGeneration([
      row(),
      row({ slug: "still", format: "webp" }),
      row({ slug: "video", type: "video", format: "mp4" }),
      row({ slug: "figure", role: "figure" }),
    ]);

    expect(plan.gifRowCount).toBe(1);
    expect(plan.actions.map((action) => action.slug)).toEqual([
      "animated-grid",
    ]);
  });

  it("skips a complete pair unless forced", () => {
    const complete = row({
      motion_storage_id: "motionstorage000001",
      motion_poster_storage_id: "posterstorage000001",
    });
    expect(planGifMotionGeneration([complete]).actions).toHaveLength(0);
    expect(
      planGifMotionGeneration([complete], { force: true }).actions,
    ).toHaveLength(1);
  });

  it("regenerates an incomplete pair atomically", () => {
    expect(
      planGifMotionGeneration([
        row({ motion_storage_id: "motionstorage000001" }),
      ]).actions,
    ).toHaveLength(1);
  });

  it("fails closed for missing and non-production sources", () => {
    const plan = planGifMotionGeneration([
      row({ slug: "missing", url: null }),
      row({ slug: "foreign", url: "https://example.test/work.gif" }),
    ]);
    expect(plan.actions).toHaveLength(0);
    expect(plan.skipped).toHaveLength(2);
  });
});

describe("GIF motion encode contracts", () => {
  it("preserves timing, removes audio, and writes faststart browser video", () => {
    const args = buildGifMotionFfmpegArgs({
      inputPath: "in.gif",
      outputPath: "out.mp4.part",
    });
    expect(args).toContain("vfr");
    expect(args).toContain("libx264");
    expect(args).toContain("-an");
    expect(args).toContain("+faststart");
    expect(args.join(" ")).not.toContain(" -t ");
    expect(args.join(" ")).toContain(
      "pad=ceil(iw/2)*2:ceil(ih/2)*2:(ow-iw)/2:(oh-ih)/2",
    );
    expect(args.join(" ")).not.toContain("scale=");
    expect(args.slice(-3)).toEqual(["-f", "mp4", "out.mp4.part"]);
  });

  it("extracts one PNG poster without resizing away frame content", () => {
    const args = buildMotionPosterFfmpegArgs({
      inputPath: "in.gif",
      outputPath: "out.png.part",
    });
    expect(args).toContain("1");
    expect(args).toContain("png");
    expect(args.slice(-5)).toEqual([
      "-f",
      "image2",
      "-update",
      "1",
      "out.png.part",
    ]);
    expect(args.join(" ")).not.toContain("scale=");
  });

  it("accepts only silent, timed, faststart video", () => {
    const good = {
      video: { width: 800, height: 600 },
      durationSeconds: 4,
      faststart: true,
      hasAudio: false,
      truncated: false,
    };
    expect(isAcceptableGifMotion(good).ok).toBe(true);
    expect(isAcceptableGifMotion({ ...good, hasAudio: true }).ok).toBe(false);
    expect(isAcceptableGifMotion({ ...good, durationSeconds: null }).ok).toBe(
      false,
    );
    expect(isAcceptableGifMotion({ ...good, faststart: false }).ok).toBe(false);
  });

  it("preserves poster dimensions and only pads odd video edges", () => {
    expect(
      verifyRenditionDimensions({
        source: { video: { width: 801, height: 599 } },
        motion: { video: { width: 802, height: 600 } },
        poster: { video: { width: 801, height: 599 } },
      }),
    ).toEqual({
      ok: true,
      reason: "source pixels and poster dimensions are preserved",
    });
    expect(
      verifyRenditionDimensions({
        source: { video: { width: 801, height: 599 } },
        motion: { video: { width: 800, height: 598 } },
        poster: { video: { width: 800, height: 598 } },
      }).ok,
    ).toBe(false);
  });
});

describe("verifyGifMotionGeneration", () => {
  const before = {
    url: "https://glad-minnow-656.convex.cloud/original.gif",
    thumbnail_url: "https://glad-minnow-656.convex.cloud/thumb.webp",
    preview_url: null,
  };

  it("requires both derived URLs and preserves every existing delivery URL", () => {
    expect(
      verifyGifMotionGeneration({
        before,
        after: {
          ...before,
          motion_url: "https://glad-minnow-656.convex.cloud/motion.mp4",
          motion_poster_url: "https://glad-minnow-656.convex.cloud/poster.webp",
        },
      }),
    ).toEqual({ ok: true, reasons: [] });
  });

  it("rejects partial attachment and original URL drift", () => {
    const verdict = verifyGifMotionGeneration({
      before,
      after: {
        ...before,
        url: "https://glad-minnow-656.convex.cloud/changed.gif",
        motion_url: "https://glad-minnow-656.convex.cloud/motion.mp4",
        motion_poster_url: null,
      },
    });
    expect(verdict.ok).toBe(false);
    expect(verdict.reasons).toHaveLength(2);
  });
});
