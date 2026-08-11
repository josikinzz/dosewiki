#!/usr/bin/env node
/**
 * Upload transcoded renditions into production Convex storage and repoint the
 * rows at them, retiring the orphan deployments.
 *
 * This is the step that actually fixes the corpus. It replaces 44.19 GB spread
 * across two deployments nobody controls — plus 65 thumbnails served from the
 * *development* deployment — with faststart web renditions on production
 * storage, which is the only host this project can keep alive.
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
 */
import fs from "node:fs";
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
 * What has to happen to each row, given what the archive run produced.
 *
 * A row without a usable rendition is `skip`, never a partial write — repointing
 * a row at nothing is precisely how a page gets deleted.
 */
export function planRepoint(rows, renditionsBySlug, { includeThumbnails = true } = {}) {
  const actions = [];
  const skipped = [];

  for (const row of rows) {
    const rendition = renditionsBySlug.get(row.slug);

    if (!rendition?.videoPath) {
      skipped.push({ slug: row.slug, reason: "no rendition produced for this row" });
      continue;
    }
    if (!Number.isFinite(rendition.videoBytes) || rendition.videoBytes <= 0) {
      skipped.push({ slug: row.slug, reason: "rendition is empty" });
      continue;
    }
    if (isProductionUrl(row.url) && row.storageOnProduction && !rendition.force) {
      skipped.push({ slug: row.slug, reason: "already served from production storage" });
      continue;
    }

    actions.push({
      rowId: row._id,
      slug: row.slug,
      // Compare-and-swap expectation. The plan is reviewed before it is applied,
      // so the row must still look the way it did when the plan was made.
      expectedStorageId: row.storage_id,
      expectedUrl: row.url ?? null,
      expectedThumbnailUrl: row.thumbnail_url ?? null,
      videoPath: rendition.videoPath,
      videoBytes: rendition.videoBytes,
      posterPath: includeThumbnails ? (rendition.posterPath ?? null) : null,
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
export function verifyRepoint({ before, after, expectProduction = true }) {
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

function readRenditions(manifestPath, renditionsDir) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const bySlug = new Map();

  for (const entry of manifest.archived ?? []) {
    const current = bySlug.get(entry.slug) ?? {};
    if (entry.kind === "video") {
      const videoPath = entry.renditionPath ?? path.join(renditionsDir, `${entry.slug}.mp4`);
      if (fs.existsSync(videoPath)) {
        current.videoPath = videoPath;
        current.videoBytes = fs.statSync(videoPath).size;
      }
    } else if (entry.kind === "thumbnail" && fs.existsSync(entry.archivePath)) {
      current.posterPath = entry.archivePath;
    }
    bySlug.set(entry.slug, current);
  }

  return bySlug;
}

async function uploadFile(client, apiKey, filePath, contentType) {
  const uploadUrl = await client.mutation(api.replications.generateUploadUrl, { apiKey });
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: { "Content-Type": contentType },
    body: fs.readFileSync(filePath),
  });
  if (!response.ok) throw new Error(`Upload failed: ${response.status} ${await response.text()}`);
  const { storageId } = await response.json();
  if (!storageId) throw new Error("Upload returned no storageId.");
  return storageId;
}

async function main() {
  const argv = process.argv.slice(2);
  const command = createProductionWriteCommand({ operation: OPERATION });
  printProductionWriteCommand(command);

  const manifestPath = getFlagValue(argv, "--manifest");
  const renditionsDir = getFlagValue(argv, "--renditions-dir");
  const batchSize = Number(getFlagValue(argv, "--batch-size") ?? 5);
  const includeThumbnails = !hasFlag(argv, "--skip-thumbnails");

  if (!manifestPath) throw new Error("Pass --manifest=<archive-manifest.json from the archive run>.");
  if (!renditionsDir) throw new Error("Pass --renditions-dir=<directory of web renditions>.");
  if (!fs.existsSync(manifestPath)) throw new Error(`Manifest not found: ${manifestPath}`);

  const readUrl = command.targetUrl || process.env.CONVEX_PUBLIC_READ_URL;
  if (!readUrl) {
    throw new Error("Set --target-url/TARGET_CONVEX_URL (or CONVEX_PUBLIC_READ_URL for a dry run).");
  }

  const readClient = new ConvexHttpClient(readUrl);
  const rows = (await readClient.query(api.replications.getPublicReplications, {}))
    .filter((row) => row.type === "video")
    .map((row) => ({ ...row, storageOnProduction: isProductionUrl(row.url) }));

  const renditions = readRenditions(manifestPath, path.resolve(renditionsDir));
  const { actions, skipped } = planRepoint(rows, renditions, { includeThumbnails });
  const batches = chunk(actions, batchSize);

  console.log(`\nRows read      : ${rows.length}`);
  console.log(`Repoint plan   : ${actions.length} row(s) in ${batches.length} batch(es) of ${batchSize}`);
  console.log(`Skipped        : ${skipped.length}`);
  console.log(`Field written  : ${fieldThatWins()}  (the field that outranks 'url' in resolveReplicationUrls)\n`);

  for (const entry of skipped) console.log(`  SKIP ${entry.slug}: ${entry.reason}`);
  for (const action of actions.slice(0, 10)) {
    console.log(
      `  ${action.slug}\n    ${hostOf(action.expectedUrl) ?? "unresolved"} -> ${PRODUCTION_HOST}  (${action.videoBytes} bytes)`,
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
    console.log("  A failing row stops the entire run before the next batch.");
    console.log("\nDry run — nothing uploaded, no Convex writes performed.");
    return;
  }

  assertRepointAllowed(command, argv);
  const { token: apiKey } = requireProductionWriteCredential("replicationMaintenance");
  const writeClient = new ConvexHttpClient(command.targetUrl);

  const rollbackPath = path.join(path.resolve(renditionsDir), `repoint-rollback-${Date.now()}.json`);
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

      const storageId = await uploadFile(writeClient, apiKey, action.videoPath, "video/mp4");
      const thumbnailStorageId = action.posterPath
        ? await uploadFile(writeClient, apiKey, action.posterPath, "image/jpeg")
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
      const verdict = verifyRepoint({ before, after });

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
