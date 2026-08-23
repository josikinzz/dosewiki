#!/usr/bin/env node
/**
 * Generate controllable MP4 + poster pairs for animated GIF replications and
 * attach them without replacing the original rights/provenance asset.
 *
 * Dry run:
 *   node scripts/replications/generate-gif-motion-renditions.mjs \
 *     --target-url=https://glad-minnow-656.convex.cloud
 *
 * Apply (requires the repository's production-write gates):
 *   node scripts/replications/generate-gif-motion-renditions.mjs \
 *     --write --confirm-write=generate-gif-motion-renditions \
 *     --expected-deployment=glad-minnow-656 \
 *     --target-url=https://glad-minnow-656.convex.cloud
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import { ConvexHttpClient } from "convex/browser";

import { api } from "../../convex/_generated/api.js";
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
  PRODUCTION_HOST,
} from "./lib/media-hosts.mjs";
import { chunk, uploadFile } from "./repoint-renditions.mjs";
import { assertToolsAvailable, probeVideo } from "./transcode-videos.mjs";

const OPERATION = "generate-gif-motion-renditions";

export const GIF_MOTION_SPEC = Object.freeze({
  crf: 20,
  preset: "slow",
  posterQuality: 82,
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
    if (row.motion_storage_id && row.motion_poster_storage_id && !force) {
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
      hadMotion: Boolean(row.motion_storage_id && row.motion_poster_storage_id),
    });
  }

  return { actions, skipped, gifRowCount: gifRows.length };
}

/** Preserve timing and frame content; only force browser-decodable even dimensions/pixel format. */
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
    "scale=trunc(iw/2)*2:trunc(ih/2)*2:flags=lanczos,format=yuv420p",
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

export function buildMotionPosterFfmpegArgs({
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
    "-frames:v",
    "1",
    "-vf",
    "scale=trunc(iw/2)*2:trunc(ih/2)*2:flags=lanczos",
    "-c:v",
    "libwebp",
    "-quality",
    String(spec.posterQuality),
    "-f",
    "webp",
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
        `${field} points at ${hostOf(value) ?? "an unknown host"}, not ${PRODUCTION_HOST}`,
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
  const readUrl = command.targetUrl || process.env.CONVEX_PUBLIC_READ_URL;
  if (!readUrl) {
    throw new Error(
      "Set --target-url/TARGET_CONVEX_URL (or CONVEX_PUBLIC_READ_URL for dry run).",
    );
  }

  const readClient = new ConvexHttpClient(readUrl);
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
  console.log("Fields written  : motion_storage_id + motion_poster_storage_id");
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
  const writeClient = new ConvexHttpClient(command.targetUrl);
  fs.mkdirSync(scratchDir, { recursive: true });
  const ledgerPath = path.join(
    scratchDir,
    `gif-motion-ledger-${Date.now()}.json`,
  );
  const ledger = [];
  const writeLedger = () =>
    fs.writeFileSync(
      ledgerPath,
      `${JSON.stringify({ operation: OPERATION, entries: ledger }, null, 2)}\n`,
    );

  let generated = 0;
  for (const [batchIndex, batch] of batches.entries()) {
    console.log(`\n--- Batch ${batchIndex + 1}/${batches.length} ---`);
    for (const action of batch) {
      const live = await fetchResolvedRow(writeClient, apiKey, action.rowId);
      if (!live)
        throw new Error(`${action.slug}: row no longer exists. Stopping.`);
      if (live.storage_id !== action.expectedStorageId) {
        throw new Error(
          `${action.slug}: storage_id changed since the reviewed plan. Stopping.`,
        );
      }
      if (
        live.motion_storage_id &&
        live.motion_poster_storage_id &&
        !force &&
        !action.hadMotion
      ) {
        console.log(
          `  ${action.slug}: motion pair appeared since planning — skipping.`,
        );
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
        `${action.slug}.motion-poster.webp`,
      );
      const motionPart = `${motionPath}.part`;
      const posterPart = `${posterPath}.part`;

      const sourceBytes = await downloadToFile(live.url, sourcePath);
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

      const verdict = isAcceptableGifMotion(probeVideo(motionPath));
      if (!verdict.ok)
        throw new Error(
          `${action.slug}: encoded motion rejected — ${verdict.reason}`,
        );

      const motionStorageId = await uploadFile(
        writeClient,
        apiKey,
        motionPath,
        "video/mp4",
      );
      const motionPosterStorageId = await uploadFile(
        writeClient,
        apiKey,
        posterPath,
        "image/webp",
      );
      await writeClient.mutation(api.replications.updateMotionStorageIds, {
        apiKey,
        updates: [
          {
            id: action.rowId,
            expectedStorageId: action.expectedStorageId,
            motionStorageId,
            motionPosterStorageId,
          },
        ],
      });

      ledger.push({
        slug: action.slug,
        rowId: action.rowId,
        expectedStorageId: action.expectedStorageId,
        motionStorageId,
        motionPosterStorageId,
        sourceBytes,
        motionBytes: fs.statSync(motionPath).size,
        posterBytes: fs.statSync(posterPath).size,
        at: new Date().toISOString(),
      });
      writeLedger();

      const after = await fetchResolvedRow(writeClient, apiKey, action.rowId);
      const verification = verifyGifMotionGeneration({ before, after });
      if (!verification.ok) {
        for (const reason of verification.reasons) console.error(`  ${reason}`);
        throw new Error(
          `Verification failed after ${action.slug}; write landed. Ledger: ${ledgerPath}`,
        );
      }

      fs.rmSync(sourcePath, { force: true });
      fs.rmSync(motionPath, { force: true });
      fs.rmSync(posterPath, { force: true });
      generated += 1;
      console.log(
        `  ${action.slug}: ${formatBytes(sourceBytes)} -> ${formatBytes(ledger.at(-1).motionBytes)} motion + ${formatBytes(ledger.at(-1).posterBytes)} poster`,
      );
    }
  }

  console.log(
    `\nGenerated ${generated} GIF motion rendition pair(s). Ledger: ${ledgerPath}`,
  );
  console.log(
    'Run revalidateTag("convex-public:replications") to clear public caches.',
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(`\n${error.message}\n`);
    if (process.env.DEBUG) console.error(error);
    process.exit(1);
  });
}
