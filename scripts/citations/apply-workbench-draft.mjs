#!/usr/bin/env node

import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api.js";
import {
  assertDataOpsWriteAllowed,
  backupBeforeWrite,
  createDataOpsRunContext,
  getFlagValue,
  printDataOpsRunContext,
  requireAdminIntentToken,
  requireTargetUrl,
  updateAuditLog,
  writeAuditLog,
} from "../lib/data-ops-run-context.mjs";
import {
  DEFAULT_DRAFT_PATH,
  assertWorkbenchDraftPromotionAllowed,
  buildWorkbenchPromotionPlan,
  loadWorkbenchDraft,
} from "./workbench-draft-adapter.mjs";
import { applyCitationPromotionPlan } from "./citation-promotion-applicator.mjs";

function parseOptions(argv) {
  const slug = getFlagValue(argv, "--slug");
  return {
    slug,
    draftPath: getFlagValue(argv, "--draft")
      ?? (slug ? DEFAULT_DRAFT_PATH.replace("/runs/2c-b/", `/runs/${slug}/`) : DEFAULT_DRAFT_PATH),
    write: argv.includes("--write"),
    help: argv.includes("--help") || argv.includes("-h"),
  };
}

function printHelp() {
  console.log(`
Apply a completed external citation workbench draft through the site citation write path.

Usage:
  npm run citations:apply-workbench -- --slug=2c-b --dry-run
  npm run citations:apply-workbench -- --slug=2c-b --write --confirm-citation-write

Options:
  --slug=<slug>                 Article slug (default: 2c-b)
  --draft=<path>                Workbench citation-draft.json path
  --write                       Persist the adapted draft to Convex
  --confirm-citation-write      Required with --write
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

  const workbenchDraft = loadWorkbenchDraft(options.draftPath);
  assertWorkbenchDraftPromotionAllowed(workbenchDraft);

  printDataOpsRunContext(runContext);
  console.log(`Slug: ${options.slug}`);
  console.log(`Workbench draft: ${options.draftPath}`);
  console.log("");

  const targetUrl = requireTargetUrl(runContext, "Convex citation target URL");
  const client = new ConvexHttpClient(targetUrl);
  const article = await client.query(api.substanceIndex.getBySlug, { slug: options.slug });
  if (!article) {
    throw new Error(`No article found for slug: ${options.slug}`);
  }

  const promotionPlan = buildWorkbenchPromotionPlan({ article, workbenchDraft });

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
    console.log("No writes performed. Re-run with --write --confirm-citation-write to update Convex.");
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
