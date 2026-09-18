import { describe, expect, it } from "vitest";
import {
  BITS_PER_PIXEL,
  DEFAULT_OPTIONS,
  buildFfmpegArgs,
  computeScaledDimensions,
  estimateOutputBytes,
  planVideoAction,
  summarizeManifest,
} from "./video-transcode-planning.mjs";

describe("computeScaledDimensions", () => {
  it("caps the long edge and keeps both axes even", () => {
    expect(computeScaledDimensions({ width: 3840, height: 2160, maxDimension: 1920 })).toEqual({
      width: 1920,
      height: 1080,
    });
    expect(computeScaledDimensions({ width: 2160, height: 3840, maxDimension: 1920 })).toEqual({
      width: 1080,
      height: 1920,
    });
  });

  it("never upscales something already inside the cap", () => {
    expect(computeScaledDimensions({ width: 640, height: 480, maxDimension: 1920 })).toBeNull();
    expect(computeScaledDimensions({ width: 1920, height: 1080, maxDimension: 1920 })).toBeNull();
  });

  it("rounds an awkward aspect ratio to even dimensions", () => {
    const scaled = computeScaledDimensions({ width: 2938, height: 1103, maxDimension: 1920 });

    expect(scaled.width % 2).toBe(0);
    expect(scaled.height % 2).toBe(0);
    expect(scaled.width).toBe(1920);
  });

  it("returns null for a probe with no usable dimensions", () => {
    expect(computeScaledDimensions({ width: null, height: 1080, maxDimension: 1920 })).toBeNull();
    expect(computeScaledDimensions({ width: 0, height: 0, maxDimension: 1920 })).toBeNull();
  });
});
describe("planVideoAction", () => {
  const webReady = {
    formatNames: ["mov", "mp4", "m4a"],
    bitrateBps: 2_000_000,
    faststart: true,
    hasAudio: true,
    video: { codec: "h264", width: 1280, height: 720, pixelFormat: "yuv420p", fps: 30 },
  };

  it("leaves an already web-ready faststart mp4 alone", () => {
    expect(planVideoAction(webReady).action).toBe("copy");
  });

  it("remuxes a web-ready file whose moov trails", () => {
    const plan = planVideoAction({ ...webReady, faststart: false });

    expect(plan.action).toBe("remux");
    expect(plan.reasons.join(" ")).toContain("moov");
  });

  it("remuxes a web-ready stream sitting in the wrong container", () => {
    const plan = planVideoAction({ ...webReady, formatNames: ["matroska", "webm"], faststart: false });

    expect(plan.action).toBe("remux");
  });

  it("transcodes anything over the dimension cap", () => {
    const plan = planVideoAction({
      ...webReady,
      video: { ...webReady.video, width: 3840, height: 2160 },
    });

    expect(plan.action).toBe("transcode");
    expect(plan.scale).toEqual({ width: 1920, height: 1080 });
  });

  it("transcodes a pixel format no browser can decode", () => {
    const plan = planVideoAction({ ...webReady, video: { ...webReady.video, pixelFormat: "yuv444p10le" } });

    expect(plan.action).toBe("transcode");
    expect(plan.reasons.join(" ")).toContain("yuv444p10le");
  });

  it("transcodes a codec no browser can decode", () => {
    expect(planVideoAction({ ...webReady, video: { ...webReady.video, codec: "prores" } }).action).toBe(
      "transcode",
    );
  });

  it("transcodes a file that fits the cap but is far over the bitrate ceiling", () => {
    const plan = planVideoAction({ ...webReady, bitrateBps: 90_000_000 });

    expect(plan.action).toBe("transcode");
    expect(plan.scale).toBeNull();
    expect(plan.reasons.join(" ")).toContain("ceiling");
  });

  it("reports an audio-only or broken file as an error instead of encoding it", () => {
    expect(planVideoAction({ ...webReady, video: null }).action).toBe("error");
  });
});
describe("buildFfmpegArgs", () => {
  const base = { inputPath: "in.mov", outputPath: "out.mp4.part" };

  it("always emits faststart and a browser-decodable pixel format", () => {
    const args = buildFfmpegArgs({ ...base, action: "transcode", hasAudio: true });

    expect(args).toContain("+faststart");
    expect(args[args.indexOf("-movflags") + 1]).toBe("+faststart");
    expect(args[args.indexOf("-pix_fmt") + 1]).toBe("yuv420p");
    expect(args[args.indexOf("-c:v") + 1]).toBe("libx264");
    expect(args.at(-1)).toBe("out.mp4.part");
  });

  it("uses -an for a silent master rather than an empty aac stream", () => {
    const args = buildFfmpegArgs({ ...base, action: "transcode", hasAudio: false });

    expect(args).toContain("-an");
    expect(args).not.toContain("-c:a");
    expect(args).not.toContain("0:a:0?");
  });

  it("downmixes and re-encodes audio when a master has it", () => {
    const args = buildFfmpegArgs({ ...base, action: "transcode", hasAudio: true, audioBitrateKbps: 128 });

    expect(args[args.indexOf("-c:a") + 1]).toBe("aac");
    expect(args[args.indexOf("-b:a") + 1]).toBe("128k");
    expect(args[args.indexOf("-ac") + 1]).toBe("2");
  });

  it("adds a scale filter only when the source is over the cap", () => {
    expect(buildFfmpegArgs({ ...base, action: "transcode" })).not.toContain("-vf");
    expect(
      buildFfmpegArgs({ ...base, action: "transcode", scale: { width: 1920, height: 1080 } }),
    ).toContain("scale=1920:1080:flags=lanczos");
  });

  it("remux is a lossless stream copy that only moves the moov", () => {
    const args = buildFfmpegArgs({ ...base, action: "remux", hasAudio: true });

    expect(args[args.indexOf("-c") + 1]).toBe("copy");
    expect(args).toContain("+faststart");
    expect(args).not.toContain("libx264");
    expect(args).not.toContain("-crf");
  });

  it("carries the configured quality knobs through verbatim", () => {
    const args = buildFfmpegArgs({ ...base, action: "transcode", crf: 18, preset: "slow" });

    expect(args[args.indexOf("-crf") + 1]).toBe("18");
    expect(args[args.indexOf("-preset") + 1]).toBe("slow");
  });

  it("never lets ffmpeg steal the parent's stdin during a long batch", () => {
    expect(buildFfmpegArgs({ ...base, action: "transcode" })).toContain("-nostdin");
  });

  // Regression: the resumable `.part` temp name gives ffmpeg no extension to
  // infer a muxer from, so without an explicit -f every write fails at muxer
  // init with "Unable to choose an output format".
  it("names the container explicitly because the temp file has no usable extension", () => {
    for (const action of ["transcode", "remux"]) {
      const args = buildFfmpegArgs({ ...base, action });
      expect(args[args.indexOf("-f") + 1]).toBe("mp4");
      expect(args.indexOf("-f")).toBeLessThan(args.length - 1);
    }
  });
});
describe("estimateOutputBytes", () => {
  it("scales with pixels, frame rate, and duration", () => {
    const bytes = estimateOutputBytes({
      width: 1920,
      height: 1080,
      fps: 30,
      durationSeconds: 10,
      hasAudio: false,
      bitsPerPixel: BITS_PER_PIXEL.mid,
    });

    // 1920*1080*30*0.07 = 4.35 Mbps over 10 s.
    expect(bytes).toBe(Math.round((1920 * 1080 * 30 * 0.07 * 10) / 8));
  });

  it("adds the audio budget only when there is audio", () => {
    const shared = { width: 640, height: 360, fps: 30, durationSeconds: 10 };
    const silent = estimateOutputBytes({ ...shared, hasAudio: false });
    const withAudio = estimateOutputBytes({ ...shared, hasAudio: true, audioBitrateKbps: 128 });

    expect(withAudio - silent).toBe(Math.round((128_000 * 10) / 8));
  });

  it("returns null rather than a fake number when the probe is too thin", () => {
    expect(
      estimateOutputBytes({ width: 1920, height: 1080, fps: null, durationSeconds: 10, hasAudio: false }),
    ).toBeNull();
  });
});
describe("summarizeManifest", () => {
  it("prefers measured output bytes over the estimate", () => {
    const summary = summarizeManifest([
      { action: "transcode", sourceBytes: 1000, outputBytes: 100, estimate: { low: 1, mid: 2, high: 3 } },
    ]);

    expect(summary.measuredCount).toBe(1);
    expect(summary.projectedBytes).toEqual({ low: 100, mid: 100, high: 100 });
    expect(summary.reductionFraction.mid).toBeCloseTo(0.9);
  });

  it("counts copied and remuxed files at their source size, because that is what ships", () => {
    const summary = summarizeManifest([
      { action: "copy", sourceBytes: 500 },
      { action: "remux", sourceBytes: 700 },
    ]);

    expect(summary.projectedBytes.mid).toBe(1200);
    expect(summary.reductionFraction.mid).toBe(0);
  });

  it("projects a band for files that have not been encoded yet", () => {
    const summary = summarizeManifest([
      { action: "transcode", sourceBytes: 10_000, estimate: { low: 500, mid: 900, high: 1500 } },
    ]);

    expect(summary.projectedBytes).toEqual({ low: 500, mid: 900, high: 1500 });
    expect(summary.reductionFraction.low).toBeCloseTo(0.85);
    expect(summary.reductionFraction.high).toBeCloseTo(0.95);
  });

  it("falls back to the source size instead of dropping an unestimatable file", () => {
    const summary = summarizeManifest([{ action: "transcode", sourceBytes: 4242, estimate: {} }]);

    expect(summary.projectedBytes.mid).toBe(4242);
  });

  it("tallies actions and the corpus total", () => {
    const summary = summarizeManifest([
      { action: "transcode", sourceBytes: 100, estimate: { low: 5, mid: 10, high: 20 } },
      { action: "transcode", sourceBytes: 200, estimate: { low: 5, mid: 10, high: 20 } },
      { action: "copy", sourceBytes: 50 },
      { action: "blocked", sourceBytes: 0 },
    ]);

    expect(summary.count).toBe(4);
    expect(summary.byAction).toEqual({ transcode: 2, copy: 1, blocked: 1 });
    expect(summary.sourceBytes).toBe(350);
  });

  it("surfaces undelivered files instead of hiding them in a healthy total", () => {
    const summary = summarizeManifest([
      { action: "transcode", sourceBytes: 100, outputBytes: 10, status: "encoded" },
      { action: "transcode", sourceBytes: 100, status: "failed" },
      { action: "blocked", sourceBytes: 100 },
      { action: "error", sourceBytes: 100 },
    ]);

    expect(summary.unfinished).toBe(3);
    expect(summary.byStatus).toEqual({ encoded: 1, failed: 1, planned: 2 });
  });
});
describe("DEFAULT_OPTIONS", () => {
  it("caps the long edge at 1080p-class delivery without upscaling", () => {
    expect(DEFAULT_OPTIONS.maxDimension).toBe(1920);
    expect(DEFAULT_OPTIONS.crf).toBeGreaterThanOrEqual(18);
    expect(DEFAULT_OPTIONS.crf).toBeLessThanOrEqual(24);
  });
});
