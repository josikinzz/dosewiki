#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
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
requireSourceUrl,
requireTargetUrl,  } from "../lib/data-ops-run-context.mjs"; import { updateAuditLog, writeAuditLog } from "../lib/data-ops-audit.mjs"
import {
  sanitizeObjectKeys,
  stripDataMetadata,
} from "../batch/summary/articles.mjs";
import {
  applyRouteEquivalenceFillPlan,
  buildRouteEquivalenceFillPlan,
  formatRouteEquivalencePlanMarkdown,
  normalizeArticleForRouteEquivalenceSave,
  normalizeDirection,
  normalizeSections,
} from "./route-equivalence-fill.mjs";

const DEFAULT_REPORT_DIR = "scripts/data/route-equivalence-fill-reports";
const CONFIRMATION_FLAG = "--confirm-route-equivalence-fill";

function parseCsv(value) {
  if (!value) {
    return null;
  }
  return value.split(",").map((entry) => entry.trim()).filter(Boolean);
}

function parsePositiveInteger(value, fallback) {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Expected a positive integer, got: ${value}`);
  }
  return parsed;
}

function parseOptions(argv) {
  const write = argv.includes("--write");
  const dryRun = argv.includes("--dry-run") || !write;
  if (write && argv.includes("--dry-run")) {
    throw new Error("Use either --dry-run or --write, not both.");
  }

  const direction = normalizeDirection(getFlagValue(argv, "--direction") ?? "both");
  const sections = normalizeSections(parseCsv(getFlagValue(argv, "--section")) ?? ["dosage", "duration"]);

  return {
    dryRun,
    write,
    direction,
    sections,
    slugs: parseCsv(getFlagValue(argv, "--slug")),
    sourceUrl: getFlagValue(argv, "--source-url"),
    targetUrl: getFlagValue(argv, "--target"),
    reportDir: getFlagValue(argv, "--report-dir") ?? DEFAULT_REPORT_DIR,
    batchSize: parsePositiveInteger(getFlagValue(argv, "--batch-size"), 25),
    copyReferenceIds: argv.includes("--copy-reference-ids"),
    help: argv.includes("--help") || argv.includes("-h"),
  };
}

function printHelp() {
  console.log(`
Fill missing Insufflated/Rectal dosage or duration values only when the target
route is already established in the complementary section.

This never creates both dosage and duration for a brand-new route. For example:
  - Rectal dosage exists + rectal duration missing + insufflated duration exists => fill rectal duration.
  - Insufflated dosage/duration exist + rectal does not exist anywhere => skip.

Usage:
  npm run data:fill-route-gaps -- --dry-run
  npm run data:fill-route-gaps -- --write --confirm-route-equivalence-fill

Options:
  --dry-run                         Preview and write report artifacts (default)
  --write                           Persist changed articles to Postgres
  --confirm-route-equivalence-fill  Required with --write
  --direction=<mode>                both | insufflated-to-rectal | rectal-to-insufflated
  --section=<list>                  dosage,duration | dosage | duration
  --slug=<list>                     Limit to comma-separated slugs
  --source-url=<url>                Override read-only source Postgres URL
  --target=<url>                Override write target Postgres URL
  --batch-size=<n>                  Postgres write batch size (default: 25)
  --copy-reference-ids              Also copy source route reference_ids
  --report-dir=<path>               Report output directory
  --help, -h                        Show this help
`);
}

function reportBaseName() {
  return `route-equivalence-fill-${new Date().toISOString().replace(/[:.]/g, "-")}`;
}

function writeReports(plan, options) {
  const reportDir = resolve(process.cwd(), options.reportDir);
  mkdirSync(reportDir, { recursive: true });
  const baseName = reportBaseName();
  const jsonPath = resolve(reportDir, `${baseName}.json`);
  const markdownPath = resolve(reportDir, `${baseName}.md`);

  writeFileSync(jsonPath, JSON.stringify(plan, null, 2) + "\n");
  writeFileSync(markdownPath, formatRouteEquivalencePlanMarkdown(plan));

  return { jsonPath, markdownPath };
}

function printPlanSummary(plan, reports) {
  console.log("Route gap fill plan");
  console.log(JSON.stringify(plan.summary, null, 2));
  console.log("");
  console.log("Candidate patches");
  for (const candidate of plan.candidates) {
    console.log(
      `- ${candidate.title} (${candidate.slug}): ${candidate.sourcePath} -> ${candidate.path} ` +
        `[${candidate.action}; requires ${candidate.requiresExistingPath}]`,
    );
  }
  if (plan.candidates.length === 0) {
    console.log("- none");
  }
  console.log("");
  console.log(`Report JSON: ${reports.jsonPath}`);
  console.log(`Report Markdown: ${reports.markdownPath}`);
  console.log("");
}

const argv = process.argv.slice(2);
const options = parseOptions(argv);
const envWithCliOverrides = {
  ...process.env,
  ...(options.sourceUrl ? { SOURCE_POSTGRES_URL: options.sourceUrl } : {}),
  ...(options.targetUrl ? { TARGET_POSTGRES_URL: options.targetUrl } : {}),
};

const runContext = createDataOpsRunContext({
  operation: "fill insufflated/rectal route gaps",
  intent: "route-equivalence-fill",
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

function targetWasExplicit(context, parsedOptions) {
  return Boolean(
    parsedOptions.targetUrl ||
      context.targetUrlKey === "TARGET_POSTGRES_URL" ||
      context.targetUrlKey === "POSTGRES_DIRECT_URL",
  );
}

function getReadUrl(context, parsedOptions) {
  if (parsedOptions.write || (targetWasExplicit(context, parsedOptions) && !parsedOptions.sourceUrl)) {
    return {
      value: requireTargetUrl(context, "Postgres route-gap fill target URL"),
      key: context.targetUrlKey,
      role: "target",
    };
  }

  return {
    value: requireSourceUrl(context, "Postgres route-gap fill source URL"),
    key: context.sourceUrlKey,
    role: "source",
  };
}

function stripForDataWrite(article) {
  return sanitizeObjectKeys(stripDataMetadata(article));
}

async function main() {
  if (options.help) {
    printHelp();
    return;
  }

  printDataOpsRunContext(runContext);
  console.log(`Direction: ${options.direction}`);
  console.log(`Sections: ${options.sections.join(", ")}`);
  console.log(`Slugs: ${options.slugs?.join(", ") ?? "all"}`);
  console.log(`Copy reference IDs: ${options.copyReferenceIds ? "yes" : "no"}`);
  console.log("");

  const readUrl = getReadUrl(runContext, options);
  console.log(`Read Postgres: ${postgresFingerprintFromUrl(readUrl.value)} (${readUrl.key}, ${readUrl.role})`);
  console.log("");
  const client = createDataClient({ target: readUrl.value }).client;

  const articles = await getAllSubstanceDocuments(client, api.substanceIndex.getFullDocumentPage);
  const plan = buildRouteEquivalenceFillPlan(articles, options);
  const reports = writeReports(plan, options);
  printPlanSummary(plan, reports);

  if (!options.write) {
    console.log(`No writes performed. Re-run with --write ${CONFIRMATION_FLAG} to update Postgres.`);
    return;
  }

  if (plan.candidates.length === 0) {
    console.log("No candidate patches; nothing to write.");
    return;
  }

  assertDataOpsWriteAllowed(runContext);

  const adminToken = requireAdminIntentToken("editorArticleWrite", { env: envWithCliOverrides });
  const updatedArticles = applyRouteEquivalenceFillPlan(articles, plan)
    .map(normalizeArticleForRouteEquivalenceSave);

  const { path: auditLogPath } = writeAuditLog({
    operation: "route-equivalence-fill",
    intent: "editorArticleWrite",
    mutations: plan.candidates.map((candidate) => ({
      slug: candidate.slug,
      path: candidate.path,
      sourcePath: candidate.sourcePath,
      action: candidate.action,
      copiedFields: candidate.copiedFields,
      copiedReferenceIds: candidate.copiedReferenceIds,
    })),
  });
  console.log(`Audit log: ${auditLogPath}`);

  const { path: backupPath, documentCount } = await backupBeforeWrite({
    sourceClient: client,
    queryAll: () => getAllSubstanceDocuments(client, api.substanceIndex.getFullDocumentPage),
    label: "route-equivalence-fill-substanceIndex",
  });
  console.log(`Backup: ${backupPath} (${documentCount} documents)`);

  const writeResult = await batchAndApplyMutations({
    items: updatedArticles,
    batchSize: options.batchSize,
    mutation: api.substanceIndex.saveSubstances,
    client,
    runContext,
    transformBatch: (batch) => ({
      apiKey: adminToken.token,
      articles: batch.map(stripForDataWrite),
    }),
    onBatchResult: (result, batchIndex, batch) => {
      console.log(
        `Batch ${batchIndex + 1}: wrote ${batch.length} article(s), updated=${result.updated ?? 0}, created=${result.created ?? 0}`,
      );
    },
  });

  updateAuditLog(auditLogPath, {
    result: writeResult,
    backupPath,
    reportPaths: reports,
    status: writeResult.failed ? "failed" : "completed",
  });

  console.log("");
  console.log("Write result");
  console.log(JSON.stringify({
    tokenSource: adminToken.source,
    articleCount: updatedArticles.length,
    candidateCount: plan.candidates.length,
    writeResult,
    backupPath,
    auditLogPath,
    reportPaths: reports,
  }, null, 2));

  if (writeResult.failed) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
