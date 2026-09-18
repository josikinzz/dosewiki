#!/usr/bin/env node

/**
 * Backfill the maintained public read indexes. Defaults to tripReports; use
 * --index=gallery, --index=history or --index=reviews for the other relations.
 * Server-owned cursor checkpoints resume interrupted runs without skips.
 *
 * Idempotent: rows already in place are kept and stale ones removed, so the
 * script can be re-run after a partial pass. Native internal functions execute
 * through the explicit Postgres data client; remote connection confirmation,
 * write freeze and operation-specific confirmations remain mandatory.
 *
 * Usage:
 *   TARGET_POSTGRES_URL=postgresql://localhost/dosewiki \
 *   node scripts/data-ops/backfill-trip-report-substance-index.mjs --dry-run
 *
 *   TARGET_POSTGRES_URL=postgresql://localhost/dosewiki \
 *   node scripts/data-ops/backfill-trip-report-substance-index.mjs \
 *     --write --confirm-trip-report-substance-index-backfill \
 *     --confirm-write=<operation-name> --expected-deployment=<fingerprint>
 *
 * The dry run prints the operation name and fingerprint the write requires.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createDataClient } from "../lib/data-client.ts";
import { makeFunctionReference } from "../../lib/postgres/runtime/api.ts";
import { assertDataOpsWriteAllowed,
createDataOpsRunContext,
getFlagValue,
printDataOpsRunContext,
requireTargetUrl,  } from "../lib/data-ops-run-context.mjs"; import { updateAuditLog, writeAuditLog } from "../lib/data-ops-audit.mjs"

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const REQUESTED_INDEX = getFlagValue(process.argv.slice(2), "--index") ?? "tripReports";
const CONFIRMATION_FLAG = REQUESTED_INDEX === "tripReports"
  ? "--confirm-trip-report-substance-index-backfill" : "--confirm-public-read-index-backfill";
const STATUS_FUNCTION = REQUESTED_INDEX === "tripReports"
  ? "tripReports:getSubstanceIndexBackfillStatus" : "publicReadIndexes:getBackfillStatus";
const BACKFILL_FUNCTION = REQUESTED_INDEX === "tripReports"
  ? "tripReports:backfillSubstanceIndex" : "publicReadIndexes:backfill";
const INDEX_ARGS = REQUESTED_INDEX === "tripReports" ? {} : { name: REQUESTED_INDEX };
const DEFAULT_BATCH_SIZE = 50;
const MAX_PAGES = 10_000;

function parseOptions(argv) {
  if (!["tripReports", "gallery", "history", "reviews"].includes(REQUESTED_INDEX)) {
    throw new Error("--index must be tripReports, gallery, history or reviews.");
  }
  const write = argv.includes("--write");
  if (write && argv.includes("--dry-run")) {
    throw new Error("Use either --dry-run or --write, not both.");
  }
  const batchSize = Number.parseInt(getFlagValue(argv, "--batch-size") ?? `${DEFAULT_BATCH_SIZE}`, 10);
  if (!Number.isInteger(batchSize) || batchSize < 1) {
    throw new Error("--batch-size must be a positive integer.");
  }
  const maxPages = Number(getFlagValue(argv, "--max-pages") ?? MAX_PAGES);
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > MAX_PAGES) {
    throw new Error(`--max-pages must be between 1 and ${MAX_PAGES}.`);
  }
  return {
    write,
    targetUrl: getFlagValue(argv, "--target"),
    batchSize,
    maxPages,
    help: argv.includes("--help") || argv.includes("-h"),
  };
}

function printHelp() {
  console.log(`Backfill maintained public read indexes with durable resumable checkpoints.

Usage:
  bun scripts/data-ops/backfill-trip-report-substance-index.mjs --target=<postgres-url> --dry-run
  bun scripts/data-ops/backfill-trip-report-substance-index.mjs --target=<postgres-url> --write ${CONFIRMATION_FLAG} \\
    --confirm-write=<operation-name> --expected-deployment=<fingerprint>

Options:
  --target=<url>         Postgres target (or set TARGET_POSTGRES_URL)
  --write                Run the backfill (default is dry-run: status only)
  ${CONFIRMATION_FLAG}
                         Required with --write
  --index=<name>         tripReports (default), gallery, history or reviews
  --batch-size=<n>       Source documents per mutation (default: ${DEFAULT_BATCH_SIZE}, max 50)
  --max-pages=<n>        Stop after a bounded batch; next run resumes server checkpoint

Requires DATA_BACKEND=postgres; remote targets additionally require
--allow-remote and POSTGRES_IMPORT_CONFIRM=<hostname>.
`);
}


function printStatus(label, status) {
  console.log(`${label}: ${REQUESTED_INDEX} index version ${status.version}`);
  console.log(`  source rows processed: ${status.processed}`);
  console.log(`  checkpoint:            ${status.cursor ? "stored (resumable)" : "not started"}`);
  console.log(`  indexed read active:   ${status.indexActive ? "yes" : "no (complete fallback remains active)"}`);
}

const argv = process.argv.slice(2);
const options = parseOptions(argv);

if (options.help) {
  printHelp();
  process.exit(0);
}

const envWithCliOverrides = {
  ...process.env,
  ...(options.targetUrl ? { TARGET_POSTGRES_URL: options.targetUrl } : {}),
};

const runContext = createDataOpsRunContext({
  operation: REQUESTED_INDEX === "tripReports"
    ? "backfill trip report substance index" : `backfill ${REQUESTED_INDEX} public read index`,
  intent: "public-read-index-backfill",
  argv,
  env: envWithCliOverrides,
  dryRunFlag: "--dry-run",
  executeFlag: "--write",
  requiresExecute: true,
  confirmationFlag: CONFIRMATION_FLAG,
  selectedTables: ["publicReadIndexState", ...({
    tripReports: ["tripReports", "tripReportSubstances"],
    gallery: ["replications", "replicationGalleryCandidates"],
    history: ["changelog", "articleHistory"],
    reviews: ["substanceIndex", "reviewedArticles"],
  })[REQUESTED_INDEX]],
  destructive: true,
});
if (!options.write) {
  runContext.dryRun = true;
  runContext.writeEnabled = false;
}

async function main() {
  printDataOpsRunContext(runContext);
  const targetUrl = requireTargetUrl(runContext);

  const { client, fingerprint: reached } = createDataClient({ target: targetUrl });
  console.log(`Deployment: ${reached}`);
  const before = await client.query(makeFunctionReference(STATUS_FUNCTION), INDEX_ARGS);
  printStatus("Before", before);

  if (!options.write) {
    console.log("\nDry run: no rows written.");
    console.log(
      `To run: add --write ${CONFIRMATION_FLAG} --confirm-write=${runContext.operationName} --expected-deployment=${runContext.deploymentFingerprint}`,
    );
    return;
  }

  assertDataOpsWriteAllowed(runContext);
  if (before.indexActive) {
    console.log("The current index version is already complete; no mutation needed.");
    return;
  }

  const audit = writeAuditLog({
    operation: runContext.operation,
    intent: runContext.intent,
    mutations: [],
    repoRoot: REPO_ROOT,
  });
  console.log(`Audit log: ${audit.path}`);

  let cursor = before.cursor;
  let processed = 0;
  let inserted = 0;
  let removed = 0;
  let pages = 0;
  const limit = Math.min(options.batchSize, 50);
  let completed = false;
  for (; pages < options.maxPages; pages += 1) {
    const result = await client.mutation(makeFunctionReference(BACKFILL_FUNCTION), {
      ...INDEX_ARGS,
      ...(cursor ? { cursor } : {}),
      limit,
    });
    processed += result.processed;
    inserted += result.inserted;
    removed += result.removed;
    console.log(
      `  page ${pages + 1}: processed ${result.processed}, inserted ${result.inserted}, removed ${result.removed}`,
    );
    updateAuditLog(audit.path, { deployment: reached, index: REQUESTED_INDEX, processed, inserted, removed, pages: pages + 1, cursor: result.cursor, complete: result.isDone });
    if (result.isDone) { completed = true; break; }
    if (typeof result.cursor !== "string" || result.cursor.length === 0 || result.cursor === cursor) {
      throw new Error(`${BACKFILL_FUNCTION} did not advance its cursor.`);
    }
    cursor = result.cursor;
  }
  const after = await client.query(makeFunctionReference(STATUS_FUNCTION), INDEX_ARGS);
  updateAuditLog(audit.path, {
    deployment: reached,
    processed,
    inserted,
    removed,
    pages: completed ? pages + 1 : pages,
    before,
    after,
  });

  console.log(`\n${completed ? "Backfill complete" : "Bounded batch stopped; rerun to resume"}: processed ${processed}, inserted ${inserted}, removed ${removed}.`);
  printStatus("After", after);
  if (completed && !after.indexActive) throw new Error("Backfill ended without a durable completion marker.");
}

main().catch((error) => {
  console.error(`Backfill failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
