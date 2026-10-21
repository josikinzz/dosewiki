#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { spawnSync } from "node:child_process";
import { createDataClient, resolvePostgresSource } from "../lib/data-client.ts";
import { api } from "../../lib/postgres/runtime/api.ts"
import {
  authorizeProductionWrite,
  createProductionWriteCommand,
  printProductionWriteCommand,
  requireProductionWriteCredential,
} from "../lib/production-write-command.mjs";
import { getFlagValue, hasFlag } from "../lib/data-ops-run-context.mjs";
import { hostOf, isProductionUrl } from "./lib/media-hosts.mjs";
import { chunk } from "./repoint-renditions.mjs";
import { uploadReplicationFile, updateReplicationMedia } from "./lib/r2-upload.mjs";
import {
  assertToolsAvailable,
  computeScaledDimensions,
  estimateOutputBytes,
  parseProbeJson,
  probeVideo,
} from "./transcode-videos.mjs";

const OPERATION = "generate-preview-renditions";

export const PREVIEW_SPEC = Object.freeze({
  maxSeconds: 10,
  maxLongEdge: 480,
  crf: 30,
  preset: "veryfast",
  maxFps: 30,
});

export function planPreviewGeneration(rows, { force = false } = {}) {
  const actions = [];
  const skipped = [];

  const videoRows = rows.filter(
    (row) => row.type === "video" && (row.role ?? "replication") === "replication",
  );

  for (const row of videoRows) {
    if ((row.preview_r2_key || row.preview_storage_id) && !force) {
      skipped.push({ slug: row.slug, reason: "already has a preview rendition (use --force to redo)" });
      continue;
    }
    if (!row.url) {
      skipped.push({ slug: row.slug, reason: "resolved url is null — nothing to derive a preview from" });
      continue;
    }
    if (!isProductionUrl(row.url)) {
      skipped.push({
        slug: row.slug,
        reason: `rendition still served from ${hostOf(row.url) ?? "an unknown host"} — repoint it before deriving previews`,
      });
      continue;
    }

    actions.push({
      rowId: row._id,
      slug: row.slug,
      sourceUrl: row.url,
      expectedStorageId: row.storage_id,
      expectedR2Key: row.r2_key ?? null,
      durationSeconds: Number.isFinite(row.duration) ? row.duration : null,
      width: Number.isFinite(row.width) ? row.width : null,
      height: Number.isFinite(row.height) ? row.height : null,
      hadPreview: Boolean(row.preview_r2_key || row.preview_storage_id),
    });
  }

  return { actions, skipped, videoRowCount: videoRows.length };
}

export function buildPreviewFfmpegArgs({
  inputPath,
  outputPath,
  scale = null,
  fps = null,
  spec = PREVIEW_SPEC,
}) {
  const filters = [];
  if (scale) filters.push(`scale=${scale.width}:${scale.height}:flags=lanczos`);
  if (Number.isFinite(fps) && fps > spec.maxFps) filters.push(`fps=${spec.maxFps}`);

  return [
    "-hide_banner",
    "-loglevel", "error",
    "-nostdin",
    "-y",
    "-i", inputPath,
    "-t", String(spec.maxSeconds),
    "-map", "0:v:0",
    ...(filters.length > 0 ? ["-vf", filters.join(",")] : []),
    "-c:v", "libx264",
    "-preset", spec.preset,
    "-crf", String(spec.crf),
    "-profile:v", "high",
    "-pix_fmt", "yuv420p",
    "-an",
    "-f", "mp4",
    "-movflags", "+faststart",
    outputPath,
  ];
}

export function estimatePreviewBytes(
  { width, height, fps, durationSeconds },
  spec = PREVIEW_SPEC,
) {
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  const scale = computeScaledDimensions({ width, height, maxDimension: spec.maxLongEdge });
  const outWidth = scale?.width ?? width;
  const outHeight = scale?.height ?? height;
  return estimateOutputBytes({
    width: outWidth,
    height: outHeight,
    fps: Math.min(Number.isFinite(fps) ? fps : spec.maxFps, spec.maxFps),
    durationSeconds: Math.min(
      Number.isFinite(durationSeconds) ? durationSeconds : spec.maxSeconds,
      spec.maxSeconds,
    ),
    hasAudio: false,
  });
}

export function verifyPreviewGeneration({ before, after }) {
  if (!after) {
    return { ok: false, reasons: ["row no longer exists in the public resolver output"] };
  }

  const reasons = [];

  if (typeof after.preview_url !== "string" || after.preview_url.length === 0) {
    reasons.push("resolved preview_url is null — the write did not take effect");
  } else if (!isProductionUrl(after.preview_url)) {
    reasons.push(
      `resolved preview_url points at ${hostOf(after.preview_url) ?? "an unknown host"}, outside the configured R2 media namespace`,
    );
  }

  if ((after.url ?? null) !== (before?.url ?? null)) {
    reasons.push("resolved url CHANGED — preview generation must never touch the delivered rendition");
  }
  if ((after.thumbnail_url ?? null) !== (before?.thumbnail_url ?? null)) {
    reasons.push("resolved thumbnail_url CHANGED — preview generation must never touch the poster");
  }

  return { ok: reasons.length === 0, reasons };
}

export function isAcceptablePreview(probe, spec = PREVIEW_SPEC) {
  if (!probe?.video?.width || !probe?.video?.height) {
    return { ok: false, reason: "no decodable video stream" };
  }
  if (probe.truncated) return { ok: false, reason: "file is truncated (a box runs past EOF)" };
  if (probe.faststart !== true) return { ok: false, reason: "moov atom is not leading" };
  if (probe.hasAudio) return { ok: false, reason: "preview carries an audio track" };
  if (Math.max(probe.video.width, probe.video.height) > spec.maxLongEdge) {
    return {
      ok: false,
      reason: `long edge ${Math.max(probe.video.width, probe.video.height)}px exceeds the ${spec.maxLongEdge}px cap`,
    };
  }
  if (Number.isFinite(probe.durationSeconds) && probe.durationSeconds > spec.maxSeconds + 0.5) {
    return { ok: false, reason: `duration ${probe.durationSeconds.toFixed(1)}s exceeds the ${spec.maxSeconds}s cap` };
  }
  return { ok: true, reason: "faststart, muted, within the size and duration caps" };
}

function probeRemote(url, runner = spawnSync) {
  const result = runner(
    "ffprobe",
    ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", url],
    { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
  );
  if (result.error || result.status !== 0) return null;
  try {
    return parseProbeJson(JSON.parse(result.stdout));
  } catch {
    return null;
  }
}

async function downloadToFile(url, filePath) {
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Download failed: ${response.status} ${response.statusText} for ${url}`);
  }
  await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(filePath));
  return fs.statSync(filePath).size;
}

function runFfmpeg(args) {
  const result = spawnSync("ffmpeg", args, { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  if (result.error || result.status !== 0) {
    throw new Error(`ffmpeg failed: ${(result.stderr || result.error?.message || "").trim()}`);
  }
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return "unknown";
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

async function fetchPublicRows(client) {
  return client.query(api.replications.getPublicReplications, {});
}

async function fetchResolvedRow(client, apiKey, rowId) {
  return client.query(api.replications.getResolvedById, { apiKey, id: rowId });
}

async function main() {
  const argv = process.argv.slice(2);
  const command = createProductionWriteCommand({ operation: OPERATION });
  printProductionWriteCommand(command);
  if (command.writeRequested) authorizeProductionWrite(command);

  const batchSize = Number(getFlagValue(argv, "--batch-size") ?? 5);
  const limit = getFlagValue(argv, "--limit") ? Number(getFlagValue(argv, "--limit")) : null;
  const force = hasFlag(argv, "--force");
  const scratchDir = path.resolve(
    getFlagValue(argv, "--scratch-dir") ?? path.join(os.tmpdir(), "dosewiki-preview-renditions"),
  );

  assertToolsAvailable();

  const readUrl = command.writeRequested ? command.targetUrl : resolvePostgresSource({}).url;
  if (!readUrl) {
    throw new Error("Set --target/TARGET_POSTGRES_URL (or SOURCE_POSTGRES_URL for a dry run).");
  }
  const readClient = createDataClient({ target: readUrl }).client;

  const rows = await fetchPublicRows(readClient);
  const plan = planPreviewGeneration(rows, { force });
  const actions = limit ? plan.actions.slice(0, limit) : plan.actions;
  const batches = chunk(actions, batchSize);

  let probedRemotely = 0;
  for (const action of actions) {
    if (action.durationSeconds !== null && action.width !== null && action.height !== null) continue;
    const probe = probeRemote(action.sourceUrl);
    if (probe) {
      action.durationSeconds ??= probe.durationSeconds;
      action.width ??= probe.video?.width ?? null;
      action.height ??= probe.video?.height ?? null;
      probedRemotely += 1;
    }
  }

  const projectedTotal = actions.reduce(
    (sum, action) => sum + (estimatePreviewBytes(action) ?? 0),
    0,
  );

  console.log(`\nRows read       : ${rows.length} (${plan.videoRowCount} video replications)`);
  console.log(`Preview plan    : ${actions.length} row(s) in ${batches.length} batch(es) of ${batchSize}${limit ? ` (limited from ${plan.actions.length})` : ""}`);
  console.log(`Skipped         : ${plan.skipped.length}`);
  console.log(`Field written   : preview_r2_key (additive; source and thumbnails are never touched)`);
  console.log(`Encode spec     : first ${PREVIEW_SPEC.maxSeconds}s · ${PREVIEW_SPEC.maxLongEdge}px long edge, no upscale · H.264 High yuv420p · CRF ${PREVIEW_SPEC.crf} ${PREVIEW_SPEC.preset} · ≤${PREVIEW_SPEC.maxFps}fps · muted · faststart`);
  console.log(`Projected bytes : ~${formatBytes(projectedTotal)} across the run${probedRemotely ? ` (${probedRemotely} duration(s) probed remotely via ffprobe)` : ""}\n`);

  for (const entry of plan.skipped) console.log(`  SKIP ${entry.slug}: ${entry.reason}`);
  for (const action of actions.slice(0, 10)) {
    const duration = action.durationSeconds ? `${action.durationSeconds.toFixed(1)}s` : "unknown duration";
    console.log(
      `  ${action.slug}\n    ${duration} @ ${action.width ?? "?"}x${action.height ?? "?"} -> preview ~${formatBytes(estimatePreviewBytes(action))}`,
    );
  }
  if (actions.length > 10) console.log(`  … and ${actions.length - 10} more`);

  if (command.dryRun) {
    console.log("\nPer-row verification that would run after each write:");
    console.log("  1. re-query api.replications.getResolvedById (same resolver the site's queries use, one row)");
    console.log("  2. require the resolved preview_url to be non-null and in the configured R2 media namespace");
    console.log("  3. require the resolved url to be UNCHANGED       — a null url removes the page");
    console.log("  4. require the resolved thumbnail_url to be UNCHANGED");
    console.log("  A failing row stops the entire run before the next row.");
    console.log("\nDry run: nothing downloaded, nothing encoded, no Postgres writes performed.");
    return;
  }

  const { token: apiKey } = requireProductionWriteCredential("replicationMaintenance");
  const writeClient = createDataClient({ target: command.targetUrl }).client;

  fs.mkdirSync(scratchDir, { recursive: true });
  const ledgerPath = path.join(scratchDir, `preview-ledger-${Date.now()}.json`);
  const ledger = [];
  const writeLedger = () =>
    fs.writeFileSync(ledgerPath, `${JSON.stringify({ operation: OPERATION, entries: ledger }, null, 2)}\n`);

  let generated = 0;

  for (const [batchIndex, batch] of batches.entries()) {
    console.log(`\n--- Batch ${batchIndex + 1}/${batches.length} ---`);

    for (const action of batch) {
      const live = await fetchResolvedRow(writeClient, apiKey, action.rowId);
      if (!live) throw new Error(`${action.slug}: row no longer exists. Stopping.`);
      if ((live.storage_id ?? null) !== (action.expectedStorageId ?? null) ||
          (live.r2_key ?? null) !== action.expectedR2Key) {
        throw new Error(
          `${action.slug}: media identity changed since the reviewed plan. Stopping.`,
        );
      }
      if ((live.preview_r2_key || live.preview_storage_id) && !force && !action.hadPreview) {
        console.log(`  ${action.slug}: preview appeared since the plan — skipping.`);
        continue;
      }

      const before = { url: live.url, thumbnail_url: live.thumbnail_url };
      const sourcePath = path.join(scratchDir, `${action.slug}.source.mp4`);
      const previewPath = path.join(scratchDir, `${action.slug}.preview.mp4`);
      const partPath = `${previewPath}.part`;

      const sourceBytes = await downloadToFile(live.url, sourcePath);
      const probe = probeVideo(sourcePath);
      if (!probe.video?.width || !probe.video?.height) {
        throw new Error(`${action.slug}: downloaded rendition has no decodable video stream. Stopping.`);
      }

      const scale = computeScaledDimensions({
        width: probe.video.width,
        height: probe.video.height,
        maxDimension: PREVIEW_SPEC.maxLongEdge,
      });
      runFfmpeg(
        buildPreviewFfmpegArgs({
          inputPath: sourcePath,
          outputPath: partPath,
          scale,
          fps: probe.video.fps,
        }),
      );
      fs.renameSync(partPath, previewPath);

      const previewProbe = probeVideo(previewPath);
      const acceptable = isAcceptablePreview(previewProbe);
      if (!acceptable.ok) {
        throw new Error(`${action.slug}: encoded preview rejected — ${acceptable.reason}. Stopping.`);
      }
      const previewBytes = fs.statSync(previewPath).size;

      const previewR2Key = await uploadReplicationFile(writeClient, apiKey, previewPath, "video/mp4");
      await updateReplicationMedia(writeClient, apiKey, live, { preview_r2_key: previewR2Key });

      ledger.push({
        slug: action.slug,
        rowId: action.rowId,
        expectedStorageId: action.expectedStorageId,
        expectedR2Key: action.expectedR2Key,
        previewR2Key,
        sourceBytes,
        previewBytes,
        at: new Date().toISOString(),
      });
      writeLedger();

      const after = await fetchResolvedRow(writeClient, apiKey, action.rowId);
      const verdict = verifyPreviewGeneration({ before, after });
      if (after?.preview_r2_key !== previewR2Key) {
        verdict.ok = false;
        verdict.reasons.push("Native preview key did not persist.");
      }
      if (!verdict.ok) {
        console.error(`  ${action.slug}: VERIFICATION FAILED`);
        for (const reason of verdict.reasons) console.error(`    ${reason}`);
        console.error(`\n  Ledger: ${ledgerPath}`);
        throw new Error(
          "Stopping before the next row. This row's preview write DID land (see ledger); no further rows have been written.",
        );
      }

      fs.rmSync(sourcePath, { force: true });
      fs.rmSync(previewPath, { force: true });

      generated += 1;
      console.log(
        `  ${action.slug}: ${formatBytes(sourceBytes)} -> ${formatBytes(previewBytes)} preview, verified on ${hostOf(after.preview_url)}`,
      );
    }
  }

  console.log(`\nGenerated ${generated} preview rendition(s). Ledger: ${ledgerPath}`);
  console.log('Run revalidateTag("data-public:replications") to clear the 900s/3600s caches.');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(`\n${error.message}\n`);
    if (process.env.DEBUG) console.error(error);
    process.exit(1);
  });
}
