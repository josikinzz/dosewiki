#!/usr/bin/env node

/**
 * Apply reviewed per-slug `classification.chemical_class` deltas to Postgres, to
 * populate the chemical-class tree's leaf pages. Deltas (added/removed tag
 * strings) are applied against the LIVE article classification, so a stale local
 * seed can never clobber live data. Full articles are written (Postgres `db.patch`
 * shallow-merges, replacing the whole `classification` object), gated behind the
 * standard data-ops dry-run -> --write --confirm-chemical-class-write flow with
 * a full-table backup and audit log.
 *
 * Usage:
 *   node scripts/data-ops/set-chemical-class.mjs --target=<editor-url> --dry-run
 *   node scripts/data-ops/set-chemical-class.mjs --target=<editor-url> --write --confirm-chemical-class-write
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

const DEFAULT_PROPOSALS = "scripts/data/chemical-class-proposals.json";
const DEFAULT_REPORT_DIR = "scripts/data/chemical-class-reports";
const CONFIRMATION_FLAG = "--confirm-chemical-class-write";

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

/** Apply a {added, removed} delta to a chemical_class array; returns null if unchanged. */
function applyDelta(current, delta) {
  const base = Array.isArray(current) ? [...current] : [];
  const removed = new Set(delta.removed ?? []);
  const kept = base.filter((tag) => !removed.has(tag));
  const next = [...kept];
  for (const tag of delta.added ?? []) {
    if (!next.includes(tag)) next.push(tag);
  }
  const changed =
    next.length !== base.length || next.some((tag, i) => tag !== base[i]);
  return changed ? next : null;
}

function stripForDataWrite(article) {
  return sanitizeObjectKeys(stripDataMetadata(article));
}

const argv = process.argv.slice(2);
const options = parseOptions(argv);

if (options.help) {
  console.log(`Apply reviewed chemical_class deltas to Postgres substance articles.

Usage:
  node scripts/data-ops/set-chemical-class.mjs --target=<url> --dry-run
  node scripts/data-ops/set-chemical-class.mjs --target=<url> --write ${CONFIRMATION_FLAG}

Options:
  --proposals=<path>   Deltas file (default: ${DEFAULT_PROPOSALS})
  --target=<url>   Write/read Postgres deployment (editor deployment for edits)
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
  operation: "set substance chemical_class tags",
  intent: "chemical-class-write",
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
  const base = `chemical-class-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const jsonPath = resolve(reportDir, `${base}.json`);
  writeFileSync(jsonPath, JSON.stringify(plan, null, 2) + "\n");
  return jsonPath;
}

async function main() {
  printDataOpsRunContext(runContext);

  const proposalsRaw = JSON.parse(readFileSync(resolve(process.cwd(), options.proposalsPath), "utf8"));
  const proposals = proposalsRaw.proposals ?? proposalsRaw;
  const targetUrl = requireTargetUrl(runContext, "Postgres chemical_class target URL");
  console.log(`Read/write Postgres: ${postgresFingerprintFromUrl(targetUrl)}`);
  console.log(`Proposals: ${options.proposalsPath} (${Object.keys(proposals).length} slugs)\n`);

  const client = createDataClient({ target: targetUrl }).client;
  const articles = await getAllSubstanceDocuments(client, api.substanceIndex.getFullDocumentPage);
  const bySlug = new Map(articles.map((a) => [a.slug, a]));

  const changes = [];
  const missing = [];
  const noops = [];
  for (const [slug, delta] of Object.entries(proposals)) {
    const article = bySlug.get(slug);
    if (!article) { missing.push(slug); continue; }
    const currentChem = article.classification?.chemical_class ?? [];
    const next = applyDelta(currentChem, delta);
    if (!next) { noops.push(slug); continue; }
    changes.push({ slug, before: currentChem, after: next, delta,
      article: { ...article, classification: { ...(article.classification ?? {}), chemical_class: next } } });
  }

  const plan = {
    summary: { proposed: Object.keys(proposals).length, willChange: changes.length,
               alreadyCurrent: noops.length, notFoundInData: missing.length },
    missing,
    changes: changes.map(({ slug, before, after, delta }) => ({ slug, before, after, ...delta })),
  };
  const reportPath = writeReport(plan);
  console.log("Plan summary:");
  console.log(JSON.stringify(plan.summary, null, 2));
  if (missing.length) console.log(`\nNot found in Postgres (skipped): ${missing.join(", ")}`);
  console.log(`\nReport: ${reportPath}`);
  console.log("\nChanges:");
  for (const c of plan.changes) console.log(`  ${c.slug}: ${JSON.stringify(c.before)} -> ${JSON.stringify(c.after)}`);

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
    operation: "chemical-class-write",
    intent: "editorArticleWrite",
    mutations: plan.changes.map((c) => ({ slug: c.slug, before: c.before, after: c.after })),
  });
  console.log(`\nAudit log: ${auditLogPath}`);

  const { path: backupPath, documentCount } = await backupBeforeWrite({
    sourceClient: client,
    queryAll: () => getAllSubstanceDocuments(client, api.substanceIndex.getFullDocumentPage),
    label: "chemical-class-substanceIndex",
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
