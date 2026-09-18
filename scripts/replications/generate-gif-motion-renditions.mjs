#!/usr/bin/env node
/**
 * Generate controllable MP4 + poster pairs for animated GIF replications and
 * attach them without replacing the original rights/provenance asset.
 *
 * Dry run:
 *   node scripts/replications/generate-gif-motion-renditions.mjs \
 *     --target=postgresql://<host>/<database>
 *
 * Apply (requires the repository's production-write gates):
 *   node scripts/replications/generate-gif-motion-renditions.mjs \
 *     --write --confirm-write=generate-gif-motion-renditions \
 *     --expected-deployment=<host>/<database> \
 *     --target=postgresql://<host>/<database>
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import { createDataClient, resolvePostgresSource } from "../lib/data-client.ts";

import { api } from "../../lib/postgres/runtime/api.ts"
import { getFlagValue, hasFlag } from "../lib/data-ops-run-context.mjs";
import {
  assertProductionWriteAllowed,
  createProductionWriteCommand,
  printProductionWriteCommand,
  requireProductionWriteCredential,
} from "../lib/production-write-command.mjs";
import {
  hostOf,
  isProductionUrl,
} from "./lib/media-hosts.mjs";
import { chunk } from "./repoint-renditions.mjs";
import { uploadReplicationFile, updateReplicationMedia } from "./lib/r2-upload.mjs";
import { assertToolsAvailable, probeVideo } from "./transcode-videos.mjs";

const OPERATION = "generate-gif-motion-renditions";

export const GIF_MOTION_SPEC = Object.freeze({
  crf: 20,
  preset: "slow",
});

function isGifLike(row) {
  return (
    row.type === "image" &&
    String(row.format ?? "").toLowerCase() === "gif" &&
    (row.role ?? "replication") === "replication"
  );
}

export function planGifMotionGeneration(rows, { force = false } = {}) {
  const actions = [];
  const skipped = [];
  const gifRows = rows.filter(isGifLike);

  for (const row of gifRows) {
    if ((row.motion_r2_key || row.motion_storage_id) && (row.motion_poster_r2_key || row.motion_poster_storage_id) && !force) {
      skipped.push({
        slug: row.slug,
        reason: "already has a motion rendition and poster",
      });
      continue;
    }
    if (!row.url) {
      skipped.push({ slug: row.slug, reason: "resolved original URL is null" });
      continue;
    }
    if (!isProductionUrl(row.url)) {
      skipped.push({
        slug: row.slug,
        reason: `original is served from ${hostOf(row.url) ?? "an unknown host"}, not production storage`,
      });
      continue;
    }

    actions.push({
      rowId: row._id,
      slug: row.slug,
      sourceUrl: row.url,
      expectedStorageId: row.storage_id,
      expectedR2Key: row.r2_key ?? null,
      hadMotion: Boolean((row.motion_r2_key || row.motion_storage_id) && (row.motion_poster_r2_key || row.motion_poster_storage_id)),
    });
  }

  return { actions, skipped, gifRowCount: gifRows.length };
}

/** Preserve every source pixel; pad odd edges instead of scaling the composition. */
export function buildGifMotionFfmpegArgs({
  inputPath,
  outputPath,
  spec = GIF_MOTION_SPEC,
}) {
  return [
    "-hide_banner",
    "-loglevel",
    "error",
    "-nostdin",
    "-y",
    "-i",
    inputPath,
    "-map",
    "0:v:0",
    "-vf",
    "pad=ceil(iw/2)*2:ceil(ih/2)*2:(ow-iw)/2:(oh-ih)/2:color=black,format=yuv420p",
    "-fps_mode",
    "vfr",
    "-c:v",
    "libx264",
    "-preset",
    spec.preset,
    "-crf",
    String(spec.crf),
    "-profile:v",
    "high",
    "-pix_fmt",
    "yuv420p",
    "-an",
    "-movflags",
    "+faststart",
    "-f",
    "mp4",
    outputPath,
  ];
}

export function buildMotionPosterFfmpegArgs({ inputPath, outputPath }) {
  return [
    "-hide_banner",
    "-loglevel",
    "error",
    "-nostdin",
    "-y",
    "-i",
    inputPath,
    "-map",
    "0:v:0",
    "-frames:v",
    "1",
    "-c:v",
    "png",
    "-f",
    "image2",
    "-update",
    "1",
    outputPath,
  ];
}

export function isAcceptableGifMotion(probe) {
  if (!probe?.video?.width || !probe?.video?.height) {
    return { ok: false, reason: "no decodable video stream" };
  }
  if (probe.truncated) return { ok: false, reason: "file is truncated" };
  if (probe.faststart !== true)
    return { ok: false, reason: "moov atom is not leading" };
  if (probe.hasAudio)
    return { ok: false, reason: "motion rendition carries audio" };
  if (!(probe.durationSeconds > 0))
    return { ok: false, reason: "motion duration is missing" };
  return { ok: true, reason: "decodable, silent, timed, and faststart" };
}

export function verifyRenditionDimensions({ source, motion, poster }) {
  if (
    !source?.video?.width ||
    !source?.video?.height ||
    !motion?.video?.width ||
    !motion?.video?.height ||
    !poster?.video?.width ||
    !poster?.video?.height
  ) {
    return {
      ok: false,
      reason: "one or more rendition dimensions are missing",
    };
  }
  const expectedMotionWidth = Math.ceil(source.video.width / 2) * 2;
  const expectedMotionHeight = Math.ceil(source.video.height / 2) * 2;
  if (
    motion.video.width !== expectedMotionWidth ||
    motion.video.height !== expectedMotionHeight
  ) {
    return {
      ok: false,
      reason: `motion is ${motion.video.width}×${motion.video.height}; expected ${expectedMotionWidth}×${expectedMotionHeight}`,
    };
  }
  if (
    poster.video.width !== source.video.width ||
    poster.video.height !== source.video.height
  ) {
    return {
      ok: false,
      reason: `poster is ${poster.video.width}×${poster.video.height}; source is ${source.video.width}×${source.video.height}`,
    };
  }
  return {
    ok: true,
    reason: "source pixels and poster dimensions are preserved",
  };
}

export function verifyGifMotionGeneration({ before, after }) {
  if (!after) return { ok: false, reasons: ["row no longer exists"] };
  const reasons = [];

  for (const [field, label] of [
    ["motion_url", "motion rendition"],
    ["motion_poster_url", "motion poster"],
  ]) {
    const value = after[field];
    if (typeof value !== "string" || value.length === 0) {
      reasons.push(`${field} is null — ${label} write did not resolve`);
    } else if (!isProductionUrl(value)) {
      reasons.push(
        `${field} points at ${hostOf(value) ?? "an unknown host"}, outside the configured R2 media namespace`,
      );
    }
  }

  for (const field of ["url", "thumbnail_url", "preview_url"]) {
    if ((after[field] ?? null) !== (before?.[field] ?? null)) {
      reasons.push(
        `${field} CHANGED — motion generation may only attach derived fields`,
      );
    }
  }

  return { ok: reasons.length === 0, reasons };
}

async function downloadToFile(url, filePath) {
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(
      `Download failed: ${response.status} ${response.statusText} for ${url}`,
    );
  }
  await pipeline(
    Readable.fromWeb(response.body),
    fs.createWriteStream(filePath),
  );
  return fs.statSync(filePath).size;
}

function runFfmpeg(args) {
  const result = spawnSync("ffmpeg", args, {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    throw new Error(
      `ffmpeg failed: ${(result.stderr || result.error?.message || "").trim()}`,
    );
  }
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return "unknown";
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

async function fetchResolvedRow(client, apiKey, rowId) {
  return client.query(api.replications.getResolvedById, { apiKey, id: rowId });
}

async function main() {
  const argv = process.argv.slice(2);
  const command = createProductionWriteCommand({ operation: OPERATION });
  printProductionWriteCommand(command);

  const force = hasFlag(argv, "--force");
  const limitValue = getFlagValue(argv, "--limit");
  const limit = limitValue ? Number(limitValue) : null;
  const batchSize = Number(getFlagValue(argv, "--batch-size") ?? 5);
  const scratchDir = path.resolve(
    getFlagValue(argv, "--scratch-dir") ??
      path.join(os.tmpdir(), "dosewiki-gif-motion-renditions"),
  );

  assertToolsAvailable();
  const readUrl = command.writeRequested ? command.targetUrl : resolvePostgresSource({}).url;
  if (!readUrl) {
    throw new Error(
      "Set --target/TARGET_POSTGRES_URL (or SOURCE_POSTGRES_URL for dry run).",
    );
  }

  const readClient = createDataClient({ target: readUrl }).client;
  const rows = await readClient.query(
    api.replications.getPublicReplications,
    {},
  );
  const plan = planGifMotionGeneration(rows, { force });
  const actions = limit ? plan.actions.slice(0, limit) : plan.actions;
  const batches = chunk(actions, batchSize);

  console.log(
    `\nRows read       : ${rows.length} (${plan.gifRowCount} GIF replications)`,
  );
  console.log(
    `Motion plan     : ${actions.length} row(s) in ${batches.length} batch(es)`,
  );
  console.log(`Skipped         : ${plan.skipped.length}`);
  console.log("Fields written  : motion_r2_key + motion_poster_r2_key");
  console.log(
    `Encode spec     : full duration/cadence · H.264 High yuv420p · CRF ${GIF_MOTION_SPEC.crf} ${GIF_MOTION_SPEC.preset} · silent · faststart`,
  );
  for (const entry of plan.skipped)
    console.log(`  SKIP ${entry.slug}: ${entry.reason}`);
  for (const action of actions)
    console.log(`  ${action.slug}: ${action.sourceUrl}`);

  if (command.dryRun) {
    console.log(
      "\nDry run — nothing downloaded, encoded, uploaded, or written.",
    );
    return;
  }

  assertProductionWriteAllowed(command);
  const { token: apiKey } = requireProductionWriteCredential(
    "replicationMaintenance",
  );
  const writeClient = createDataClient({ target: command.targetUrl }).client;
  fs.mkdirSync(scratchDir, { recursive: true });
  const ledgerPath = path.join(
    scratchDir,
    `gif-motion-ledger-${Date.now()}.json`,
  );
  const ledger = [
    ...plan.skipped.map((entry) => ({ ...entry, status: "skipped" })),
    ...actions.map((action) => ({
      slug: action.slug,
      rowId: action.rowId,
      expectedStorageId: action.expectedStorageId,
      expectedR2Key: action.expectedR2Key,
      sourceUrl: action.sourceUrl,
      status: "planned",
    })),
  ];
  const writeLedger = () =>
    fs.writeFileSync(
      ledgerPath,
      `${JSON.stringify({ operation: OPERATION, entries: ledger }, null, 2)}\n`,
    );
  writeLedger();

  let generated = 0;
  for (const [batchIndex, batch] of batches.entries()) {
    console.log(`\n--- Batch ${batchIndex + 1}/${batches.length} ---`);
    for (const action of batch) {
      const ledgerEntry = ledger.find(
        (entry) => entry.slug === action.slug && entry.status === "planned",
      );
      if (!ledgerEntry) {
        throw new Error(`${action.slug}: planned ledger entry is missing.`);
      }
      try {
        const live = await fetchResolvedRow(writeClient, apiKey, action.rowId);
        if (!live)
          throw new Error(`${action.slug}: row no longer exists. Stopping.`);
        if ((live.storage_id ?? null) !== (action.expectedStorageId ?? null) ||
            (live.r2_key ?? null) !== action.expectedR2Key) {
          throw new Error(
            `${action.slug}: media identity changed since the reviewed plan. Stopping.`,
          );
        }
        if (
          (live.motion_r2_key || live.motion_storage_id) &&
          (live.motion_poster_r2_key || live.motion_poster_storage_id) &&
          !force &&
          !action.hadMotion
        ) {
          console.log(
            `  ${action.slug}: motion pair appeared since planning — skipping.`,
          );
          Object.assign(ledgerEntry, {
            status: "skipped",
            reason: "motion pair appeared after planning",
          });
          writeLedger();
          continue;
        }

        const before = {
          url: live.url,
          thumbnail_url: live.thumbnail_url,
          preview_url: live.preview_url,
        };
        const sourcePath = path.join(scratchDir, `${action.slug}.source.gif`);
        const motionPath = path.join(scratchDir, `${action.slug}.motion.mp4`);
        const posterPath = path.join(
          scratchDir,
          `${action.slug}.motion-poster.png`,
        );
        const motionPart = `${motionPath}.part`;
        const posterPart = `${posterPath}.part`;

        const sourceBytes = await downloadToFile(live.url, sourcePath);
        const sourceProbe = probeVideo(sourcePath);
        runFfmpeg(
          buildGifMotionFfmpegArgs({
            inputPath: sourcePath,
            outputPath: motionPart,
          }),
        );
        fs.renameSync(motionPart, motionPath);
        runFfmpeg(
          buildMotionPosterFfmpegArgs({
            inputPath: sourcePath,
            outputPath: posterPart,
          }),
        );
        fs.renameSync(posterPart, posterPath);

        const motionProbe = probeVideo(motionPath);
        const verdict = isAcceptableGifMotion(motionProbe);
        if (!verdict.ok)
          throw new Error(
            `${action.slug}: encoded motion rejected — ${verdict.reason}`,
          );
        const dimensionVerdict = verifyRenditionDimensions({
          source: sourceProbe,
          motion: motionProbe,
          poster: probeVideo(posterPath),
        });
        if (!dimensionVerdict.ok) {
          throw new Error(
            `${action.slug}: rendition dimensions rejected — ${dimensionVerdict.reason}`,
          );
        }

        const motionR2Key = await uploadReplicationFile(
          writeClient,
          apiKey,
          motionPath,
          "video/mp4",
        );
        Object.assign(ledgerEntry, {
          status: "motion_uploaded",
          motionR2Key,
          sourceBytes,
          motionBytes: fs.statSync(motionPath).size,
          at: new Date().toISOString(),
        });
        writeLedger();
        const motionPosterR2Key = await uploadReplicationFile(
          writeClient,
          apiKey,
          posterPath,
          "image/png",
        );
        Object.assign(ledgerEntry, {
          status: "uploaded_pending_association",
          motionPosterR2Key,
          posterBytes: fs.statSync(posterPath).size,
          at: new Date().toISOString(),
        });
        writeLedger();
        await updateReplicationMedia(writeClient, apiKey, live, {
          motion_r2_key: motionR2Key,
          motion_poster_r2_key: motionPosterR2Key,
        });

        Object.assign(ledgerEntry, {
          status: "applied",
          motionR2Key,
          motionPosterR2Key,
          sourceBytes,
          motionBytes: fs.statSync(motionPath).size,
          posterBytes: fs.statSync(posterPath).size,
          at: new Date().toISOString(),
        });
        writeLedger();

        const after = await fetchResolvedRow(writeClient, apiKey, action.rowId);
        const verification = verifyGifMotionGeneration({ before, after });
        if (after?.motion_r2_key !== motionR2Key || after.motion_poster_r2_key !== motionPosterR2Key) {
          verification.ok = false;
          verification.reasons.push("Native motion keys did not persist.");
        }
        if (!verification.ok) {
          for (const reason of verification.reasons)
            console.error(`  ${reason}`);
          throw new Error(
            `Verification failed after ${action.slug}; write landed. Ledger: ${ledgerPath}`,
          );
        }

        fs.rmSync(sourcePath, { force: true });
        fs.rmSync(motionPath, { force: true });
        fs.rmSync(posterPath, { force: true });
        generated += 1;
        console.log(
          `  ${action.slug}: ${formatBytes(sourceBytes)} -> ${formatBytes(ledgerEntry.motionBytes)} motion + ${formatBytes(ledgerEntry.posterBytes)} poster`,
        );
      } catch (error) {
        Object.assign(ledgerEntry, {
          status:
            ledgerEntry.status === "applied"
              ? "verification_failed_after_write"
              : "failed",
          reason: error instanceof Error ? error.message : String(error),
          at: new Date().toISOString(),
        });
        writeLedger();
        throw error;
      }
    }
  }

  console.log(
    `\nGenerated ${generated} GIF motion rendition pair(s). Ledger: ${ledgerPath}`,
  );
  console.log(
    'Run revalidateTag("data-public:replications") to clear public caches.',
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(`\n${error.message}\n`);
    if (process.env.DEBUG) console.error(error);
    process.exit(1);
  });
}
