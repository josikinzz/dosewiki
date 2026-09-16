#!/usr/bin/env node

/**
 * Backfill empty `identification` fields and empty `classification.psychoactive_class`
 * on Postgres substance articles from a reviewed proposals file. Fill-only: a proposal
 * value is applied only when the LIVE field is empty ("" / [] / null), so this script
 * can never overwrite populated data. Full articles are written via the standard
 * data-ops dry-run -> --write --confirm-identification-write flow with a full-table
 * backup and audit log.
 *
 * Usage:
 *   node scripts/data-ops/backfill-identification.mjs --target=<url> --dry-run
 *   node scripts/data-ops/backfill-identification.mjs --target=<url> --write --confirm-identification-write
 */
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createDataClient, postgresFingerprintFromUrl } from "../lib/data-client.ts";

import { api } from "../../lib/postgres/runtime/api.ts";
import { getAllSubstanceDocuments } from "../lib/data-pagination.mjs";
import { assertDataOpsWriteAllowed,
backupBeforeWrite,
batchAndApplyMutations,
createDataOpsRunContext,
getFlagValue,
printDataOpsRunContext,
requireAdminIntentToken,
requireTargetUrl,  } from "../lib/data-ops-run-context.mjs"; import { updateAuditLog, writeAuditLog } from "../lib/data-ops-audit.mjs"
import { sanitizeObjectKeys, stripDataMetadata } from "../batch/summary/articles.mjs";

const DEFAULT_PROPOSALS = "scripts/data/identification-backfill-proposals.json";
const DEFAULT_REPORT_DIR = "scripts/data/identification-backfill-reports";
const CONFIRMATION_FLAG = "--confirm-identification-write";

function parseOptions(argv) {
  const write = argv.includes("--write");
  if (write && argv.includes("--dry-run")) {
    throw new Error("Use either --dry-run or --write, not both.");
  }
  return {
    write,
    dryRun: !write,
    proposalsPath: getFlagValue(argv, "--proposals") ?? DEFAULT_PROPOSALS,
    targetUrl: getFlagValue(argv, "--target"),
    reportDir: getFlagValue(argv, "--report-dir") ?? DEFAULT_REPORT_DIR,
    batchSize: Number.parseInt(getFlagValue(argv, "--batch-size") ?? "25", 10),
    help: argv.includes("--help") || argv.includes("-h"),
  };
}

function isEmptyValue(value) {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

/** Fill empty live fields from the proposal; returns { next, filled, skipped } or null if no-op. */
function applyBackfill(article, proposal) {
  const filled = [];
  const skipped = [];

  const identification = { ...(article.identification ?? {}) };
  for (const [field, value] of Object.entries(proposal.identification ?? {})) {
    if (isEmptyValue(identification[field])) {
      identification[field] = value;
      filled.push(`identification.${field}`);
    } else {
      skipped.push(`identification.${field}`);
    }
  }

  const classification = { ...(article.classification ?? {}) };
  for (const field of ["psychoactive_class", "chemical_class"]) {
    if (proposal[field] === undefined) continue;
    if (isEmptyValue(classification[field])) {
      classification[field] = proposal[field];
      filled.push(`classification.${field}`);
    } else {
      skipped.push(`classification.${field}`);
    }
  }

  if (filled.length === 0) return null;
  return { next: { ...article, identification, classification }, filled, skipped };
}

function stripForDataWrite(article) {
  return sanitizeObjectKeys(stripDataMetadata(article));
}

const argv = process.argv.slice(2);
const options = parseOptions(argv);

if (options.help) {
  console.log(`Backfill empty identification/psychoactive_class fields on Postgres substance articles.

Usage:
  node scripts/data-ops/backfill-identification.mjs --target=<url> --dry-run
  node scripts/data-ops/backfill-identification.mjs --target=<url> --write ${CONFIRMATION_FLAG}

Options:
  --proposals=<path>   Proposals file (default: ${DEFAULT_PROPOSALS})
  --target=<url>   Write/read Postgres deployment
  --write              Persist changes (default is dry-run)
  ${CONFIRMATION_FLAG}   Required with --write
  --batch-size=<n>     Postgres write batch size (default: 25)
  --report-dir=<path>  Report output directory
`);
  process.exit(0);
}

const envWithCliOverrides = {
  ...process.env,
  ...(options.targetUrl ? { TARGET_POSTGRES_URL: options.targetUrl } : {}),
};

const runContext = createDataOpsRunContext({
  operation: "backfill substance identification fields",
  intent: "identification-backfill-write",
  argv,
  env: envWithCliOverrides,
  dryRunFlag: "--dry-run",
  executeFlag: "--write",
  requiresExecute: true,
  confirmationFlag: CONFIRMATION_FLAG,
  selectedTables: ["substanceIndex"],
  localArtifacts: [options.reportDir],
  destructive: true,
});
if (!options.write) {
  runContext.dryRun = true;
  runContext.writeEnabled = false;
}

function writeReport(plan) {
  const reportDir = resolve(process.cwd(), options.reportDir);
  mkdirSync(reportDir, { recursive: true });
  const base = `identification-backfill-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const jsonPath = resolve(reportDir, `${base}.json`);
  writeFileSync(jsonPath, JSON.stringify(plan, null, 2) + "\n");
  return jsonPath;
}

async function main() {
  printDataOpsRunContext(runContext);

  const proposalsRaw = JSON.parse(readFileSync(resolve(process.cwd(), options.proposalsPath), "utf8"));
  const proposals = proposalsRaw.proposals ?? proposalsRaw;
  const targetUrl = requireTargetUrl(runContext, "Postgres identification backfill target URL");
  console.log(`Read/write Postgres: ${postgresFingerprintFromUrl(targetUrl)}`);
  console.log(`Proposals: ${options.proposalsPath} (${Object.keys(proposals).length} slugs)\n`);

  const client = createDataClient({ target: targetUrl }).client;
  const articles = await getAllSubstanceDocuments(client, api.substanceIndex.getFullDocumentPage);
  const bySlug = new Map(articles.map((a) => [a.slug, a]));

  const changes = [];
  const missing = [];
  const noops = [];
  for (const [slug, proposal] of Object.entries(proposals)) {
    const article = bySlug.get(slug);
    if (!article) { missing.push(slug); continue; }
    const outcome = applyBackfill(article, proposal);
    if (!outcome) { noops.push(slug); continue; }
    changes.push({ slug, filled: outcome.filled, skippedNonEmpty: outcome.skipped, article: outcome.next });
  }

  const plan = {
    summary: { proposed: Object.keys(proposals).length, willChange: changes.length,
               alreadyPopulated: noops.length, notFoundInData: missing.length },
    missing,
    changes: changes.map(({ slug, filled, skippedNonEmpty }) => ({ slug, filled, skippedNonEmpty })),
  };
  const reportPath = writeReport(plan);
  console.log("Plan summary:");
  console.log(JSON.stringify(plan.summary, null, 2));
  if (missing.length) console.log(`\nNot found in Postgres (skipped): ${missing.join(", ")}`);
  console.log(`\nReport: ${reportPath}`);
  console.log("\nChanges:");
  for (const c of plan.changes) {
    console.log(`  ${c.slug}:`);
    console.log(`    fills: ${c.filled.join(", ")}`);
    if (c.skippedNonEmpty.length) console.log(`    already populated (untouched): ${c.skippedNonEmpty.join(", ")}`);
  }

  if (!options.write) {
    console.log(`\nDry-run only. Re-run with --write ${CONFIRMATION_FLAG} to persist.`);
    return;
  }
  if (changes.length === 0) {
    console.log("\nNothing to write.");
    return;
  }

  assertDataOpsWriteAllowed(runContext);
  const adminToken = requireAdminIntentToken("editorArticleWrite", { env: envWithCliOverrides });

  const { path: auditLogPath } = writeAuditLog({
    operation: "identification-backfill-write",
    intent: "editorArticleWrite",
    mutations: plan.changes,
  });
  console.log(`\nAudit log: ${auditLogPath}`);

  const { path: backupPath, documentCount } = await backupBeforeWrite({
    sourceClient: client,
    queryAll: () => getAllSubstanceDocuments(client, api.substanceIndex.getFullDocumentPage),
    label: "identification-backfill-substanceIndex",
  });
  console.log(`Backup: ${backupPath} (${documentCount} documents)`);

  const writeResult = await batchAndApplyMutations({
    items: changes.map((c) => c.article),
    batchSize: options.batchSize,
    mutation: api.substanceIndex.saveSubstances,
    client,
    runContext,
    transformBatch: (batch) => ({ apiKey: adminToken.token, articles: batch.map(stripForDataWrite) }),
    onBatchResult: (result, batchIndex, batch) => {
      console.log(`Batch ${batchIndex + 1}: wrote ${batch.length}, updated=${result.updated ?? 0}, created=${result.created ?? 0}, skipped=${result.skipped ?? 0}`);
    },
  });

  updateAuditLog(auditLogPath, { result: writeResult, backupPath, reportPaths: { jsonPath: reportPath },
    status: writeResult.failed ? "failed" : "completed" });
  console.log("\nWrite result:");
  console.log(JSON.stringify({ articleCount: changes.length, writeResult, backupPath, auditLogPath }, null, 2));
  if (writeResult.failed) process.exitCode = 1;
}

main().catch((error) => { console.error(error); process.exit(1); });
