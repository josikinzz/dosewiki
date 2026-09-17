#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createDataClient } from "../lib/data-client.ts";
import { api } from "../../lib/postgres/runtime/api.ts"
import { assertDataOpsWriteAllowed,
backupBeforeWrite,
createDataOpsRunContext,
getFlagValue,
printDataOpsRunContext,
requireAdminIntentToken,
requireTargetUrl,  } from "../lib/data-ops-run-context.mjs"; import { updateAuditLog, writeAuditLog } from "../lib/data-ops-audit.mjs"
import {
  assertWorkbenchDraftPromotionAllowed,
  buildWorkbenchPromotionPlan,
  loadWorkbenchDraft,
  workbenchDraftPath,
} from "./workbench-draft-adapter.mjs";
import { applyCitationPromotionPlan } from "./citation-promotion-applicator.mjs";
import { assertExplicitCitationPromotionTarget } from "./citation-target-policy.mjs";

function parseOptions(argv) {
  const slug = getFlagValue(argv, "--slug");
  const help = argv.includes("--help") || argv.includes("-h");
  return {
    slug,
    draftPath: getFlagValue(argv, "--draft") ?? (slug && !help ? workbenchDraftPath(slug) : null),
    write: argv.includes("--write"),
    help,
  };
}

function printHelp() {
  console.log(`
Apply a completed external citation workbench draft through the site citation write path.

Usage:
  DATA_BACKEND=postgres TARGET_POSTGRES_URL=<postgres-url> npm run citations:apply-workbench -- --slug=2c-b --dry-run --allow-remote --expected-deployment=<host>/<database>
  DATA_BACKEND=postgres TARGET_POSTGRES_URL=<postgres-url> npm run citations:apply-workbench -- --slug=2c-b --write --allow-remote --confirm-citation-write --confirm-write=apply-citation-workbench-draft --expected-deployment=<host>/<database>

Options:
  --slug=<slug>                 Required article slug
  --draft=<path>                Workbench citation-draft.json path
  --write                       Persist the adapted draft to Postgres
  --confirm-citation-write      Required with --write
  --confirm-write=apply-citation-workbench-draft
                               Shared production confirmation required with --write
  --expected-deployment=<id>    Required for dry-run and write; must match the explicit Postgres target
  --allow-remote                Required for non-loopback targets, with POSTGRES_IMPORT_CONFIRM=<host>
  --help, -h                    Show this help message
`);
}

const argv = process.argv.slice(2);
const options = parseOptions(argv);

if (!options.help && !options.slug) {
  printHelp();
  console.error("--slug=<slug> is required.");
  process.exit(1);
}

const runContext = createDataOpsRunContext({
  operation: "apply citation workbench draft",
  intent: "citation-pilot",
  argv,
  sourceUrlKeys: [],
  targetUrlKeys: [],
  dryRunFlag: "--dry-run",
  executeFlag: "--write",
  requiresExecute: true,
  confirmationFlag: "--confirm-citation-write",
  selectedTables: ["substanceIndex", "citationEvidence"],
  localArtifacts: [options.draftPath],
  destructive: true,
});

if (!options.write) {
  runContext.dryRun = true;
  runContext.writeEnabled = false;
}

async function main() {
  if (options.help) {
    printHelp();
    return;
  }

  const supersededPath = resolve(dirname(options.draftPath), "SUPERSEDED.json");
  if (existsSync(supersededPath)) {
    const superseded = JSON.parse(readFileSync(supersededPath, "utf8"));
    const reason = superseded.reason ? ` Reason: ${superseded.reason}` : "";
    const replacement = superseded.replacementRunId
      ? ` Use replacement run: ${superseded.replacementRunId}.`
      : "";
    throw new Error(`Refusing to apply a superseded citation run.${reason}${replacement}`);
  }

  const workbenchDraft = loadWorkbenchDraft(options.draftPath);
  assertWorkbenchDraftPromotionAllowed(workbenchDraft);

  const targetUrl = assertExplicitCitationPromotionTarget(runContext);
  printDataOpsRunContext(runContext);
  console.log(`Slug: ${options.slug}`);
  console.log(`Workbench draft: ${options.draftPath}`);
  console.log("");

  requireTargetUrl(runContext, "Postgres citation target URL");
  const client = createDataClient({ target: targetUrl }).client;
  const article = await client.query(api.substanceIndex.getBySlug, { slug: options.slug });
  if (!article) {
    throw new Error(`No article found for slug: ${options.slug}`);
  }

  const promotionPlan = buildWorkbenchPromotionPlan({ article, workbenchDraft });

  if (Array.isArray(workbenchDraft.selectedSections) && workbenchDraft.selectedSections.length > 0) {
    const changedSections = new Set(
      promotionPlan.changes
        .map((change) => String(change.path ?? "").split(".")[0])
        .filter((section) => section && section !== "references"),
    );
    console.log(`Scoped draft: markers may change only inside selectedSections (${workbenchDraft.selectedSections.join(", ")}).`);
    console.log(`Sections changed by this plan: ${changedSections.size > 0 ? [...changedSections].join(", ") : "(none)"}. All other citable sections remain byte-for-byte from the live article.`);
    console.log("");
  }

  console.log("Adapted draft summary");
  console.log(JSON.stringify(promotionPlan.summary, null, 2));
  console.log("");

  console.log("Article changes");
  console.log(JSON.stringify(promotionPlan.changes, null, 2));
  console.log("");

  console.log("Evidence rows");
  console.log(JSON.stringify(promotionPlan.evidence.map((row) => ({
    claimKey: row.claimKey,
    fieldPath: row.fieldPath,
    status: row.status,
    referenceIds: row.referenceIds,
    supports: row.supports?.map((support) => ({
      sourceId: support.sourceId,
      referenceId: support.referenceId,
    })) ?? [],
    diagnostics: row.diagnostics,
  })), null, 2));
  console.log("");

  if (!options.write) {
    console.log("No writes performed. Re-run with the same explicit Postgres target and --expected-deployment, plus --write --confirm-citation-write and the shared confirmation phrase.");
    return;
  }

  assertDataOpsWriteAllowed(runContext);

  // Write audit log before making any changes
  const { path: auditLogPath } = writeAuditLog({
    operation: "citation-workbench-apply",
    intent: "citationEvidenceWrite",
    slug: options.slug,
    mutations: promotionPlan.changes.map((change) => ({
      path: change.path,
      action: change.before ? "update" : "create",
    })),
  });
  console.log(`Audit log: ${auditLogPath}`);

  // Backup article before write
  const { path: backupPath, documentCount } = await backupBeforeWrite({
    sourceClient: client,
    queryGetAll: api.substanceIndex.getBySlug,
    queryArgs: { slug: options.slug },
    label: `citation-apply-${options.slug}`,
  });
  console.log(`Backup: ${backupPath} (${documentCount} document)`);
  console.log("");

  const citationWriteToken = requireAdminIntentToken("citationEvidenceWrite");
  const writeResult = await applyCitationPromotionPlan({
    client,
    apiKey: citationWriteToken.token,
    plan: promotionPlan,
  });

  // Update audit log with results
  updateAuditLog(auditLogPath, {
    result: {
      articleResult: writeResult.article,
      evidenceResult: writeResult.evidence,
    },
    backupPath,
    status: "completed",
  });

  console.log("Write results");
  console.log(JSON.stringify({
    tokenSource: citationWriteToken.source,
    articleResult: writeResult.article,
    evidenceResult: writeResult.evidence,
    auditLogPath,
    backupPath,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
