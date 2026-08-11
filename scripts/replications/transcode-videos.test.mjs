import { describe, expect, it } from "vitest";
import {
  BITS_PER_PIXEL,
  DEFAULT_OPTIONS,
  analyzeAtomLayout,
  assertOutputSafety,
  isCompletedRendition,
  assertToolsAvailable,
  assertTranscodeAllowed,
  buildFfmpegArgs,
  classifyPreservation,
  computeScaledDimensions,
  estimateOutputBytes,
  hasFaststartLayout,
  listTopLevelAtomTypes,
  parseProbeJson,
  planVideoAction,
  resolveMasterPath,
  summarizeManifest,
} from "./transcode-videos.mjs";

/** Build a synthetic ISO-BMFF top-level box grid so atom parsing is testable without ffmpeg. */
function makeAtoms(boxes) {
  const buffers = boxes.map(({ type, payload = 0 }) => {
    const buffer = Buffer.alloc(8 + payload);
    buffer.writeUInt32BE(8 + payload, 0);
    buffer.write(type, 4, "latin1");
    return buffer;
  });
  return Buffer.concat(buffers);
}

function readerFor(buffer) {
  return (offset, length) => buffer.subarray(offset, offset + length);
}

describe("listTopLevelAtomTypes", () => {
  it("walks the top-level box grid in order", () => {
    const buffer = makeAtoms([
      { type: "ftyp", payload: 16 },
      { type: "moov", payload: 32 },
      { type: "mdat", payload: 64 },
    ]);

    expect(listTopLevelAtomTypes(readerFor(buffer), buffer.length)).toEqual([
      "ftyp",
      "moov",
      "mdat",
    ]);
  });

  it("follows a 64-bit largesize header", () => {
    const large = Buffer.alloc(16 + 8);
    large.writeUInt32BE(1, 0);
    large.write("mdat", 4, "latin1");
    large.writeBigUInt64BE(BigInt(24), 8);
    const buffer = Buffer.concat([makeAtoms([{ type: "moov", payload: 8 }]), large]);

    expect(listTopLevelAtomTypes(readerFor(buffer), buffer.length)).toEqual(["moov", "mdat"]);
  });

  it("stops instead of reporting garbage once it loses sync", () => {
    const buffer = Buffer.concat([
      makeAtoms([{ type: "ftyp", payload: 8 }]),
      Buffer.from([0, 0, 0, 16, 0x01, 0x02, 0x03, 0x04]),
    ]);

    expect(listTopLevelAtomTypes(readerFor(buffer), buffer.length)).toEqual(["ftyp"]);
  });

  it("does not spin forever on a zero-length box", () => {
    const buffer = Buffer.alloc(8);
    buffer.writeUInt32BE(4, 0);
    buffer.write("moov", 4, "latin1");

    expect(listTopLevelAtomTypes(readerFor(buffer), buffer.length)).toEqual(["moov"]);
  });
});

describe("analyzeAtomLayout", () => {
  it("flags a file whose last box claims to run past EOF", () => {
    const buffer = makeAtoms([
      { type: "ftyp", payload: 8 },
      { type: "moov", payload: 8 },
      { type: "mdat", payload: 8 },
    ]);
    // Cut the payload off, exactly as a truncated download or partial copy would.
    const layout = analyzeAtomLayout(readerFor(buffer), buffer.length - 6);

    expect(layout.truncated).toBe(true);
    // The critical property: moov is at the head, so a probe would call this
    // file healthy. Structural truncation must veto that.
    expect(layout.atoms).toEqual(["ftyp", "moov", "mdat"]);
    expect(layout.faststart).toBe(false);
  });

  it("reports an intact faststart file as complete", () => {
    const buffer = makeAtoms([
      { type: "ftyp", payload: 8 },
      { type: "moov", payload: 8 },
      { type: "mdat", payload: 64 },
    ]);
    const layout = analyzeAtomLayout(readerFor(buffer), buffer.length);

    expect(layout).toMatchObject({ truncated: false, faststart: true });
  });
});

describe("isCompletedRendition", () => {
  const good = { video: { width: 1920, height: 1080 }, faststart: true, truncated: false, durationSeconds: 60 };

  it("accepts an intact faststart rendition matching the master", () => {
    expect(isCompletedRendition(good, { expectedDurationSeconds: 60 }).complete).toBe(true);
  });

  it("rejects a truncated rendition even though its moov still probes clean", () => {
    const result = isCompletedRendition({ ...good, truncated: true }, { expectedDurationSeconds: 60 });

    expect(result.complete).toBe(false);
    expect(result.reason).toContain("truncated");
  });

  it("rejects a rendition whose moov trails", () => {
    expect(isCompletedRendition({ ...good, faststart: false }).complete).toBe(false);
  });

  it("rejects a rendition that stops short of the master's duration", () => {
    const result = isCompletedRendition({ ...good, durationSeconds: 20 }, { expectedDurationSeconds: 60 });

    expect(result.complete).toBe(false);
    expect(result.reason).toContain("does not match");
  });

  it("tolerates the sub-second drift a container rewrite introduces", () => {
    expect(isCompletedRendition({ ...good, durationSeconds: 60.3 }, { expectedDurationSeconds: 60 }).complete).toBe(
      true,
    );
  });

  it("does not gate on duration when the master's duration is unknown", () => {
    expect(isCompletedRendition(good, { expectedDurationSeconds: null }).complete).toBe(true);
  });

  it("rejects anything with no decodable video stream", () => {
    expect(isCompletedRendition({ video: null, faststart: true }).complete).toBe(false);
  });
});

describe("hasFaststartLayout", () => {
  it("is true only when moov precedes mdat", () => {
    expect(hasFaststartLayout(["ftyp", "moov", "mdat"])).toBe(true);
    expect(hasFaststartLayout(["ftyp", "mdat", "moov"])).toBe(false);
  });

  it("is false when there is no moov at all", () => {
    expect(hasFaststartLayout(["ftyp", "mdat"])).toBe(false);
  });
});

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

describe("parseProbeJson", () => {
  it("normalises streams, rational frame rates, and audio presence", () => {
    const probe = parseProbeJson({
      format: { format_name: "mov,mp4,m4a", size: "1234", duration: "12.5", bit_rate: "8000000" },
      streams: [
        {
          codec_type: "video",
          codec_name: "h264",
          width: 1920,
          height: 1080,
          pix_fmt: "yuv420p",
          avg_frame_rate: "30000/1001",
        },
        { codec_type: "audio", codec_name: "aac", channels: 2 },
      ],
    });

    expect(probe.formatNames).toEqual(["mov", "mp4", "m4a"]);
    expect(probe.durationSeconds).toBeCloseTo(12.5);
    expect(probe.bitrateBps).toBe(8000000);
    expect(probe.video.fps).toBeCloseTo(29.97, 2);
    expect(probe.hasAudio).toBe(true);
  });

  it("reports a silent file rather than inventing an audio stream", () => {
    const probe = parseProbeJson({
      format: { format_name: "mp4", size: "10" },
      streams: [{ codec_type: "video", codec_name: "h264", width: 100, height: 100, pix_fmt: "yuv420p" }],
    });

    expect(probe.hasAudio).toBe(false);
    expect(probe.audio).toBeNull();
  });

  it("survives a frame rate of 0/0", () => {
    const probe = parseProbeJson({
      format: { format_name: "mp4" },
      streams: [
        { codec_type: "video", codec_name: "h264", width: 8, height: 8, avg_frame_rate: "0/0", r_frame_rate: "25/1" },
      ],
    });

    expect(probe.video.fps).toBe(25);
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

describe("master preservation", () => {
  it("treats an in-place archive as already preserved", () => {
    expect(classifyPreservation({ inPlace: true }).state).toBe("in-place");
  });

  it("demands a copy when nothing is archived yet", () => {
    expect(classifyPreservation({ inPlace: false, masterExists: false }).state).toBe("needs-copy");
  });

  it("accepts an archived master that matches the source", () => {
    expect(
      classifyPreservation({ inPlace: false, masterExists: true, sourceBytes: 10, masterBytes: 10 }).state,
    ).toBe("preserved");
  });

  it("refuses to proceed when the archived master differs, rather than overwriting it", () => {
    const result = classifyPreservation({
      inPlace: false,
      masterExists: true,
      sourceBytes: 10,
      masterBytes: 9,
    });

    expect(result.state).toBe("conflict");
    expect(result.reason).toContain("9 bytes");
  });

  it("mirrors nested source paths into the archive", () => {
    expect(resolveMasterPath("/src/a/b/clip.mov", "/src", "/archive")).toBe("/archive/a/b/clip.mov");
  });
});

describe("assertOutputSafety", () => {
  it("refuses to write renditions into the master archive", () => {
    expect(() =>
      assertOutputSafety({ sourceDir: "/src", mastersDir: "/archive", outputDir: "/archive/web" }),
    ).toThrow(/inside the master archive/);
    expect(() =>
      assertOutputSafety({ sourceDir: "/src", mastersDir: "/archive", outputDir: "/archive" }),
    ).toThrow(/inside the master archive/);
  });

  it("refuses to write renditions beside their inputs", () => {
    expect(() =>
      assertOutputSafety({ sourceDir: "/src", mastersDir: "/archive", outputDir: "/src/web" }),
    ).toThrow(/inside the source directory/);
  });

  it("allows a sibling output directory", () => {
    expect(() =>
      assertOutputSafety({ sourceDir: "/vol/masters", mastersDir: "/vol/masters", outputDir: "/vol/web" }),
    ).not.toThrow();
  });

  it("is not fooled by a shared path prefix", () => {
    expect(() =>
      assertOutputSafety({ sourceDir: "/vol/masters", mastersDir: "/vol/masters", outputDir: "/vol/masters-web" }),
    ).not.toThrow();
  });
});

describe("assertTranscodeAllowed", () => {
  const argvWithConfirm = ["--write", "--confirm-transcode"];

  it("refuses without --write", () => {
    expect(() => assertTranscodeAllowed({ writeRequested: false, dryRun: true }, argvWithConfirm)).toThrow(
      /requires --write/,
    );
  });

  it("refuses without the confirmation flag", () => {
    expect(() => assertTranscodeAllowed({ writeRequested: true, dryRun: false }, ["--write"])).toThrow(
      /--confirm-transcode/,
    );
  });

  it("refuses to combine --dry-run with --write", () => {
    expect(() =>
      assertTranscodeAllowed({ writeRequested: true, dryRun: true }, ["--write", "--dry-run", "--confirm-transcode"]),
    ).toThrow(/cannot be combined/);
  });

  it("allows the full ceremony", () => {
    expect(() => assertTranscodeAllowed({ writeRequested: true, dryRun: false }, argvWithConfirm)).not.toThrow();
  });
});

describe("assertToolsAvailable", () => {
  it("names every missing binary and how to install it", () => {
    const runner = (bin) => (bin === "ffprobe" ? { error: new Error("ENOENT") } : { status: 0 });

    expect(() => assertToolsAvailable(runner)).toThrow(/ffprobe/);
    expect(() => assertToolsAvailable(runner)).toThrow(/brew install ffmpeg/);
  });

  it("passes when both binaries answer -version", () => {
    expect(() => assertToolsAvailable(() => ({ status: 0 }))).not.toThrow();
  });
});

describe("DEFAULT_OPTIONS", () => {
  it("caps the long edge at 1080p-class delivery without upscaling", () => {
    expect(DEFAULT_OPTIONS.maxDimension).toBe(1920);
    expect(DEFAULT_OPTIONS.crf).toBeGreaterThanOrEqual(18);
    expect(DEFAULT_OPTIONS.crf).toBeLessThanOrEqual(24);
  });
});
