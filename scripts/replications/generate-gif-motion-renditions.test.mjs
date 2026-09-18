import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildGifMotionFfmpegArgs,
  buildMotionPosterFfmpegArgs,
  isAcceptableGifMotion,
  planGifMotionGeneration,
  verifyRenditionDimensions,
  verifyGifMotionGeneration,
} from "./generate-gif-motion-renditions.mjs";

const MEDIA_BASE = "https://media.example.test/assets";
const ORIGINAL_KEY = `media/sha256/${"a".repeat(64)}.gif`;
const MOTION_KEY = `media/sha256/${"b".repeat(64)}.mp4`;
const POSTER_KEY = `media/sha256/${"c".repeat(64)}.png`;

beforeEach(() => vi.stubEnv("REPLICATION_MEDIA_BASE_URL", MEDIA_BASE));
afterEach(() => vi.unstubAllEnvs());

const row = (overrides = {}) => ({
  _id: "row-id",
  slug: "animated-grid",
  title: "Animated Grid",
  artist: "Artist",
  role: "replication",
  type: "image",
  format: "gif",
  storage_id: "originalstorage0001",
  r2_key: ORIGINAL_KEY,
  url: `${MEDIA_BASE}/${ORIGINAL_KEY}`,
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
    expect(plan.actions[0]).toMatchObject({
      expectedStorageId: "originalstorage0001",
      expectedR2Key: ORIGINAL_KEY,
    });
  });

  it("skips a complete pair unless forced", () => {
    const complete = row({
      motion_r2_key: MOTION_KEY,
      motion_poster_r2_key: POSTER_KEY,
    });
    expect(planGifMotionGeneration([complete]).actions).toHaveLength(0);
    expect(
      planGifMotionGeneration([complete], { force: true }).actions,
    ).toHaveLength(1);
  });

  it("regenerates an incomplete pair atomically", () => {
    expect(
      planGifMotionGeneration([
        row({ motion_r2_key: MOTION_KEY }),
      ]).actions,
    ).toHaveLength(1);
  });

  it("fails closed for missing and non-production sources", () => {
    const plan = planGifMotionGeneration([
      row({ slug: "missing", url: null }),
      row({ slug: "foreign", url: "https://example.test/work.gif" }),
      row({ slug: "legacy", url: "https://retired.example.invalid/api/storage/original" }),
    ]);
    expect(plan.actions).toHaveLength(0);
    expect(plan.skipped).toHaveLength(3);
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
      }).ok,
    ).toBe(true);
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
    url: `${MEDIA_BASE}/${ORIGINAL_KEY}`,
    thumbnail_url: `${MEDIA_BASE}/${POSTER_KEY}`,
    preview_url: null,
  };

  it("requires both derived URLs and preserves every existing delivery URL", () => {
    expect(
      verifyGifMotionGeneration({
        before,
        after: {
          ...before,
          motion_url: `${MEDIA_BASE}/${MOTION_KEY}`,
          motion_poster_url: `${MEDIA_BASE}/${POSTER_KEY}`,
        },
      }),
    ).toEqual({ ok: true, reasons: [] });
  });

  it("rejects partial attachment and original URL drift", () => {
    const verdict = verifyGifMotionGeneration({
      before,
      after: {
        ...before,
        url: `${MEDIA_BASE}/media/sha256/${"d".repeat(64)}.gif`,
        motion_url: `${MEDIA_BASE}/${MOTION_KEY}`,
        motion_poster_url: null,
      },
    });
    expect(verdict.ok).toBe(false);
    expect(verdict.reasons).toHaveLength(2);
  });

  it("rejects derived URLs on unknown or retired storage hosts", () => {
    for (const motionUrl of [
      "https://unknown.example.test/motion.mp4",
      "https://retired.example.invalid/api/storage/motion",
    ]) {
      expect(verifyGifMotionGeneration({
        before,
        after: {
          ...before,
          motion_url: motionUrl,
          motion_poster_url: `${MEDIA_BASE}/${POSTER_KEY}`,
        },
      }).ok).toBe(false);
    }
  });
});
