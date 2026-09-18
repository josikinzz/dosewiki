import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PREVIEW_SPEC,
  buildPreviewFfmpegArgs,
  estimatePreviewBytes,
  isAcceptablePreview,
  planPreviewGeneration,
  verifyPreviewGeneration,
} from "./generate-preview-renditions.mjs";

const MEDIA_BASE = "https://media.example.test/assets";
const MEDIA_KEY = `media/sha256/${"a".repeat(64)}.mp4`;
const PREVIEW_KEY = `media/sha256/${"b".repeat(64)}.mp4`;
const PROD = `${MEDIA_BASE}/${MEDIA_KEY}`;
const PROD_PREVIEW = `${MEDIA_BASE}/${PREVIEW_KEY}`;
const ORPHAN = "https://orphan.example.invalid/api/storage/media";

beforeEach(() => vi.stubEnv("REPLICATION_MEDIA_BASE_URL", MEDIA_BASE));
afterEach(() => vi.unstubAllEnvs());

let seq = 0;
const row = (extra = {}) => {
  seq += 1;
  return {
    _id: `id-${seq}`,
    slug: `work-${seq}`,
    type: "video",
    storage_id: `storageid00000000000000000000${seq}`,
    r2_key: MEDIA_KEY,
    url: PROD,
    thumbnail_url: `${PROD}-thumb`,
    duration: 42,
    width: 1920,
    height: 1080,
    ...extra,
  };
};

describe("planPreviewGeneration", () => {
  it("plans a video with both native and historical compare-and-swap identities", () => {
    const source = row();
    const { actions, skipped } = planPreviewGeneration([source]);

    expect(skipped).toEqual([]);
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({
      rowId: source._id,
      slug: source.slug,
      sourceUrl: PROD,
      expectedStorageId: source.storage_id,
      expectedR2Key: source.r2_key,
      durationSeconds: 42,
      hadPreview: false,
    });
  });

  it("considers only video replications — images, audio, and figures are not gallery autoplay tiles", () => {
    const { actions, skipped, videoRowCount } = planPreviewGeneration([
      row({ type: "image" }),
      row({ type: "audio" }),
      row({ type: "video", role: "figure" }),
      row(),
    ]);

    expect(videoRowCount).toBe(1);
    expect(actions).toHaveLength(1);
    expect(skipped).toEqual([]);
  });

  it("skips a row that already has a preview, unless forced", () => {
    const done = row({ preview_r2_key: PREVIEW_KEY });

    const withoutForce = planPreviewGeneration([done]);
    expect(withoutForce.actions).toEqual([]);
    expect(withoutForce.skipped[0].reason).toMatch(/already has a preview/);

    const withForce = planPreviewGeneration([done], { force: true });
    expect(withForce.actions).toHaveLength(1);
    expect(withForce.actions[0].hadPreview).toBe(true);
  });

  it("skips a row with a null resolved url instead of planning a write against nothing", () => {
    const { actions, skipped } = planPreviewGeneration([row({ url: null })]);
    expect(actions).toEqual([]);
    expect(skipped[0].reason).toMatch(/resolved url is null/);
  });

  it("skips unknown and legacy storage sources", () => {
    const sources = [
      ORPHAN,
      "https://retired.example.invalid/api/storage/media",
      "https://unknown.example.test/video.mp4",
    ];
    const { actions, skipped } = planPreviewGeneration(sources.map((url) => row({ url })));
    expect(actions).toEqual([]);
    expect(skipped).toHaveLength(sources.length);
  });
});

describe("buildPreviewFfmpegArgs", () => {
  const args = (overrides = {}) =>
    buildPreviewFfmpegArgs({ inputPath: "in.mp4", outputPath: "out.mp4.part", ...overrides });

  it("encodes exactly the contract: 10s cap, CRF 30 veryfast, High yuv420p, muted, faststart mp4", () => {
    const argv = args();
    const pair = (flag) => argv[argv.indexOf(flag) + 1];

    expect(pair("-t")).toBe(String(PREVIEW_SPEC.maxSeconds));
    expect(pair("-crf")).toBe("30");
    expect(pair("-preset")).toBe("veryfast");
    expect(pair("-profile:v")).toBe("high");
    expect(pair("-pix_fmt")).toBe("yuv420p");
    expect(pair("-c:v")).toBe("libx264");
    expect(pair("-f")).toBe("mp4");
    expect(argv).toContain("-an");
    expect(pair("-movflags")).toBe("+faststart");
    expect(argv[argv.length - 1]).toBe("out.mp4.part");
  });

  it("emits no filter chain when the source is already within the caps", () => {
    expect(args({ scale: null, fps: 30 })).not.toContain("-vf");
  });

  it("scales with lanczos when the long edge exceeds the cap", () => {
    const argv = args({ scale: { width: 480, height: 270 } });
    expect(argv[argv.indexOf("-vf") + 1]).toBe("scale=480:270:flags=lanczos");
  });

  it("caps fps only when the source exceeds 30", () => {
    expect(args({ fps: 60 })[args({ fps: 60 }).indexOf("-vf") + 1]).toBe("fps=30");
    expect(args({ fps: 24 })).not.toContain("-vf");
    const both = args({ scale: { width: 480, height: 270 }, fps: 59.94 });
    expect(both[both.indexOf("-vf") + 1]).toBe("scale=480:270:flags=lanczos,fps=30");
  });
});

describe("estimatePreviewBytes", () => {
  it("projects against the preview's capped dimensions and duration, not the source's", () => {
    const long = estimatePreviewBytes({ width: 1920, height: 1080, fps: 60, durationSeconds: 300 });
    const short = estimatePreviewBytes({ width: 480, height: 270, fps: 30, durationSeconds: 10 });
    // A 5-minute 1080p60 source and a 10s 480p30 source produce the same preview.
    expect(long).toBe(short);
  });

  it("returns null rather than a made-up number when dimensions are unknown", () => {
    expect(estimatePreviewBytes({ width: null, height: null, durationSeconds: 10 })).toBeNull();
  });
});

describe("verifyPreviewGeneration", () => {
  const before = { url: PROD, thumbnail_url: `${PROD}-thumb` };
  const goodAfter = { url: PROD, thumbnail_url: `${PROD}-thumb`, preview_url: PROD_PREVIEW };

  it("passes when the preview resolved on production and nothing else moved", () => {
    expect(verifyPreviewGeneration({ before, after: goodAfter })).toEqual({ ok: true, reasons: [] });
  });

  it("fails hard when the row vanished from the resolver output", () => {
    expect(verifyPreviewGeneration({ before, after: undefined }).ok).toBe(false);
  });

  it("fails when preview_url resolved to null — the write did not take effect", () => {
    const verdict = verifyPreviewGeneration({ before, after: { ...goodAfter, preview_url: null } });
    expect(verdict.ok).toBe(false);
    expect(verdict.reasons[0]).toMatch(/preview_url is null/);
  });

  it("fails when the preview resolves from a host this project does not control", () => {
    const verdict = verifyPreviewGeneration({
      before,
      after: { ...goodAfter, preview_url: ORPHAN },
    });
    expect(verdict.ok).toBe(false);
  });

  it("fails when the delivered url changed — a null url deletes the page", () => {
    const changed = verifyPreviewGeneration({ before, after: { ...goodAfter, url: `${PROD}-other` } });
    expect(changed.ok).toBe(false);
    expect(changed.reasons[0]).toMatch(/url CHANGED/);

    const nulled = verifyPreviewGeneration({ before, after: { ...goodAfter, url: null } });
    expect(nulled.ok).toBe(false);
  });

  it("fails when the thumbnail changed", () => {
    const verdict = verifyPreviewGeneration({
      before,
      after: { ...goodAfter, thumbnail_url: null },
    });
    expect(verdict.ok).toBe(false);
    expect(verdict.reasons[0]).toMatch(/thumbnail_url CHANGED/);
  });
});

describe("isAcceptablePreview", () => {
  const probe = (extra = {}) => ({
    video: { width: 480, height: 270 },
    hasAudio: false,
    faststart: true,
    truncated: false,
    durationSeconds: 10,
    ...extra,
  });

  it("accepts a muted faststart preview within the caps", () => {
    expect(isAcceptablePreview(probe()).ok).toBe(true);
  });

  it("rejects an audio track, a trailing moov, truncation, oversize, and over-duration", () => {
    expect(isAcceptablePreview(probe({ hasAudio: true })).ok).toBe(false);
    expect(isAcceptablePreview(probe({ faststart: false })).ok).toBe(false);
    expect(isAcceptablePreview(probe({ truncated: true })).ok).toBe(false);
    expect(isAcceptablePreview(probe({ video: { width: 640, height: 360 } })).ok).toBe(false);
    expect(isAcceptablePreview(probe({ durationSeconds: 11 })).ok).toBe(false);
    expect(isAcceptablePreview(probe({ video: null })).ok).toBe(false);
  });

  it("tolerates ffmpeg's frame-boundary slack past the 10s cut", () => {
    expect(isAcceptablePreview(probe({ durationSeconds: 10.3 })).ok).toBe(true);
  });
});
