#!/usr/bin/env node
/**
 * Transcode replication video masters into web-delivery H.264 renditions.
 *
 * The live replication corpus is 125 raw masters totalling ~44.6 GB (median
 * 27.5 MB, p90 984 MB, largest 4,802 MB). Nothing in this repository has ever
 * transcoded them, so the browser is handed the master. Two separate problems
 * follow from that:
 *
 *   1. Size. A multi-gigabyte master cannot be streamed over a domestic
 *      connection at playback rate, so the video stalls regardless of caching.
 *   2. Atom order. No script has ever passed `-movflags +faststart`, so the
 *      `moov` atom trails the `mdat` payload. A browser cannot begin decoding
 *      until it has the `moov`, so it fetches to end-of-file first — on a 4.8 GB
 *      file that is the entire download before the first frame paints.
 *
 * This script fixes both, locally, on files the operator has already pulled
 * down. It performs NO Convex write and never contacts a deployment: it reads a
 * directory of masters and writes a directory of renditions plus a manifest.
 * Uploading the renditions and repointing `storage_id` is a separate, later
 * operation that consumes this manifest — see docs/replication-media-delivery.md.
 *
 * Masters are treated as irreplaceable. The script refuses to encode a file
 * whose master is not verifiably preserved at the configured archive location,
 * and it never writes into that archive.
 *
 * Dry run (default — probes everything, plans, writes the manifest, encodes
 * nothing):
 *   node scripts/replications/transcode-videos.mjs \
 *     --source-dir=/vol/replication-masters \
 *     --masters-dir=/vol/replication-masters \
 *     --output-dir=/vol/replication-web
 *
 * Apply:
 *   node scripts/replications/transcode-videos.mjs \
 *     --source-dir=/vol/replication-masters \
 *     --masters-dir=/vol/replication-masters \
 *     --output-dir=/vol/replication-web \
 *     --write --confirm-transcode
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  createProductionWriteCommand,
  printProductionWriteCommand,
} from "../lib/production-write-command.mjs";
import { getFlagValue, hasFlag } from "../lib/data-ops-run-context.mjs";

const OPERATION = "transcode-replication-videos";

/**
 * Containers we are willing to read. Everything is normalised to MP4 on the way
 * out because MP4/H.264/AAC is the one combination that plays in every browser
 * without a fallback source, including Safari and iOS.
 */
const SOURCE_EXTENSIONS = new Set([
  ".mp4", ".m4v", ".mov", ".webm", ".mkv", ".avi",
  ".mpg", ".mpeg", ".wmv", ".flv", ".ogv", ".ts", ".3gp",
]);

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
// MP4 atom inspection — objective faststart verification
// ---------------------------------------------------------------------------

/**
 * Walk the top-level box list of an ISO base media file.
 *
 * `readChunk(offset, length) => Buffer` is injected so the walk is testable
 * against a synthetic buffer without touching the filesystem, and so a 4.8 GB
 * file is inspected by seeking over box headers instead of being read.
 */
export function analyzeAtomLayout(readChunk, fileSize, { limit = 64 } = {}) {
  const atoms = [];
  let offset = 0;
  let truncated = false;

  while (offset + 8 <= fileSize && atoms.length < limit) {
    const header = readChunk(offset, 16);
    if (!header || header.length < 8) break;

    const type = header.toString("latin1", 4, 8);
    // A non-printable type means we have lost sync with the box grid; stop
    // rather than report garbage as an atom list.
    if (!/^[\x20-\x7e]{4}$/.test(type)) break;

    let size = header.readUInt32BE(0);
    let headerSize = 8;

    if (size === 1) {
      if (header.length < 16) break;
      size = Number(header.readBigUInt64BE(8));
      headerSize = 16;
    } else if (size === 0) {
      // Box runs to end of file.
      size = fileSize - offset;
    }

    atoms.push(type);
    if (size < headerSize) break;

    // A box that claims to end past EOF means the file is short. This is the
    // only reliable truncation signal for a faststart file: with the moov at
    // the head, ffprobe happily reports full dimensions and duration for a file
    // whose payload was cut off, so a probe alone cannot tell them apart.
    if (offset + size > fileSize) {
      truncated = true;
      break;
    }
    offset += size;
  }

  return { atoms, truncated, faststart: hasFaststartLayout(atoms) && !truncated };
}

/** Convenience wrapper: the top-level box types in file order. */
export function listTopLevelAtomTypes(readChunk, fileSize, options) {
  return analyzeAtomLayout(readChunk, fileSize, options).atoms;
}

/**
 * `moov` before `mdat` is precisely what `-movflags +faststart` produces and
 * precisely what lets a browser start decoding from the first bytes it receives.
 */
export function hasFaststartLayout(atomTypes) {
  const moov = atomTypes.indexOf("moov");
  if (moov === -1) return false;
  const mdat = atomTypes.indexOf("mdat");
  if (mdat === -1) return true;
  return moov < mdat;
}

export function inspectMp4Atoms(filePath) {
  const stats = fs.statSync(filePath);
  const fd = fs.openSync(filePath, "r");
  try {
    const readChunk = (offset, length) => {
      const buffer = Buffer.alloc(length);
      const read = fs.readSync(fd, buffer, 0, length, offset);
      return buffer.subarray(0, read);
    };
    return analyzeAtomLayout(readChunk, stats.size);
  } finally {
    fs.closeSync(fd);
  }
}

// ---------------------------------------------------------------------------
// Probe normalisation
// ---------------------------------------------------------------------------

function parseRational(value) {
  if (typeof value !== "string" || !value.includes("/")) {
    const direct = Number(value);
    return Number.isFinite(direct) && direct > 0 ? direct : null;
  }
  const [numerator, denominator] = value.split("/").map(Number);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    return null;
  }
  const rate = numerator / denominator;
  return Number.isFinite(rate) && rate > 0 ? rate : null;
}

/** Normalise raw `ffprobe -print_format json` output into the shape the planner uses. */
export function parseProbeJson(raw) {
  const streams = Array.isArray(raw?.streams) ? raw.streams : [];
  const format = raw?.format ?? {};
  const videoStream = streams.find((stream) => stream.codec_type === "video");
  const audioStream = streams.find((stream) => stream.codec_type === "audio");

  const durationSeconds =
    Number(format.duration) || Number(videoStream?.duration) || null;
  const bitrateBps = Number(format.bit_rate) || null;

  return {
    formatNames: String(format.format_name ?? "")
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean),
    sizeBytes: Number(format.size) || null,
    durationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : null,
    bitrateBps: Number.isFinite(bitrateBps) ? bitrateBps : null,
    video: videoStream
      ? {
          codec: videoStream.codec_name ?? null,
          width: Number(videoStream.width) || null,
          height: Number(videoStream.height) || null,
          pixelFormat: videoStream.pix_fmt ?? null,
          fps:
            parseRational(videoStream.avg_frame_rate) ??
            parseRational(videoStream.r_frame_rate),
        }
      : null,
    audio: audioStream
      ? { codec: audioStream.codec_name ?? null, channels: Number(audioStream.channels) || null }
      : null,
    hasAudio: Boolean(audioStream),
  };
}

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

// ---------------------------------------------------------------------------
// Master preservation
// ---------------------------------------------------------------------------

/** Where a given source file's master must live inside the archive, mirroring subdirectories. */
export function resolveMasterPath(sourcePath, sourceDir, mastersDir) {
  return path.join(mastersDir, path.relative(sourceDir, sourcePath));
}

/**
 * The hard precondition. Encoding is irreversible for the delivered file, so no
 * file is touched until its master is accounted for.
 *
 * `conflict` is deliberately terminal: an archive entry that exists with a
 * different size is either a different cut or a truncated copy, and overwriting
 * it to "fix" the mismatch is exactly the destructive act this guard exists to
 * prevent.
 */
export function classifyPreservation({
  inPlace,
  masterExists,
  sourceBytes,
  masterBytes,
}) {
  if (inPlace) {
    return { state: "in-place", reason: "source directory is the master archive" };
  }
  if (!masterExists) {
    return { state: "needs-copy", reason: "no archived master yet" };
  }
  if (sourceBytes === masterBytes) {
    return { state: "preserved", reason: "archived master matches source size" };
  }
  return {
    state: "conflict",
    reason: `archived master is ${masterBytes} bytes but source is ${sourceBytes} bytes`,
  };
}

/**
 * Refuse any layout where the run could write over its own inputs or into the
 * archive. Checked once, up front, before a single frame is decoded.
 */
export function assertOutputSafety({ sourceDir, mastersDir, outputDir }) {
  const within = (child, parent) => {
    const relative = path.relative(parent, child);
    return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
  };

  if (within(outputDir, mastersDir)) {
    throw new Error(
      `Output directory ${outputDir} is inside the master archive ${mastersDir}. Renditions must never be written into the archive.`,
    );
  }
  if (within(outputDir, sourceDir)) {
    throw new Error(
      `Output directory ${outputDir} is inside the source directory ${sourceDir}. Renditions must never be written beside their inputs.`,
    );
  }
}

export function sha256File(filePath) {
  const hash = crypto.createHash("sha256");
  const fd = fs.openSync(filePath, "r");
  try {
    const buffer = Buffer.alloc(1024 * 1024);
    let bytesRead = fs.readSync(fd, buffer, 0, buffer.length, null);
    while (bytesRead > 0) {
      hash.update(buffer.subarray(0, bytesRead));
      bytesRead = fs.readSync(fd, buffer, 0, buffer.length, null);
    }
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest("hex");
}

// ---------------------------------------------------------------------------
// Tool discovery
// ---------------------------------------------------------------------------

export function assertToolsAvailable(runner = spawnSync) {
  const missing = [];
  for (const bin of ["ffmpeg", "ffprobe"]) {
    const result = runner(bin, ["-version"], { encoding: "utf8" });
    if (result.error || result.status !== 0) missing.push(bin);
  }
  if (missing.length > 0) {
    throw new Error(
      `Missing required tool(s): ${missing.join(", ")}. Install FFmpeg (macOS: \`brew install ffmpeg\`; Debian/Ubuntu: \`apt install ffmpeg\`) and re-run.`,
    );
  }
}

/** Local gate. This script performs no Convex write, so the deployment ceremony does not apply. */
export function assertTranscodeAllowed(command, argv) {
  if (!command?.writeRequested) {
    throw new Error(`${OPERATION} requires --write to encode anything.`);
  }
  if (command.dryRun) {
    throw new Error("--dry-run and --write cannot be combined.");
  }
  if (!hasFlag(argv, "--confirm-transcode")) {
    throw new Error(`${OPERATION} requires --confirm-transcode alongside --write.`);
  }
}

// ---------------------------------------------------------------------------
// Runtime
// ---------------------------------------------------------------------------

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return "n/a";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 100 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function collectVideoFiles(dir) {
  const found = [];
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        found.push(full);
      }
    }
  };
  walk(dir);
  return found;
}

export function probeVideo(filePath, runner = spawnSync) {
  const result = runner(
    "ffprobe",
    ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", filePath],
    { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
  );
  if (result.error || result.status !== 0) {
    throw new Error(`ffprobe failed for ${filePath}: ${(result.stderr || result.error?.message || "").trim()}`);
  }
  const probe = parseProbeJson(JSON.parse(result.stdout));
  probe.sizeBytes = probe.sizeBytes ?? fs.statSync(filePath).size;
  // ffprobe reports neither atom order nor truncation, so both facts come from
  // reading the box grid directly.
  const isIsoBmff = probe.formatNames.some((name) => name === "mp4" || name === "mov");
  const layout = isIsoBmff ? inspectMp4Atoms(filePath) : { faststart: false, truncated: false };
  probe.faststart = layout.faststart;
  probe.truncated = layout.truncated;
  return probe;
}

/**
 * Does a rendition at `outputPath` count as finished work to skip?
 *
 * Pure so the resumption rule is testable without encoding anything. It is
 * deliberately strict: `moov` at the head is what makes a truncated file look
 * healthy to a probe, so structural completeness and a duration that matches
 * the master are both required before a file is trusted.
 */
export function isCompletedRendition(outputProbe, { expectedDurationSeconds = null, tolerance = 0.05 } = {}) {
  if (!outputProbe?.video?.width) return { complete: false, reason: "no decodable video stream" };
  if (outputProbe.truncated) return { complete: false, reason: "file is truncated (a box runs past EOF)" };
  if (outputProbe.faststart !== true) return { complete: false, reason: "moov atom is not leading" };

  if (Number.isFinite(expectedDurationSeconds) && Number.isFinite(outputProbe.durationSeconds)) {
    const drift = Math.abs(outputProbe.durationSeconds - expectedDurationSeconds);
    if (drift > Math.max(0.5, expectedDurationSeconds * tolerance)) {
      return {
        complete: false,
        reason: `duration ${outputProbe.durationSeconds.toFixed(1)}s does not match the master's ${expectedDurationSeconds.toFixed(1)}s`,
      };
    }
  }

  return { complete: true, reason: "matches the master and has a leading moov" };
}

/**
 * Resumption is derived from the filesystem, never from a ledger that can go
 * stale. Encodes land on `<name>.part` and are renamed only on a zero exit, so
 * an interrupted run cannot leave a half-written file at the final path; this
 * check additionally re-validates whatever is already there.
 */
function inspectExistingOutput(outputPath, expectedDurationSeconds) {
  if (!fs.existsSync(outputPath)) return { complete: false, reason: "not rendered yet" };
  try {
    return isCompletedRendition(probeVideo(outputPath), { expectedDurationSeconds });
  } catch (error) {
    return { complete: false, reason: `unreadable (${error.message})` };
  }
}

function readIntFlag(argv, name, fallback) {
  const raw = getFlagValue(argv, name);
  if (raw === null) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`${name} must be a number.`);
  return value;
}

async function main() {
  const argv = process.argv.slice(2);
  const command = createProductionWriteCommand({ operation: OPERATION });
  printProductionWriteCommand(command);
  console.log("Convex writes: none — this operation is local-only.\n");

  const sourceDir = getFlagValue(argv, "--source-dir");
  const mastersDir = getFlagValue(argv, "--masters-dir");
  const outputDir = getFlagValue(argv, "--output-dir");

  if (!sourceDir) throw new Error("Pass --source-dir=<directory of master videos>.");
  if (!mastersDir) {
    throw new Error(
      "Pass --masters-dir=<archive directory>. Masters must be preserved before anything is encoded; set it equal to --source-dir when the source directory is itself the archive.",
    );
  }
  if (!outputDir) throw new Error("Pass --output-dir=<directory for web renditions>.");
  if (!fs.existsSync(sourceDir)) throw new Error(`Source directory not found: ${sourceDir}`);

  const options = {
    maxDimension: readIntFlag(argv, "--max-dimension", DEFAULT_OPTIONS.maxDimension),
    crf: readIntFlag(argv, "--crf", DEFAULT_OPTIONS.crf),
    preset: getFlagValue(argv, "--preset") ?? DEFAULT_OPTIONS.preset,
    audioBitrateKbps: readIntFlag(argv, "--audio-bitrate", DEFAULT_OPTIONS.audioBitrateKbps),
    maxBitrateKbps: readIntFlag(argv, "--max-bitrate-kbps", DEFAULT_OPTIONS.maxBitrateKbps),
  };
  const verifyHash = hasFlag(argv, "--verify-hash");
  const limit = readIntFlag(argv, "--limit", Infinity);
  const only = getFlagValue(argv, "--only");

  const resolvedSource = fs.realpathSync(sourceDir);
  const resolvedMasters = fs.existsSync(mastersDir) ? fs.realpathSync(mastersDir) : path.resolve(mastersDir);
  const resolvedOutput = path.resolve(outputDir);
  const inPlace = resolvedSource === resolvedMasters;

  // Checked before the first file is touched. Archiving a master is a write in
  // its own right, so a run missing the confirmation must fail here rather than
  // after it has already started copying gigabytes around.
  if (!command.dryRun) assertTranscodeAllowed(command, argv);
  assertToolsAvailable();
  assertOutputSafety({
    sourceDir: resolvedSource,
    mastersDir: resolvedMasters,
    outputDir: resolvedOutput,
  });

  console.log(`Source     : ${resolvedSource}`);
  console.log(`Masters    : ${resolvedMasters}${inPlace ? "  (in-place archive)" : ""}`);
  console.log(`Output     : ${resolvedOutput}`);
  console.log(
    `Encode     : h264 crf ${options.crf} preset ${options.preset}, long edge <= ${options.maxDimension}px, yuv420p, aac ${options.audioBitrateKbps}k, +faststart\n`,
  );

  let files = collectVideoFiles(resolvedSource);
  if (only) files = files.filter((file) => file.includes(only));
  files = files.slice(0, Number.isFinite(limit) ? limit : undefined);

  if (files.length === 0) {
    console.log("No video files matched.");
    return;
  }

  fs.mkdirSync(resolvedOutput, { recursive: true });

  const entries = [];
  let encoded = 0;
  let resumed = 0;

  for (const [index, sourcePath] of files.entries()) {
    const relative = path.relative(resolvedSource, sourcePath);
    console.log(`[${index + 1}/${files.length}] ${relative}`);
    const sourceBytes = fs.statSync(sourcePath).size;
    const outputPath = path.join(
      resolvedOutput,
      path.dirname(relative),
      `${path.basename(relative, path.extname(relative))}.mp4`,
    );

    const entry = {
      source: relative,
      sourceBytes,
      output: path.relative(resolvedOutput, outputPath),
    };

    // --- master preservation gate -------------------------------------------
    const masterPath = inPlace ? sourcePath : resolveMasterPath(sourcePath, resolvedSource, resolvedMasters);
    const masterExists = !inPlace && fs.existsSync(masterPath);
    let preservation = classifyPreservation({
      inPlace,
      masterExists,
      sourceBytes,
      masterBytes: masterExists ? fs.statSync(masterPath).size : null,
    });

    if (preservation.state === "conflict") {
      entry.action = "blocked";
      entry.reasons = [preservation.reason];
      entry.preservation = preservation;
      entries.push(entry);
      console.warn(`  BLOCKED  ${preservation.reason}`);
      continue;
    }

    if (preservation.state === "needs-copy") {
      if (command.dryRun) {
        console.log(`  would archive master -> ${masterPath}`);
      } else {
        fs.mkdirSync(path.dirname(masterPath), { recursive: true });
        fs.copyFileSync(sourcePath, `${masterPath}.part`);
        fs.renameSync(`${masterPath}.part`, masterPath);
        // A copy we just made is the one case that must always be digested:
        // a short write would otherwise pass a size check and lose the master.
        if (sha256File(masterPath) !== sha256File(sourcePath)) {
          throw new Error(`Master copy verification failed for ${relative}. Aborting before any encode.`);
        }
        preservation = { state: "preserved", reason: "archived and hash-verified this run" };
        console.log(`  archived master -> ${masterPath} (sha256 verified)`);
      }
    } else if (verifyHash && preservation.state === "preserved") {
      if (sha256File(masterPath) !== sha256File(sourcePath)) {
        entry.action = "blocked";
        entry.reasons = ["archived master hash differs from source"];
        entry.preservation = { state: "conflict", reason: "hash mismatch" };
        entries.push(entry);
        console.warn("  BLOCKED  archived master hash differs from source");
        continue;
      }
    }
    entry.preservation = preservation;

    // --- probe and plan ------------------------------------------------------
    let probe;
    try {
      probe = probeVideo(sourcePath);
    } catch (error) {
      entry.action = "error";
      entry.reasons = [error.message];
      entries.push(entry);
      console.warn(`  ERROR  ${error.message}`);
      continue;
    }

    const plan = planVideoAction(probe, options);
    entry.action = plan.action;
    entry.reasons = plan.reasons;
    entry.sourceCodec = probe.video?.codec ?? null;
    entry.sourcePixelFormat = probe.video?.pixelFormat ?? null;
    entry.sourceWidth = probe.video?.width ?? null;
    entry.sourceHeight = probe.video?.height ?? null;
    entry.sourceFps = probe.video?.fps ?? null;
    entry.durationSeconds = probe.durationSeconds;
    entry.hasAudio = probe.hasAudio;
    entry.sourceFaststart = probe.faststart;
    entry.outputWidth = plan.scale?.width ?? probe.video?.width ?? null;
    entry.outputHeight = plan.scale?.height ?? probe.video?.height ?? null;

    const estimateFor = (bpp) =>
      estimateOutputBytes({
        width: entry.outputWidth,
        height: entry.outputHeight,
        fps: entry.sourceFps,
        durationSeconds: entry.durationSeconds,
        hasAudio: entry.hasAudio,
        bitsPerPixel: bpp,
        audioBitrateKbps: options.audioBitrateKbps,
      });
    entry.estimate = {
      low: estimateFor(BITS_PER_PIXEL.low),
      mid: estimateFor(BITS_PER_PIXEL.mid),
      high: estimateFor(BITS_PER_PIXEL.high),
    };

    const dimensions = `${entry.sourceWidth}x${entry.sourceHeight}`;
    const target =
      plan.scale ? ` -> ${entry.outputWidth}x${entry.outputHeight}` : "";
    console.log(
      `  ${plan.action.toUpperCase().padEnd(9)} ${formatBytes(sourceBytes)}  ${dimensions}${target}  ${
        entry.durationSeconds ? `${entry.durationSeconds.toFixed(1)}s` : "unknown duration"
      }  ${entry.hasAudio ? "audio" : "silent"}${entry.sourceFaststart ? "  faststart" : ""}`,
    );
    for (const reason of plan.reasons) console.log(`             ${reason}`);

    if (plan.action === "error") {
      entries.push(entry);
      continue;
    }

    // --- resumability --------------------------------------------------------
    const existing = inspectExistingOutput(outputPath, entry.durationSeconds);
    if (existing.complete) {
      entry.outputBytes = fs.statSync(outputPath).size;
      entry.outputFaststart = true;
      entry.status = "already-done";
      resumed += 1;
      entries.push(entry);
      console.log(`             already rendered (${formatBytes(entry.outputBytes)}) — skipping`);
      continue;
    }
    if (fs.existsSync(outputPath)) {
      console.log(`             redoing: existing rendition ${existing.reason}`);
    }

    if (command.dryRun) {
      entry.status = "planned";
      entry.ffmpegArgs =
        plan.action === "copy"
          ? null
          : buildFfmpegArgs({
              action: plan.action,
              inputPath: sourcePath,
              outputPath,
              scale: plan.scale,
              hasAudio: probe.hasAudio,
              crf: options.crf,
              preset: options.preset,
              audioBitrateKbps: options.audioBitrateKbps,
            });
      entries.push(entry);
      continue;
    }

    // --- execute -------------------------------------------------------------
    assertTranscodeAllowed(command, argv);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    const partPath = `${outputPath}.part`;
    // Discard any debris from an interrupted previous run rather than resuming
    // into it; ffmpeg's -y will overwrite, but an orphan part after a `copy`
    // would otherwise linger.
    if (fs.existsSync(partPath)) fs.rmSync(partPath);

    const startedAt = Date.now();

    if (plan.action === "copy") {
      fs.copyFileSync(sourcePath, partPath);
    } else {
      const args = buildFfmpegArgs({
        action: plan.action,
        inputPath: sourcePath,
        outputPath: partPath,
        scale: plan.scale,
        hasAudio: probe.hasAudio,
        crf: options.crf,
        preset: options.preset,
        audioBitrateKbps: options.audioBitrateKbps,
      });
      entry.ffmpegArgs = args;
      const result = spawnSync("ffmpeg", args, { stdio: ["ignore", "inherit", "inherit"] });
      if (result.status !== 0) {
        if (fs.existsSync(partPath)) fs.rmSync(partPath);
        entry.status = "failed";
        entry.reasons = [...entry.reasons, `ffmpeg exited ${result.status}`];
        entries.push(entry);
        console.warn(`             FAILED — ffmpeg exited ${result.status}`);
        continue;
      }
    }

    fs.renameSync(partPath, outputPath);

    const outputProbe = probeVideo(outputPath);
    entry.outputBytes = fs.statSync(outputPath).size;
    entry.outputWidth = outputProbe.video?.width ?? entry.outputWidth;
    entry.outputHeight = outputProbe.video?.height ?? entry.outputHeight;
    entry.outputFaststart = outputProbe.faststart;
    entry.status = "encoded";
    entry.elapsedSeconds = Number(((Date.now() - startedAt) / 1000).toFixed(1));
    encoded += 1;
    entries.push(entry);

    if (!entry.outputFaststart) {
      console.warn("             WARNING: output moov atom still trails mdat");
    }
    console.log(
      `             ${formatBytes(sourceBytes)} -> ${formatBytes(entry.outputBytes)}  (${(
        (1 - entry.outputBytes / sourceBytes) * 100
      ).toFixed(1)}% smaller, ${entry.elapsedSeconds}s, moov ${entry.outputFaststart ? "leading" : "TRAILING"})`,
    );
  }

  // --- manifest --------------------------------------------------------------
  const summary = summarizeManifest(entries);
  const manifestPath = getFlagValue(argv, "--manifest") ?? path.join(resolvedOutput, "transcode-manifest.json");
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(
    manifestPath,
    `${JSON.stringify(
      {
        operation: OPERATION,
        generatedAt: new Date().toISOString(),
        mode: command.dryRun ? "dry-run" : "write",
        options,
        sourceDir: resolvedSource,
        mastersDir: resolvedMasters,
        outputDir: resolvedOutput,
        summary,
        entries,
      },
      null,
      2,
    )}\n`,
  );

  console.log(`\n--- Corpus projection -------------------------------------------`);
  console.log(`Files              : ${summary.count}`);
  for (const [action, count] of Object.entries(summary.byAction).sort()) {
    console.log(`  ${action.padEnd(17)}: ${count}`);
  }
  if (summary.unfinished > 0) {
    console.log(`Not delivered      : ${summary.unfinished} (blocked, unreadable, or failed)`);
  }
  console.log(`Master total       : ${formatBytes(summary.sourceBytes)}`);
  console.log(`Measured renditions: ${summary.measuredCount} (${formatBytes(summary.outputBytes)})`);
  console.log(
    `Projected delivered: ${formatBytes(summary.projectedBytes.low)} – ${formatBytes(
      summary.projectedBytes.high,
    )} (central ${formatBytes(summary.projectedBytes.mid)})`,
  );
  console.log(
    `Reduction          : ${(summary.reductionFraction.low * 100).toFixed(1)}% – ${(
      summary.reductionFraction.high * 100
    ).toFixed(1)}% (central ${(summary.reductionFraction.mid * 100).toFixed(1)}%)`,
  );
  if (summary.measuredCount < summary.count) {
    console.log(
      `Projection uses ${BITS_PER_PIXEL.low}–${BITS_PER_PIXEL.high} bits/pixel/frame for un-encoded files; measured files use their real size.`,
    );
  }
  console.log(`\nManifest: ${manifestPath}`);

  if (command.dryRun) {
    console.log(
      `\nDry run — nothing encoded, nothing copied, no Convex writes. Re-run with --write --confirm-transcode to execute.`,
    );
    return;
  }
  console.log(`\nEncoded ${encoded} file(s); ${resumed} already complete from a previous run.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    // Lead with the message: these failures are operator-facing preconditions,
    // not crashes, and the stack buries the one line that says what to fix.
    console.error(`\n${error.message}\n`);
    if (process.env.DEBUG) console.error(error);
    process.exit(1);
  });
}
