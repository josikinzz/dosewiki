#!/usr/bin/env node
/**
 * Upload the copy production should serve into production Convex storage and
 * repoint the rows at it, retiring the orphan deployments.
 *
 * This is the step that actually fixes the corpus. For video it replaced 44.19
 * GB spread across two deployments nobody controls — plus 65 thumbnails served
 * from the *development* deployment — with faststart web renditions on
 * production storage, which is the only host this project can keep alive. For
 * images it does the same rescue with the archived master itself: 105 of 122
 * image rows still resolve from `warmhearted-mosquito-204` (79) and
 * `adept-goldfish-624` (26).
 *
 * `--media-type` selects which half of the corpus is being moved, and with it
 * where the uploaded bytes come from. Video is the default, so every invocation
 * written before images existed still means exactly what it meant.
 *
 * WHAT GETS UPLOADED, AND WHY IT DIFFERS
 * --------------------------------------
 *   video  the transcoded rendition from the archive run's `--output-dir`, plus
 *          the archived poster as a separate `thumbnail_storage_id`.
 *   image  the archived master, byte for byte. No re-encode, no resize, no
 *          metadata strip: the corpus is 166 MB in total, so there is nothing to
 *          gain, and several rows are third-party artworks where altering the
 *          file is an attribution problem as well as a quality one. An image
 *          row's `thumbnail_url` is normally the same stored object as its
 *          `url`, so both fields are pointed at the one uploaded object rather
 *          than uploading identical bytes twice.
 *
 * Two properties of the live resolver make a naive version of this script
 * dangerous, and both are defended against here.
 *
 * 1. `storage_id` outranks `url`.
 *
 *    `resolveReplicationUrls` (convex/replications.ts:89-99) tries
 *    `ctx.storage.getUrl(storage_id)` first and only falls through to the `url`
 *    string when that yields nothing. The doc comments above the queries claim
 *    the opposite order and are simply wrong. So writing `url` — the obvious
 *    move, since `url` is what currently points at the orphan hosts — silently
 *    does nothing for the 60 rows that already hold a live `storage_id`. This
 *    script therefore writes `storage_id`, the field that actually wins, and
 *    never trusts the write: it re-resolves every row through the same public
 *    query the website uses and requires the delivered URL to have changed.
 *
 * 2. A null URL removes the page, it does not break the video.
 *
 *    `loadReplicationRoute` returns not-found when `url` is falsy, and the route
 *    sets `dynamicParams = false`, so an unresolvable row loses its page
 *    entirely at the next build. Verification therefore treats "resolved to
 *    null" as a hard failure that stops the whole run, not a warning.
 *
 * The old `url` value is deliberately left in place. It is the rollback path: it
 * costs nothing, and clearing it would turn a reversible migration into a
 * one-way door. A later cleanup pass can null it once the new storage has been
 * trusted for a while.
 *
 * Dry run (default — plans and prints the exact per-row verification, uploads
 * nothing, writes nothing):
 *   node scripts/replications/repoint-renditions.mjs \
 *     --manifest=/vol/replication-web/archive-manifest.json \
 *     --renditions-dir=/vol/replication-web
 *
 * Apply, one small batch at a time:
 *   node scripts/replications/repoint-renditions.mjs \
 *     --manifest=/vol/replication-web/archive-manifest.json \
 *     --renditions-dir=/vol/replication-web \
 *     --batch-size=5 \
 *     --write --confirm-write=repoint-replication-renditions \
 *     --confirm-repoint \
 *     --expected-deployment=glad-minnow-656 \
 *     --target-url=https://glad-minnow-656.convex.cloud
 *
 * Images (uploads come from the archive, so no --renditions-dir):
 *   node scripts/replications/repoint-renditions.mjs \
 *     --media-type=image \
 *     --manifest="/Volumes/DeepSeek/dosewiki-replication-masters/image-archive-manifest.json" \
 *     --batch-size=10 \
 *     --write --confirm-write=repoint-replication-renditions \
 *     --confirm-repoint \
 *     --expected-deployment=glad-minnow-656 \
 *     --target-url=https://glad-minnow-656.convex.cloud
 */
import fs from "node:fs";
import { Agent } from "undici";
import path from "node:path";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api.js";
import {
  assertProductionWriteAllowed,
  createProductionWriteCommand,
  printProductionWriteCommand,
  requireProductionWriteCredential,
} from "../lib/production-write-command.mjs";
import { getFlagValue, hasFlag } from "../lib/data-ops-run-context.mjs";
import { hostOf, isProductionUrl, PRODUCTION_HOST } from "./lib/media-hosts.mjs";
import { assertMediaType, DEFAULT_MEDIA_TYPE } from "./lib/media-types.mjs";

const OPERATION = "repoint-replication-renditions";

/**
 * The field that has to change for the browser to see anything different.
 *
 * Returned as a value rather than hard-coded at the call site so the reasoning
 * is testable: if `resolveReplicationUrls` ever changes its precedence, this
 * function and its tests are what fail first.
 */
export function fieldThatWins() {
  return "storage_id";
}

/**
 * The MIME type a file must be stored under for the browser to display it.
 *
 * Convex serves back whatever `Content-Type` the upload declared, so getting
 * this wrong does not corrupt the file — it makes the browser download the image
 * instead of rendering it, which looks exactly like a broken page. The source
 * deployment's own response header is the authority and is recorded by the
 * archive run; the row's `format` is the fallback for a resumed run, where the
 * file was already on disk and no response was ever read. Measured across all
 * 105 endangered image rows on 2026-08-11, the two agree in every case.
 *
 * An unrecognised type throws rather than defaulting. `application/octet-stream`
 * is the failure mode this exists to prevent, so guessing it would be perverse.
 */
const FORMAT_CONTENT_TYPES = Object.freeze({
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
});

/**
 * What the file's first bytes say it is, which outranks every label around it.
 *
 * Not paranoia — measured. `shadow-people-figure-in-a-doorway` carries
 * `format: "jpg"` on a thumbnail whose stored object is a WebP, so the row, and
 * therefore the archived filename derived from it, both name the wrong type. A
 * resumed run has no HTTP response left to consult and would have uploaded that
 * WebP as `image/jpeg`. The container's own signature has no such gap.
 */
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

/**
 * What has to happen to each row, given what the archive run produced.
 *
 * A row without a usable upload source is `skip`, never a partial write —
 * repointing a row at nothing is precisely how a page gets deleted.
 */
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
    // A row is not the unit of risk — its media and its thumbnail are separate
    // stored objects and can sit on different deployments. Skipping on the media
    // alone left `shadow-people-figure-in-a-doorway` behind: its image already
    // resolved from production while its thumbnail still resolved from
    // `warmhearted-mosquito-204`, so the row looked rescued and was still
    // handing an orphan host's URL to the gallery and the public API.
    const thumbnailAtRisk = Boolean(row.thumbnail_url) && !isProductionUrl(row.thumbnail_url);
    if (isProductionUrl(row.url) && row.storageOnProduction && !thumbnailAtRisk && !source.force) {
      skipped.push({ slug: row.slug, reason: "already served from production storage" });
      continue;
    }

    // An image row whose thumbnail resolves to the same object as its media is
    // one file wearing two field names. Uploading it twice would double the
    // bytes on production and leave two ids that can drift apart; pointing both
    // fields at the one upload cannot.
    const thumbnailMirrorsSource =
      mediaType === "image" && Boolean(row.thumbnail_url) && row.thumbnail_url === row.url;
    const mirrorThumbnail = includeThumbnails && thumbnailMirrorsSource;
    const posterPath = includeThumbnails && !mirrorThumbnail ? (source.posterPath ?? null) : null;

    actions.push({
      rowId: row._id,
      slug: row.slug,
      // Compare-and-swap expectation. The plan is reviewed before it is applied,
      // so the row must still look the way it did when the plan was made.
      expectedStorageId: row.storage_id,
      expectedUrl: row.url ?? null,
      expectedThumbnailUrl: row.thumbnail_url ?? null,
      sourcePath: source.sourcePath,
      sourceBytes: source.sourceBytes,
      contentType: source.contentType,
      posterPath,
      posterContentType: source.posterContentType ?? "image/jpeg",
      mirrorThumbnail,
      // If this run sets a thumbnail id at all, it has to prove the thumbnail
      // moved — otherwise a rescue that fixed only the media reports success
      // while the row still points a second asset at a deployment nobody owns.
      writesThumbnail: mirrorThumbnail || Boolean(posterPath),
      field: fieldThatWins(),
    });
  }

  return { actions, skipped };
}

/**
 * Decide whether a repoint actually took effect, from the resolver's own output.
 *
 * This is the whole safety mechanism. Every clause corresponds to a way the
 * migration has been shown able to fail quietly.
 */
export function verifyRepoint({
  before,
  after,
  expectProduction = true,
  expectThumbnailProduction = false,
}) {
  const reasons = [];

  if (!after || typeof after.url !== "string" || after.url.length === 0) {
    // Worst case, and the reason this is a hard stop: the page disappears.
    return { ok: false, reasons: ["resolved URL is null — this row's page would be removed"] };
  }

  if (before?.url && after.url === before.url) {
    reasons.push("resolved URL did not change — the write did not take effect");
  }

  if (expectProduction && !isProductionUrl(after.url)) {
    reasons.push(`resolved URL still points at ${hostOf(after.url) ?? "an unknown host"}, not ${PRODUCTION_HOST}`);
  }

  // Never trade a working poster for a missing one.
  if (before?.thumbnail_url && !after.thumbnail_url) {
    reasons.push("thumbnail regressed from present to null");
  }

  // Only asked when this run claimed to move the thumbnail too. A repoint that
  // fixed `url` and quietly left `thumbnail_url` on an orphan host would report
  // success while still handing that host's URL to the gallery and the public
  // API — the rescue would be half-done and look complete.
  if (expectThumbnailProduction && after.thumbnail_url && !isProductionUrl(after.thumbnail_url)) {
    reasons.push(
      `resolved thumbnail still points at ${hostOf(after.thumbnail_url) ?? "an unknown host"}, not ${PRODUCTION_HOST}`,
    );
  }

  return { ok: reasons.length === 0, reasons };
}

/** Everything needed to put one row back exactly as it was. */
export function buildRollbackEntry(action, applied) {
  return {
    rowId: action.rowId,
    slug: action.slug,
    previous: {
      storage_id: action.expectedStorageId,
      url: action.expectedUrl,
      thumbnail_url: action.expectedThumbnailUrl,
    },
    applied: {
      storage_id: applied.storageId,
      thumbnail_storage_id: applied.thumbnailStorageId ?? null,
    },
    // Reversal is a single mutation with the previous storage id; `url` was
    // never touched, so it is still the fallback if the id is cleared.
    reverseWith: "api.replications.updateStorageIds",
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

/** The operation-specific confirmation, on top of the shared deployment ceremony. */
export function assertRepointAllowed(command, argv) {
  assertProductionWriteAllowed(command);
  if (!hasFlag(argv, "--confirm-repoint")) {
    throw new Error(`${OPERATION} requires --confirm-repoint alongside the standard write ceremony.`);
  }
}

// ---------------------------------------------------------------------------
// Runtime
// ---------------------------------------------------------------------------

/**
 * The archived file's own extension, which is what its bytes actually are.
 *
 * Deliberately not the row's `format`: a video row's poster is a JPEG on a row
 * whose format is `mp4`, so trusting the row there would ask for the content
 * type of the wrong file. The archive names every file from its source URL's
 * extension, falling back to the row format only for the primary asset, so the
 * name on disk is the closest thing to ground truth available without reopening
 * the file.
 */
function archivedFormatOf(entry) {
  const ext = path.extname(String(entry.archivePath ?? "")).toLowerCase();
  return ext ? ext.slice(1) : (entry.format ?? "");
}

/** Read only the container signature, never the whole file. */
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

/** The type an archived image must be uploaded under, most trustworthy source first. */
function archivedImageContentType(entry) {
  return imageContentTypeFor({
    sniffed: sniffFile(entry.archivePath),
    declared: entry.contentType,
    format: archivedFormatOf(entry),
  });
}

/**
 * Where each row's uploadable bytes are on disk, read from the archive manifest.
 *
 * The two media types disagree only about which file that is: a video uploads
 * the transcoded rendition and archives the master, an image uploads the
 * archived master itself because there is no rendition and deliberately never
 * will be.
 */
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

const UPLOAD_ATTEMPTS = 8;
const UPLOAD_BACKOFF_CAP_MS = 30_000;

/**
 * Upload one file, retrying the transport.
 *
 * Pushing five gigabytes over sixty-five requests means the occasional
 * connection-level failure is expected rather than exceptional — a run died on
 * the very first batch with a TLS `bad record mac`, and the identical upload
 * succeeded four times in a row moments later. Without a retry, one blip
 * halfway through abandons the migration in a half-applied state.
 *
 * Only the transport is retried. A non-2xx response is the server refusing the
 * upload and means something is actually wrong, so it fails immediately rather
 * than hammering the deployment. Each attempt takes a fresh upload URL, since
 * a Convex upload URL is single-use.
 */
async function uploadFile(client, apiKey, filePath, contentType) {
  const body = fs.readFileSync(filePath);
  let lastError;

  for (let attempt = 1; attempt <= UPLOAD_ATTEMPTS; attempt += 1) {
    // A fresh dispatcher per attempt, torn down afterwards. The failure this
    // guards against poisons the connection rather than the request: a TLS
    // `bad record mac` was followed by ERR_HTTP2_INVALID_SESSION on every
    // retry, because each one reused the session that had just broken. Pinning
    // to a single non-pooled HTTP/1.1 connection means a retry genuinely starts
    // over instead of re-entering a dead socket.
    const dispatcher = new Agent({ connections: 1, pipelining: 0, allowH2: false });
    try {
      const uploadUrl = await client.mutation(api.replications.generateUploadUrl, { apiKey });
      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": contentType },
        body,
        dispatcher,
      });
      if (!response.ok) throw new Error(`Upload failed: ${response.status} ${await response.text()}`);
      const { storageId } = await response.json();
      if (!storageId) throw new Error("Upload returned no storageId.");
      return storageId;
    } catch (error) {
      lastError = error;
      if (error.message?.startsWith("Upload failed:") || attempt === UPLOAD_ATTEMPTS) throw error;

      let root = error.cause;
      while (root?.cause) root = root.cause;
      const delayMs = Math.min(1000 * 2 ** (attempt - 1), UPLOAD_BACKOFF_CAP_MS);
      console.warn(
        `    upload attempt ${attempt}/${UPLOAD_ATTEMPTS} failed (${root?.code ?? error.message}); retrying in ${delayMs / 1000}s`,
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    } finally {
      await dispatcher.close().catch(() => {});
    }
  }

  throw lastError;
}

async function main() {
  const argv = process.argv.slice(2);
  const command = createProductionWriteCommand({ operation: OPERATION });
  printProductionWriteCommand(command);

  const mediaType = assertMediaType(getFlagValue(argv, "--media-type") ?? DEFAULT_MEDIA_TYPE);
  const manifestPath = getFlagValue(argv, "--manifest");
  const renditionsDir = getFlagValue(argv, "--renditions-dir");
  const batchSize = Number(getFlagValue(argv, "--batch-size") ?? 5);
  const includeThumbnails = !hasFlag(argv, "--skip-thumbnails");

  if (!manifestPath) throw new Error("Pass --manifest=<archive-manifest.json from the archive run>.");
  // Image uploads come out of the archive named in the manifest, so there is no
  // renditions directory to point at and asking for one would be a lie.
  if (mediaType === "video" && !renditionsDir) {
    throw new Error("Pass --renditions-dir=<directory of web renditions>.");
  }
  if (!fs.existsSync(manifestPath)) throw new Error(`Manifest not found: ${manifestPath}`);

  const readUrl = command.targetUrl || process.env.CONVEX_PUBLIC_READ_URL;
  if (!readUrl) {
    throw new Error("Set --target-url/TARGET_CONVEX_URL (or CONVEX_PUBLIC_READ_URL for a dry run).");
  }

  const readClient = new ConvexHttpClient(readUrl);
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
      `  ${action.slug}\n    ${hostOf(action.expectedUrl) ?? "unresolved"} -> ${PRODUCTION_HOST}  (${action.sourceBytes} bytes, ${action.contentType})`,
    );
  }
  if (actions.length > 10) console.log(`  … and ${actions.length - 10} more`);

  if (command.dryRun) {
    console.log("\nPer-row verification that would run after each write:");
    console.log("  1. re-query api.replications.getPublicReplications (the resolver the site uses)");
    console.log("  2. require the resolved url to be non-null      — a null url removes the page");
    console.log("  3. require the resolved url to have changed     — proves the write took effect");
    console.log(`  4. require the resolved host to be ${PRODUCTION_HOST}`);
    console.log("  5. require the thumbnail not to regress to null");
    console.log(
      `  6. require the resolved thumbnail host to be ${PRODUCTION_HOST} on the ${actions.filter((action) => action.writesThumbnail).length} row(s) whose thumbnail this run sets`,
    );
    console.log("  A failing row stops the entire run before the next batch.");
    console.log("\nDry run — nothing uploaded, no Convex writes performed.");
    return;
  }

  assertRepointAllowed(command, argv);
  const { token: apiKey } = requireProductionWriteCredential("replicationMaintenance");
  const writeClient = new ConvexHttpClient(command.targetUrl);

  // The ledger belongs next to whatever the run was reading: the renditions for
  // a video run, the manifest itself when there are no renditions.
  const ledgerDir = renditionsDir ? path.resolve(renditionsDir) : path.dirname(path.resolve(manifestPath));
  const rollbackPath = path.join(ledgerDir, `repoint-${mediaType}-rollback-${Date.now()}.json`);
  const rollback = [];
  const writeRollback = () =>
    fs.writeFileSync(rollbackPath, `${JSON.stringify({ operation: OPERATION, entries: rollback }, null, 2)}\n`);

  let repointed = 0;

  for (const [batchIndex, batch] of batches.entries()) {
    console.log(`\n--- Batch ${batchIndex + 1}/${batches.length} ---`);

    for (const action of batch) {
      // Compare and swap: the row must still be what the reviewed plan described.
      const live = (await readClient.query(api.replications.getPublicReplications, {})).find(
        (row) => row._id === action.rowId,
      );
      if (!live) throw new Error(`${action.slug}: row no longer exists. Stopping.`);
      if (live.storage_id !== action.expectedStorageId) {
        throw new Error(
          `${action.slug}: storage_id changed since the plan (${action.expectedStorageId} -> ${live.storage_id}). Stopping.`,
        );
      }

      const before = { url: live.url, thumbnail_url: live.thumbnail_url };

      const storageId = await uploadFile(writeClient, apiKey, action.sourcePath, action.contentType);
      // Three cases, in order of specificity: a thumbnail that is the same
      // stored object as the media (point both fields at the one upload), a
      // genuinely separate poster file (upload it), or no thumbnail at all.
      const thumbnailStorageId = action.mirrorThumbnail
        ? storageId
        : action.posterPath
          ? await uploadFile(writeClient, apiKey, action.posterPath, action.posterContentType)
          : undefined;

      await writeClient.mutation(api.replications.updateStorageIds, {
        apiKey,
        id: action.rowId,
        storage_id: storageId,
        ...(thumbnailStorageId ? { thumbnail_storage_id: thumbnailStorageId } : {}),
      });

      rollback.push(buildRollbackEntry(action, { storageId, thumbnailStorageId }));
      writeRollback();

      const after = (await readClient.query(api.replications.getPublicReplications, {})).find(
        (row) => row._id === action.rowId,
      );
      const verdict = verifyRepoint({
        before,
        after,
        expectThumbnailProduction: action.writesThumbnail,
      });

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
  console.log('Run revalidateTag("convex-public:replications") to clear the 900s/3600s caches.');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(`\n${error.message}\n`);
    if (process.env.DEBUG) console.error(error);
    process.exit(1);
  });
}
