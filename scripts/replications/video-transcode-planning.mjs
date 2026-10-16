export const DEFAULT_OPTIONS = Object.freeze({
  maxDimension: 1920,
  crf: 21,
  preset: "medium",
  audioBitrateKbps: 128,
  maxBitrateKbps: 4500,
});

export const BITS_PER_PIXEL = Object.freeze({ low: 0.04, mid: 0.07, high: 0.10 });

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

export function planVideoAction(probe, options = DEFAULT_OPTIONS) {
  const { maxDimension, maxBitrateKbps } = { ...DEFAULT_OPTIONS, ...options };
  const reasons = [];

  if (!probe?.video || !probe.video.width || !probe.video.height) {
    return { action: "error", reasons: ["no decodable video stream"], scale: null };
  }

  const { codec, width, height, pixelFormat } = probe.video;
  const scale = computeScaledDimensions({ width, height, maxDimension });

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
    "-nostdin",
    "-y",
    "-i", inputPath,
  ];

  const maps = ["-map", "0:v:0", ...(hasAudio ? ["-map", "0:a:0?"] : [])];

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
    "-profile:v", "high",
    "-pix_fmt", "yuv420p",
    ...(hasAudio
      ? ["-c:a", "aac", "-b:a", `${audioBitrateKbps}k`, "-ac", "2"]
      : ["-an"]),
    ...container,
    "-movflags", "+faststart",
    outputPath,
  ];
}

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

