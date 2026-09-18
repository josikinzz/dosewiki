export const DEFAULT_OPTIONS = Object.freeze({
  /**
   * Long-edge cap. 1920 downscales 4K and 2.7K screen captures — where nearly
   * all of the 44.6 GB lives — while leaving 1080p and below completely
   * untouched. Dropping to 1280 would halve the bytes again but these videos
   * are the subject matter, not decoration: a reader is looking *at* the
   * texture to judge whether it matches an effect, so we keep 1080p detail.
   */
  maxDimension: 1920,
  /**
   * x264 default is 23. We sit one notch better because the corpus is drifting
   * gradients, tracers and grain, exactly the content where blocking and
   * banding read as part of the depicted effect rather than as compression.
   */
  crf: 21,
  /**
   * `medium` keeps 44.6 GB of source tractable. `veryslow` buys single-digit
   * percent bitrate for a multiple of the wall clock, which is a bad trade at
   * this corpus size; raise it per-file later if one hero video justifies it.
   */
  preset: "medium",
  /** 128 kbps AAC-LC stereo decodes everywhere and is inaudible against 4 Mbps of video. */
  audioBitrateKbps: 128,
  /**
   * A source already below this overall bitrate, already H.264/yuv420p and
   * already inside the dimension cap has nothing to gain from a re-encode — it
   * would only lose a generation of quality. Such files are copied verbatim.
   */
  maxBitrateKbps: 4500,
});

/**
 * Bits per pixel per frame used to project output size before anything is
 * encoded. Calibrated for x264 CRF 21 / preset medium on high-motion content;
 * the band is wide on purpose because CRF output is content-dependent and any
 * single number here would be false precision. Real runs replace the estimate
 * with measured bytes as soon as the first file lands.
 */
export const BITS_PER_PIXEL = Object.freeze({ low: 0.04, mid: 0.07, high: 0.10 });

// ---------------------------------------------------------------------------
// Planning
// ---------------------------------------------------------------------------

/**
 * Cap the long edge without ever upscaling, and land on even dimensions because
 * yuv420p subsamples chroma 2x2 and libx264 rejects an odd axis.
 *
 * Returns null when the source already fits, so the caller can omit the filter
 * chain entirely rather than pay for a no-op rescale.
 */
export function computeScaledDimensions({ width, height, maxDimension }) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }
  const longEdge = Math.max(width, height);
  if (longEdge <= maxDimension) return null;

  const scale = maxDimension / longEdge;
  const even = (value) => Math.max(2, Math.round((value * scale) / 2) * 2);
  return { width: even(width), height: even(height) };
}

/**
 * Decide what each master needs.
 *
 * - `transcode` — anything a browser cannot decode, anything above the
 *   dimension cap, anything above the delivery bitrate ceiling.
 * - `remux`     — already web-grade video, but in the wrong container or with a
 *   trailing `moov`. A stream copy fixes it losslessly and in seconds.
 * - `copy`      — already an MP4 web rendition with a leading `moov`. Re-encoding
 *   would only spend a generation of quality for nothing.
 * - `error`     — no decodable video stream; reported, never silently dropped.
 */
export function planVideoAction(probe, options = DEFAULT_OPTIONS) {
  const { maxDimension, maxBitrateKbps } = { ...DEFAULT_OPTIONS, ...options };
  const reasons = [];

  if (!probe?.video || !probe.video.width || !probe.video.height) {
    return { action: "error", reasons: ["no decodable video stream"], scale: null };
  }

  const { codec, width, height, pixelFormat } = probe.video;
  const scale = computeScaledDimensions({ width, height, maxDimension });

  // yuvj420p is yuv420p with full-range flags; both are browser-decodable.
  const browserPixelFormat = pixelFormat === "yuv420p" || pixelFormat === "yuvj420p";
  const browserCodec = codec === "h264";
  const isMp4 = probe.formatNames?.includes("mp4") ?? false;
  const bitrateKbps = probe.bitrateBps ? probe.bitrateBps / 1000 : null;
  const overBitrate = bitrateKbps !== null && bitrateKbps > maxBitrateKbps;

  if (!browserCodec) reasons.push(`codec ${codec ?? "unknown"} is not h264`);
  if (!browserPixelFormat) reasons.push(`pixel format ${pixelFormat ?? "unknown"} is not yuv420p`);
  if (scale) reasons.push(`${width}x${height} exceeds the ${maxDimension}px cap`);
  if (overBitrate) reasons.push(`${Math.round(bitrateKbps)} kbps exceeds the ${maxBitrateKbps} kbps ceiling`);

  if (reasons.length > 0) {
    return { action: "transcode", reasons, scale };
  }

  if (!isMp4) reasons.push(`container ${probe.formatNames?.join("/") || "unknown"} is not mp4`);
  if (!probe.faststart) reasons.push("moov atom trails mdat (no faststart)");

  if (reasons.length > 0) {
    return { action: "remux", reasons, scale: null };
  }

  return { action: "copy", reasons: ["already a faststart web-sized h264 mp4"], scale: null };
}

/** Build the exact argv handed to ffmpeg. Pure, so the encode contract is testable. */
export function buildFfmpegArgs({
  action,
  inputPath,
  outputPath,
  scale = null,
  hasAudio = true,
  crf = DEFAULT_OPTIONS.crf,
  preset = DEFAULT_OPTIONS.preset,
  audioBitrateKbps = DEFAULT_OPTIONS.audioBitrateKbps,
}) {
  const base = [
    "-hide_banner",
    "-loglevel", "error",
    // Without -nostdin a backgrounded batch run can have ffmpeg swallow the
    // parent's stdin and hang.
    "-nostdin",
    "-y",
    "-i", inputPath,
  ];

  // `0:a:0?` makes the audio map optional, so a silent master does not abort the
  // whole run on "stream not found".
  const maps = ["-map", "0:v:0", ...(hasAudio ? ["-map", "0:a:0?"] : [])];

  // Encodes land on `<name>.mp4.part` so an interrupted run cannot leave a
  // truncated file that looks finished. ffmpeg infers the muxer from the
  // extension, and `.part` matches nothing, so the container must be named
  // explicitly or every write fails at muxer init.
  const container = ["-f", "mp4"];

  if (action === "remux") {
    return [...base, ...maps, "-c", "copy", ...container, "-movflags", "+faststart", outputPath];
  }

  return [
    ...base,
    ...maps,
    ...(scale ? ["-vf", `scale=${scale.width}:${scale.height}:flags=lanczos`] : []),
    "-c:v", "libx264",
    "-preset", preset,
    "-crf", String(crf),
    // High profile is universal on anything newer than about 2012. The level is
    // deliberately left to x264, which stamps the minimum valid one; pinning 4.0
    // would fail legitimately on 1080p60 sources.
    "-profile:v", "high",
    // Non-negotiable: browsers cannot decode 4:4:4 or 10-bit H.264, and screen
    // recorders and NLE exports emit both.
    "-pix_fmt", "yuv420p",
    ...(hasAudio
      ? ["-c:a", "aac", "-b:a", `${audioBitrateKbps}k`, "-ac", "2"]
      : ["-an"]),
    ...container,
    // The whole point: rewrite the moov atom to the head of the file.
    "-movflags", "+faststart",
    outputPath,
  ];
}

/** Project encoded size before encoding. Deliberately reported as a band, not a number. */
export function estimateOutputBytes({
  width,
  height,
  fps,
  durationSeconds,
  hasAudio,
  bitsPerPixel = BITS_PER_PIXEL.mid,
  audioBitrateKbps = DEFAULT_OPTIONS.audioBitrateKbps,
}) {
  if (![width, height, fps, durationSeconds].every((value) => Number.isFinite(value) && value > 0)) {
    return null;
  }
  const videoBps = width * height * fps * bitsPerPixel;
  const audioBps = hasAudio ? audioBitrateKbps * 1000 : 0;
  return Math.round(((videoBps + audioBps) * durationSeconds) / 8);
}

/**
 * Roll entries into the corpus-level answer.
 *
 * `copy` and `remux` entries contribute their source bytes to the projection
 * because that is what will actually be delivered; only `transcode` entries get
 * an estimate, and any entry with a real measured output supersedes its estimate.
 */
export function summarizeManifest(entries) {
  const byAction = {};
  const byStatus = {};
  let sourceBytes = 0;
  let outputBytes = 0;
  let projectedLow = 0;
  let projectedMid = 0;
  let projectedHigh = 0;
  let measuredCount = 0;

  for (const entry of entries) {
    byAction[entry.action] = (byAction[entry.action] ?? 0) + 1;
    byStatus[entry.status ?? "planned"] = (byStatus[entry.status ?? "planned"] ?? 0) + 1;
    sourceBytes += entry.sourceBytes ?? 0;

    if (Number.isFinite(entry.outputBytes)) {
      outputBytes += entry.outputBytes;
      projectedLow += entry.outputBytes;
      projectedMid += entry.outputBytes;
      projectedHigh += entry.outputBytes;
      measuredCount += 1;
      continue;
    }

    if (entry.action === "copy" || entry.action === "remux") {
      projectedLow += entry.sourceBytes ?? 0;
      projectedMid += entry.sourceBytes ?? 0;
      projectedHigh += entry.sourceBytes ?? 0;
      continue;
    }

    if (entry.action === "transcode") {
      // Fall back to the source size when the probe was too thin to estimate
      // from — better an over-projection than a silently missing file.
      projectedLow += entry.estimate?.low ?? entry.sourceBytes ?? 0;
      projectedMid += entry.estimate?.mid ?? entry.sourceBytes ?? 0;
      projectedHigh += entry.estimate?.high ?? entry.sourceBytes ?? 0;
    }
  }

  const reduction = (projected) =>
    sourceBytes > 0 ? Number((1 - projected / sourceBytes).toFixed(4)) : 0;

  return {
    count: entries.length,
    byAction,
    byStatus,
    // Anything not delivered is the number that matters on a 125-file run; a
    // handful of failures must never disappear into a healthy-looking total.
    unfinished: entries.filter(
      (entry) => entry.action === "blocked" || entry.action === "error" || entry.status === "failed",
    ).length,
    measuredCount,
    sourceBytes,
    outputBytes,
    projectedBytes: { low: projectedLow, mid: projectedMid, high: projectedHigh },
    reductionFraction: {
      low: reduction(projectedHigh),
      mid: reduction(projectedMid),
      high: reduction(projectedLow),
    },
  };
}

