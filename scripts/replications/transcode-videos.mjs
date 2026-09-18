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
 *      until it has the `moov`, so it fetches to end-of-file first: on a 4.8 GB
 *      file that is the entire download before the first frame paints.
 *
 * This script fixes both, locally, on files the operator has already pulled
 * down. It performs NO Postgres write and never contacts a deployment: it reads a
 * directory of masters and writes a directory of renditions plus a manifest.
 * Uploading the renditions and repointing `storage_id` is a separate, later
 * operation that consumes this manifest: see docs/operations/replication-media-delivery.md.
 *
 * Masters are treated as irreplaceable. The script refuses to encode a file
 * whose master is not verifiably preserved at the configured archive location,
 * and it never writes into that archive.
 *
 * Dry run (default: probes everything, plans, writes the manifest, encodes
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
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  createProductionWriteCommand,
  printProductionWriteCommand,
} from "../lib/production-write-command.mjs";
import { getFlagValue, hasFlag } from "../lib/data-ops-run-context.mjs";
import {
  analyzeAtomLayout,
  hasFaststartLayout,
  inspectMp4Atoms,
  listTopLevelAtomTypes,
  parseProbeJson,
} from "./video-container-inspection.mjs";
import {
  BITS_PER_PIXEL,
  DEFAULT_OPTIONS,
  buildFfmpegArgs,
  computeScaledDimensions,
  estimateOutputBytes,
  planVideoAction,
  summarizeManifest,
} from "./video-transcode-planning.mjs";
import {
  assertOutputSafety,
  assertToolsAvailable,
  assertTranscodeAllowed,
  classifyPreservation,
  isCompletedRendition,
  resolveMasterPath,
  sha256File,
} from "./video-transcode-policy.mjs";
import {
  buildTranscodeManifest,
  formatBytes,
  formatCorpusProjection,
} from "./video-transcode-reporting.mjs";

export {
  BITS_PER_PIXEL,
  DEFAULT_OPTIONS,
  analyzeAtomLayout,
  assertOutputSafety,
  assertToolsAvailable,
  assertTranscodeAllowed,
  buildFfmpegArgs,
  classifyPreservation,
  computeScaledDimensions,
  estimateOutputBytes,
  hasFaststartLayout,
  inspectMp4Atoms,
  isCompletedRendition,
  listTopLevelAtomTypes,
  parseProbeJson,
  planVideoAction,
  resolveMasterPath,
  sha256File,
  summarizeManifest,
};

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

// ---------------------------------------------------------------------------
// Runtime
// ---------------------------------------------------------------------------


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
  console.log("Postgres writes: none: this operation is local-only.\n");

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
      console.log(`             already rendered (${formatBytes(entry.outputBytes)}): skipping`);
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
        console.warn(`             FAILED: ffmpeg exited ${result.status}`);
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
  const manifest = buildTranscodeManifest({
    operation: OPERATION,
    generatedAt: new Date().toISOString(),
    mode: command.dryRun ? "dry-run" : "write",
    options,
    sourceDir: resolvedSource,
    mastersDir: resolvedMasters,
    outputDir: resolvedOutput,
    summary,
    entries,
  });
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  for (const line of formatCorpusProjection(summary)) {
    console.log(line);
  }
  console.log(`\nManifest: ${manifestPath}`);

  if (command.dryRun) {
    console.log(
      `\nDry run: nothing encoded, nothing copied, no Postgres writes. Re-run with --write --confirm-transcode to execute.`,
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
