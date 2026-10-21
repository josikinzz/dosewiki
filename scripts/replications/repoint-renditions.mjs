#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
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
import { assertMediaType, DEFAULT_MEDIA_TYPE } from "./lib/media-types.mjs";
import { uploadReplicationFile, uploadReplicationBytes, updateReplicationMedia } from "./lib/r2-upload.mjs";

const OPERATION = "repoint-replication-renditions";

export function fieldThatWins() {
  return "r2_key";
}

const FORMAT_CONTENT_TYPES = Object.freeze({
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
});

export function sniffImageContentType(head) {
  if (!head || head.length < 12) return null;
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "image/jpeg";
  if (head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  if (head.subarray(0, 6).toString("latin1") === "GIF89a" || head.subarray(0, 6).toString("latin1") === "GIF87a") {
    return "image/gif";
  }
  if (head.subarray(0, 4).toString("latin1") === "RIFF" && head.subarray(8, 12).toString("latin1") === "WEBP") {
    return "image/webp";
  }
  return null;
}

export function imageContentTypeFor({ sniffed, declared, format } = {}) {
  if (typeof sniffed === "string" && sniffed.startsWith("image/")) return sniffed;

  const clean = typeof declared === "string" ? declared.split(";")[0].trim().toLowerCase() : "";
  if (clean.startsWith("image/")) return clean;

  const mapped = FORMAT_CONTENT_TYPES[String(format ?? "").trim().toLowerCase()];
  if (mapped) return mapped;

  throw new Error(
    `Cannot determine an image content type (declared: ${declared ?? "none"}, format: ${format ?? "none"}). Uploading without one would make the browser download the file instead of showing it.`,
  );
}

export function planRepoint(rows, sourcesBySlug, { includeThumbnails = true, mediaType = "video" } = {}) {
  const actions = [];
  const skipped = [];

  for (const row of rows) {
    const source = sourcesBySlug.get(row.slug);

    if (!source?.sourcePath) {
      skipped.push({ slug: row.slug, reason: "no upload source produced for this row" });
      continue;
    }
    if (!Number.isFinite(source.sourceBytes) || source.sourceBytes <= 0) {
      skipped.push({ slug: row.slug, reason: "upload source is empty" });
      continue;
    }
    const thumbnailAtRisk = Boolean(row.thumbnail_url) && !isProductionUrl(row.thumbnail_url);
    if (isProductionUrl(row.url) && row.storageOnProduction && !thumbnailAtRisk && !source.force) {
      skipped.push({ slug: row.slug, reason: "already served from production storage" });
      continue;
    }

    const thumbnailMirrorsSource =
      mediaType === "image" && Boolean(row.thumbnail_url) && row.thumbnail_url === row.url;
    const mirrorThumbnail = includeThumbnails && thumbnailMirrorsSource;
    const posterPath = includeThumbnails && !mirrorThumbnail ? (source.posterPath ?? null) : null;

    actions.push({
      rowId: row._id,
      slug: row.slug,
      expectedStorageId: row.storage_id,
      expectedR2Key: row.r2_key ?? null,
      expectedThumbnailR2Key: row.thumbnail_r2_key ?? null,
      expectedThumbnailStorageId: row.thumbnail_storage_id ?? null,
      expectedFileSize: row.file_size ?? null,
      expectedUrl: row.url ?? null,
      expectedThumbnailUrl: row.thumbnail_url ?? null,
      sourcePath: source.sourcePath,
      sourceBytes: source.sourceBytes,
      contentType: source.contentType,
      posterPath,
      posterContentType: source.posterContentType ?? "image/jpeg",
      mirrorThumbnail,
      writesThumbnail: mirrorThumbnail || Boolean(posterPath),
      field: fieldThatWins(),
    });
  }

  return { actions, skipped };
}

export function verifyRepoint({
  before,
  after,
  expectProduction = true,
  expectThumbnailProduction = false,
  expectedR2Key = null,
}) {
  const reasons = [];

  if (!after || typeof after.url !== "string" || after.url.length === 0) {
    return { ok: false, reasons: ["resolved URL is null — this row's page would be removed"] };
  }

  if (expectedR2Key !== null && after.r2_key !== expectedR2Key) {
    reasons.push("Native media identity did not persist.");
  } else if (before?.url && after.url === before.url && expectedR2Key === null) {
    reasons.push("resolved URL did not change — the write did not take effect");
  }

  if (expectProduction && !isProductionUrl(after.url)) {
    reasons.push(`resolved URL still points at ${hostOf(after.url) ?? "an unknown host"}, outside the configured R2 media namespace`);
  }

  if (before?.thumbnail_url && !after.thumbnail_url) {
    reasons.push("thumbnail regressed from present to null");
  }

  if (expectThumbnailProduction && after.thumbnail_url && !isProductionUrl(after.thumbnail_url)) {
    reasons.push(
      `resolved thumbnail still points at ${hostOf(after.thumbnail_url) ?? "an unknown host"}, outside the configured R2 media namespace`,
    );
  }

  return { ok: reasons.length === 0, reasons };
}

export function buildRollbackEntry(action, applied) {
  return {
    rowId: action.rowId,
    slug: action.slug,
    previous: Object.fromEntries([
      "storage_id", "r2_key", "url", "format", "file_size",
      "thumbnail_storage_id", "thumbnail_r2_key", "thumbnail_url",
      "preview_storage_id", "preview_r2_key", "preview_url",
      "motion_storage_id", "motion_r2_key", "motion_url",
      "motion_poster_storage_id", "motion_poster_r2_key", "motion_poster_url",
    ].map((field) => [field, applied.before[field] ?? null])),
    applied: {
      r2_key: applied.r2Key,
      thumbnail_r2_key: applied.thumbnailR2Key ?? null,
    },
    recovery: "Review the previous media identity and use an explicitly approved recovery operation.",
  };
}

export function chunk(items, size) {
  if (!Number.isFinite(size) || size < 1) throw new Error("Batch size must be a positive integer.");
  const batches = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}

export function assertRepointAllowed(command, argv) {
  if (!hasFlag(argv, "--confirm-repoint")) {
    throw new Error(`${OPERATION} requires --confirm-repoint alongside the standard write ceremony.`);
  }
}

function archivedFormatOf(entry) {
  const ext = path.extname(String(entry.archivePath ?? "")).toLowerCase();
  return ext ? ext.slice(1) : (entry.format ?? "");
}

function sniffFile(filePath) {
  const handle = fs.openSync(filePath, "r");
  try {
    const head = Buffer.alloc(12);
    const read = fs.readSync(handle, head, 0, 12, 0);
    return sniffImageContentType(head.subarray(0, read));
  } finally {
    fs.closeSync(handle);
  }
}

function archivedImageContentType(entry) {
  return imageContentTypeFor({
    sniffed: sniffFile(entry.archivePath),
    declared: entry.contentType,
    format: archivedFormatOf(entry),
  });
}

function readUploadSources(manifestPath, { renditionsDir, mediaType }) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const bySlug = new Map();

  for (const entry of manifest.archived ?? []) {
    const current = bySlug.get(entry.slug) ?? {};

    if (mediaType === "video" && entry.kind === "video") {
      const sourcePath = entry.renditionPath ?? path.join(renditionsDir, `${entry.slug}.mp4`);
      if (fs.existsSync(sourcePath)) {
        current.sourcePath = sourcePath;
        current.sourceBytes = fs.statSync(sourcePath).size;
        current.contentType = "video/mp4";
      }
    } else if (mediaType === "image" && entry.kind === "image") {
      if (fs.existsSync(entry.archivePath)) {
        current.sourcePath = entry.archivePath;
        current.sourceBytes = fs.statSync(entry.archivePath).size;
        current.contentType = archivedImageContentType(entry);
      }
    } else if (entry.kind === "thumbnail" && fs.existsSync(entry.archivePath)) {
      current.posterPath = entry.archivePath;
      current.posterContentType = archivedImageContentType(entry);
    }

    bySlug.set(entry.slug, current);
  }

  return bySlug;
}


async function main() {
  const argv = process.argv.slice(2);
  const command = createProductionWriteCommand({ operation: OPERATION });
  printProductionWriteCommand(command);
  if (command.writeRequested) authorizeProductionWrite(command);

  const mediaType = assertMediaType(getFlagValue(argv, "--media-type") ?? DEFAULT_MEDIA_TYPE);
  const manifestPath = getFlagValue(argv, "--manifest");
  const renditionsDir = getFlagValue(argv, "--renditions-dir");
  const batchSize = Number(getFlagValue(argv, "--batch-size") ?? 5);
  const includeThumbnails = !hasFlag(argv, "--skip-thumbnails");

  if (!manifestPath) throw new Error("Pass --manifest=<archive-manifest.json from the archive run>.\nUsage: bun scripts/replications/repoint-renditions.mjs --manifest=<archive-manifest.json> [--renditions-dir=<renditions>] [--media-type=video|image] [--batch-size=5]\nDefault plans without uploads or database writes. Video requires --renditions-dir; images use the archived master. Apply requires --write --confirm-write=repoint-replication-renditions --confirm-repoint plus --expected-deployment=<host>/<database>, an explicit --target, and the full remote-host and credential ceremony in docs/operations/data-credentials.md.");
  if (mediaType === "video" && !renditionsDir) {
    throw new Error("Pass --renditions-dir=<directory of web renditions>.");
  }
  if (!fs.existsSync(manifestPath)) throw new Error(`Manifest not found: ${manifestPath}`);

  const readUrl = command.writeRequested ? command.targetUrl : resolvePostgresSource({}).url;
  if (!readUrl) {
    throw new Error("Set --target/TARGET_POSTGRES_URL (or SOURCE_POSTGRES_URL for a dry run).");
  }

  const readClient = createDataClient({ target: readUrl }).client;
  const rows = (await readClient.query(api.replications.getPublicReplications, {}))
    .filter((row) => row.type === mediaType)
    .map((row) => ({ ...row, storageOnProduction: isProductionUrl(row.url) }));

  const sources = readUploadSources(manifestPath, {
    renditionsDir: renditionsDir ? path.resolve(renditionsDir) : null,
    mediaType,
  });
  const { actions, skipped } = planRepoint(rows, sources, { includeThumbnails, mediaType });
  const batches = chunk(actions, batchSize);
  const mirroredThumbnails = actions.filter((action) => action.mirrorThumbnail).length;

  console.log(`\nMedia type     : ${mediaType}`);
  console.log(`Rows read      : ${rows.length}`);
  console.log(`Repoint plan   : ${actions.length} row(s) in ${batches.length} batch(es) of ${batchSize}`);
  console.log(`Skipped        : ${skipped.length}`);
  console.log(`Field written  : ${fieldThatWins()}  (the field that outranks 'url' in resolveReplicationUrls)`);
  console.log(
    `Uploads        : ${mediaType === "image" ? "archived masters, byte for byte (no re-encode)" : "transcoded renditions"}`,
  );
  if (mirroredThumbnails > 0) {
    console.log(
      `Mirrored thumbs: ${mirroredThumbnails} row(s) whose thumbnail is the same object as the media — one upload, both fields\n`,
    );
  } else {
    console.log("");
  }

  for (const entry of skipped) console.log(`  SKIP ${entry.slug}: ${entry.reason}`);
  for (const action of actions.slice(0, 10)) {
    console.log(
      `  ${action.slug}\n    ${hostOf(action.expectedUrl) ?? "unresolved"} -> configured R2 media namespace  (${action.sourceBytes} bytes, ${action.contentType})`,
    );
  }
  if (actions.length > 10) console.log(`  … and ${actions.length - 10} more`);

  if (command.dryRun) {
    console.log("\nPer-row verification that would run after each write:");
    console.log("  1. re-query api.replications.getPublicReplications (the resolver the site uses)");
    console.log("  2. require the resolved url to be non-null      — a null url removes the page");
    console.log("  3. require the reviewed native media key to persist, even when its content-addressed URL is unchanged");
    console.log("  4. require the resolved URL to be in the configured R2 media namespace");
    console.log("  5. require the thumbnail not to regress to null");
    console.log(
      `  6. require the resolved thumbnail to be in the configured R2 media namespace on the ${actions.filter((action) => action.writesThumbnail).length} row(s) whose thumbnail this run sets`,
    );
    console.log("  A failing row stops the entire run before the next batch.");
    console.log("\nDry run: nothing uploaded, no Postgres writes performed.");
    return;
  }

  assertRepointAllowed(command, argv);
  const { token: apiKey } = requireProductionWriteCredential("replicationMaintenance");
  const writeClient = createDataClient({ target: command.targetUrl }).client;

  const ledgerDir = renditionsDir ? path.resolve(renditionsDir) : path.dirname(path.resolve(manifestPath));
  const rollbackPath = path.join(ledgerDir, `repoint-${mediaType}-rollback-${Date.now()}.json`);
  const rollback = [];
  const writeRollback = () =>
    fs.writeFileSync(rollbackPath, `${JSON.stringify({ operation: OPERATION, entries: rollback }, null, 2)}\n`);

  let repointed = 0;

  for (const [batchIndex, batch] of batches.entries()) {
    console.log(`\n--- Batch ${batchIndex + 1}/${batches.length} ---`);

    for (const action of batch) {
      const live = await writeClient.query(api.replications.getResolvedById, { apiKey, id: action.rowId });
      if (!live) throw new Error(`${action.slug}: row no longer exists. Stopping.`);
      if ((live.storage_id ?? null) !== (action.expectedStorageId ?? null) ||
          (live.r2_key ?? null) !== action.expectedR2Key) {
        throw new Error(
          `${action.slug}: media identity changed since the reviewed plan. Stopping.`,
        );
      }

      const before = { url: live.url, thumbnail_url: live.thumbnail_url };

      const r2Key = await uploadReplicationFile(writeClient, apiKey, action.sourcePath, action.contentType);
      let thumbnailR2Key = action.mirrorThumbnail
        ? r2Key
        : action.posterPath
          ? await uploadReplicationFile(writeClient, apiKey, action.posterPath, action.posterContentType)
          : undefined;
      if (!thumbnailR2Key && live.thumbnail_r2_key) {
        thumbnailR2Key = live.thumbnail_r2_key;
      } else if (!thumbnailR2Key && live.thumbnail_url) {
        const response = await fetch(live.thumbnail_url);
        if (!response.ok) throw new Error(`${action.slug}: existing thumbnail returned HTTP ${response.status}.`);
        const bytes = Buffer.from(await response.arrayBuffer());
        const contentType = imageContentTypeFor({
          sniffed: sniffImageContentType(bytes),
          declared: response.headers.get("content-type"),
        });
        const extension = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/avif": "avif" }[contentType];
        if (!extension) throw new Error(`${action.slug}: unsupported thumbnail type ${contentType}.`);
        thumbnailR2Key = await uploadReplicationBytes(writeClient, apiKey, bytes, contentType, extension);
      }

      const deliveredBytes = fs.statSync(action.sourcePath).size;
      if (deliveredBytes !== action.sourceBytes) throw new Error(`${action.slug}: source size changed since planning.`);
      await updateReplicationMedia(writeClient, apiKey, live, {
        r2_key: r2Key,
        ...(thumbnailR2Key ? { thumbnail_r2_key: thumbnailR2Key } : {}),
      }, deliveredBytes);

      rollback.push(buildRollbackEntry(action, { r2Key, thumbnailR2Key, before: live }));
      writeRollback();

      const after = (await readClient.query(api.replications.getPublicReplications, {})).find(
        (row) => row._id === action.rowId,
      );
      const verdict = verifyRepoint({
        before,
        after,
        expectThumbnailProduction: action.writesThumbnail,
        expectedR2Key: r2Key,
      });
      if (after?.file_size !== deliveredBytes ||
          (thumbnailR2Key && after.thumbnail_r2_key !== thumbnailR2Key)) {
        verdict.ok = false;
        verdict.reasons.push("Native media identity or delivered file size did not persist.");
      }

      if (!verdict.ok) {
        console.error(`  ${action.slug}: VERIFICATION FAILED`);
        for (const reason of verdict.reasons) console.error(`    ${reason}`);
        console.error(`\n  Rollback ledger: ${rollbackPath}`);
        throw new Error("Stopping before the next row. Nothing further has been written.");
      }

      repointed += 1;
      console.log(`  ${action.slug}: ${hostOf(before.url) ?? "unresolved"} -> ${hostOf(after.url)} verified`);
    }

    console.log(
      `\n  Batch ${batchIndex + 1} complete. Verify these ${batch.length} rows on the live site before continuing.`,
    );
  }

  console.log(`\nRepointed ${repointed} row(s). Rollback ledger: ${rollbackPath}`);
  console.log('Run revalidateTag("data-public:replications") to clear the 900s/3600s caches.');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(`\n${error.message}\n`);
    if (process.env.DEBUG) console.error(error);
    process.exit(1);
  });
}
