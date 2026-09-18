import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { hasFlag } from "../lib/data-ops-run-context.mjs";

const OPERATION = "transcode-replication-videos";

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

/** Local gate. This script performs no Postgres write, so the deployment ceremony does not apply. */
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

