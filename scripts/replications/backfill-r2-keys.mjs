#!/usr/bin/env node

/**
 * Attach R2 archive keys to production replication rows, from the
 * retained historical reconciliation ledger reviewed for the storage migration.
 *
 * This writes ONLY the five optional `*_r2_key` fields, through the
 * compare-and-swap mutation `replications.updateR2Keys`: every key travels
 * with the storage ID it was derived from, and the mutation refuses the whole
 * batch entry when the row moved since the ledger was built. Storage IDs,
 * `url`, and `thumbnail_url` are never touched — they are the rollback source.
 *
 * Only ledger entries with `status: "exact"` (a single byte-identical R2
 * object) are ever written. Missing/ambiguous/error entries stay on Postgres
 * and are reported.
 *
 * Dry run (default — prints the plan, writes nothing):
 *   node scripts/replications/backfill-r2-keys.mjs --ledger <ledger.json>
 *
 * Canary (bounded set, then stop and verify end-to-end before expanding):
 *   node scripts/replications/backfill-r2-keys.mjs --ledger <ledger.json> \
 *     --slugs slug-a,slug-b --write --confirm-write=backfill-r2-keys \
 *     --expected-deployment=<host>/<database>
 *
 * Full run: same command without --slugs (batches of 100; add --limit N to
 * bound a batch-sized expansion wave).
 *
 * Requires TARGET_POSTGRES_URL and the replicationMaintenance credential; run
 * `npm run postgres:check-env-isolation` first, per docs/operations/data-credentials.md.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDataClient, resolvePostgresSource } from "../lib/data-client.ts";
import { api } from "../../lib/postgres/runtime/api.ts"
import {
  assertProductionWriteAllowed,
  createProductionWriteCommand,
  printProductionWriteCommand,
  requireProductionWriteCredential,
} from "../lib/production-write-command.mjs";
import { getFlagValue } from "../lib/data-ops-run-context.mjs";

const OPERATION = "backfill-r2-keys";
const WRITE_BATCH_SIZE = 100;

/** Ledger role -> mutation argument field carrying that role's CAS basis. */
const EXPECTED_FIELD_BY_KEY_FIELD = {
  r2_key: "expectedStorageId",
  thumbnail_r2_key: "expectedThumbnailStorageId",
  preview_r2_key: "expectedPreviewStorageId",
  motion_r2_key: "expectedMotionStorageId",
  motion_poster_r2_key: "expectedMotionPosterStorageId",
};

/**
 * Group exact-match ledger entries into updateR2Keys updates, one per row.
 * `liveRows` supplies the current row state so a rerun skips keys that are
 * already attached with the planned value (idempotence) and refuses rows
 * whose storage IDs moved since the ledger was built (the plan is stale;
 * rebuild the ledger rather than trusting it).
 */
export function planR2KeyBackfill(ledgerEntries, liveRows, { slugs = null, limit = null } = {}) {
  const rowById = new Map(liveRows.map((row) => [row._id, row]));
  const wanted = slugs ? new Set(slugs) : null;
  const byRowId = new Map();
  const skipped = [];
  const stale = [];

  for (const entry of ledgerEntries) {
    if (entry.status !== "exact") continue;
    if (wanted && !wanted.has(entry.slug)) continue;
    const row = rowById.get(entry.id);
    if (!row) {
      stale.push({ slug: entry.slug, reason: "row no longer exists" });
      continue;
    }
    const storageField = entry.keyField === "r2_key"
      ? "storage_id"
      : entry.keyField.replace(/_r2_key$/, "_storage_id");
    if (row[storageField] !== entry.storage_id || row.storage_id !== entry.expectedStorageId) {
      stale.push({ slug: entry.slug, role: entry.role, reason: `${storageField} changed since the ledger was built` });
      continue;
    }
    if (row[entry.keyField] === entry.r2_key) {
      skipped.push({ slug: entry.slug, role: entry.role, reason: "key already attached" });
      continue;
    }
    let update = byRowId.get(entry.id);
    if (!update) {
      update = { id: entry.id, slug: entry.slug, expectedStorageId: row.storage_id };
      byRowId.set(entry.id, update);
    }
    update[entry.keyField] = entry.r2_key;
    const expectedField = EXPECTED_FIELD_BY_KEY_FIELD[entry.keyField];
    if (expectedField !== "expectedStorageId") {
      update[expectedField] = entry.storage_id;
    }
  }

  let updates = [...byRowId.values()];
  if (limit !== null) updates = updates.slice(0, limit);
  return { updates, skipped, stale };
}

function chunk(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function main() {
  const argv = process.argv.slice(2);
  const command = createProductionWriteCommand({ operation: OPERATION, argv });
  printProductionWriteCommand(command);

  const ledgerPath = getFlagValue(argv, "--ledger");
  if (!ledgerPath) {
    console.error("Usage: node scripts/replications/backfill-r2-keys.mjs --ledger <ledger.json> [--slugs a,b] [--limit N] [--write ...]");
    process.exit(1);
  }
  const ledger = JSON.parse(fs.readFileSync(ledgerPath, "utf8"));
  const slugsFlag = getFlagValue(argv, "--slugs");
  const limitFlag = getFlagValue(argv, "--limit");

  const readUrl = command.writeRequested ? command.targetUrl : resolvePostgresSource({}).url;
  if (!readUrl) {
    throw new Error("Set --target/TARGET_POSTGRES_URL (or SOURCE_POSTGRES_URL for a dry run).");
  }
  const readClient = createDataClient({ target: readUrl }).client;
  const liveRows = await readClient.query(api.replications.getAll, {});

  const plan = planR2KeyBackfill(ledger.entries, liveRows, {
    slugs: slugsFlag ? slugsFlag.split(",").map((slug) => slug.trim()).filter(Boolean) : null,
    limit: limitFlag ? Number(limitFlag) : null,
  });

  const keyCount = plan.updates.reduce(
    (total, update) => total + Object.keys(EXPECTED_FIELD_BY_KEY_FIELD).filter((field) => update[field]).length,
    0,
  );
  console.log(`\nLedger entries : ${ledger.entries.length}`);
  console.log(`Rows to patch  : ${plan.updates.length} (${keyCount} keys)`);
  console.log(`Already done   : ${plan.skipped.length}`);
  console.log(`Stale vs plan  : ${plan.stale.length}`);
  for (const item of plan.stale) {
    console.log(`  STALE ${item.slug} ${item.role ?? ""}: ${item.reason} — rebuild the ledger.`);
  }

  if (command.dryRun) {
    for (const update of plan.updates.slice(0, 10)) {
      console.log(`  would patch ${update.slug}: ${Object.keys(update).filter((field) => field.endsWith("_r2_key") || field === "r2_key").join(", ")}`);
    }
    if (plan.updates.length > 10) console.log(`  ... and ${plan.updates.length - 10} more rows`);
    console.log("\nDry run: nothing written. Re-run with --write --confirm-write and --expected-deployment to execute.");
    return;
  }

  if (plan.stale.length > 0) {
    throw new Error("Refusing to write while any planned row is stale; rebuild the ledger first.");
  }
  assertProductionWriteAllowed(command);
  const { token: apiKey } = requireProductionWriteCredential("replicationMaintenance");
  const writeClient = createDataClient({ target: command.targetUrl }).client;

  let written = 0;
  for (const batch of chunk(plan.updates, WRITE_BATCH_SIZE)) {
    const updates = batch.map(({ slug: _slug, ...update }) => update);
    await writeClient.mutation(api.replications.updateR2Keys, { apiKey, updates });
    written += batch.length;
    console.log(`  wrote ${written}/${plan.updates.length}`);
  }

  // Read back every patched row and require the planned keys to have landed.
  const failures = [];
  for (const update of plan.updates) {
    const live = await writeClient.query(api.replications.getResolvedById, { apiKey, id: update.id });
    for (const field of Object.keys(EXPECTED_FIELD_BY_KEY_FIELD)) {
      if (update[field] && live?.[field] !== update[field]) {
        failures.push(`${update.slug}: ${field} did not persist`);
      }
    }
  }
  if (failures.length > 0) {
    throw new Error(`Read-back verification failed:\n${failures.join("\n")}`);
  }
  console.log(`\nRead-back verified: ${plan.updates.length} row(s) carry their planned R2 keys.`);
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
