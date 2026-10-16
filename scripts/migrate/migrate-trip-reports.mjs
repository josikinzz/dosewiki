#!/usr/bin/env node

import { readFileSync, existsSync } from "fs";
import { createDataClient, postgresFingerprintFromUrl } from "../lib/data-client.ts";
import { api } from "../../lib/postgres/runtime/api.ts"
import { assertDataOpsWriteAllowed,
batchAndApplyMutations,
createDataOpsRunContext,
printDataOpsRunContext,
requireTargetUrl,  } from "../lib/data-ops-run-context.mjs"; import { writeAuditLog, updateAuditLog } from "../lib/data-ops-audit.mjs"

const DEFAULT_REPORTS_PATH = "./reports.json";
const BATCH_SIZE = 50;

function transformReport(rawReport) {
  const subject = {
    name: rawReport.subject?.name || "Anonymous",
    trip_date: rawReport.subject?.trip_date || undefined,
    age: rawReport.subject?.age || undefined,
    gender: rawReport.subject?.gender || undefined,
    height: rawReport.subject?.height || undefined,
    weight: rawReport.subject?.weight || undefined,
    medications: rawReport.subject?.medications || undefined,
    setting: rawReport.subject?.setting || undefined,
    pdf_url: rawReport.subject?.pdf_url || undefined,
  };

  Object.keys(subject).forEach(key => {
    if (subject[key] === "" || subject[key] === null) {
      delete subject[key];
    }
  });

  if (!subject.name) {
    subject.name = "Anonymous";
  }

  const substances = (rawReport.substances || []).map(s => ({
    name: s.name || "Unknown",
    dose: s.dose || undefined,
    roa: s.roa || undefined,
  }));

  const transformTimeline = (entries) => {
    if (!Array.isArray(entries)) return [];
    return entries.map(e => ({
      time: e.time || undefined,
      description: e.description || "",
    })).filter(e => e.description.trim().length > 0);
  };

  return {
    slug: rawReport.slug || rawReport.title?.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") || "untitled",
    title: rawReport.title || "Untitled Report",
    featured: rawReport.featured === true,
    subject,
    substances,
    introduction: rawReport.introduction || undefined,
    onset: transformTimeline(rawReport.onset),
    peak: transformTimeline(rawReport.peak),
    offset: transformTimeline(rawReport.offset),
    conclusion: rawReport.conclusion || undefined,
    tags: Array.isArray(rawReport.tags) ? rawReport.tags : [],
  };
}

async function main() {
  console.log("🚀 Trip Reports Migration Script\n");

  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const reportsPath = args.find((arg) => !arg.startsWith("--")) || DEFAULT_REPORTS_PATH;
  const runContext = createDataOpsRunContext({
    operation: "migrate trip reports",
    intent: "trip-report-migration",
    sourceUrlKeys: [],
    localArtifacts: [reportsPath],
  });
  
  if (!existsSync(reportsPath)) {
    console.error(`❌ Reports file not found: ${reportsPath}`);
    console.error("\nUsage: node scripts/migrate-trip-reports.mjs [path-to-reports.json]");
    console.error("\nExample:");
    console.error("  node scripts/migrate-trip-reports.mjs ../EffectIndex-master/effectindex_dump/reports.json");
    process.exit(1);
  }

  console.log(`📄 Reading reports from: ${reportsPath}`);

  let rawReports;
  try {
    const content = readFileSync(reportsPath, "utf-8");
    rawReports = JSON.parse(content);
  } catch (error) {
    console.error(`❌ Failed to parse reports file: ${error.message}`);
    process.exit(1);
  }

  console.log(`📊 Found ${rawReports.length} reports in source file\n`);

  const publishedReports = rawReports.filter(r => !r.unpublished);
  console.log(`📋 ${publishedReports.length} published reports (${rawReports.length - publishedReports.length} unpublished filtered out)`);

  console.log("🔄 Transforming reports to new schema...");
  const transformedReports = publishedReports.map(transformReport);

  const featuredCount = transformedReports.filter(r => r.featured).length;
  console.log(`⭐ ${featuredCount} featured reports\n`);

  const substances = new Set();
  const authors = new Set();
  for (const report of transformedReports) {
    for (const s of report.substances) {
      substances.add(s.name);
    }
    authors.add(report.subject.name);
  }
  console.log(`🧪 ${substances.size} unique substances`);
  console.log(`👤 ${authors.size} unique authors\n`);

  printDataOpsRunContext(runContext);

  let dataUrl;
  try {
    dataUrl = requireTargetUrl(runContext);
  } catch (error) {
    console.error(`❌ ${error.message}`);
    process.exit(1);
  }

  if (dryRun) {
    console.log("\nDry run only. No Postgres writes performed.");
    process.exit(0);
  }

  try {
    assertDataOpsWriteAllowed(runContext);
  } catch (error) {
    console.error(`❌ ${error.message}`);
    process.exit(1);
  }

  console.log(`🔗 Connecting to Postgres: ${postgresFingerprintFromUrl(dataUrl)}`);
  const client = createDataClient({ target: dataUrl }).client;

  const { path: auditLogPath } = writeAuditLog({
    operation: "migrate-trip-reports",
    intent: "trip-report-migration",
    mutations: [{ action: "bulk-import", count: transformedReports.length }],
  });
  console.log(`Audit log: ${auditLogPath}`);

  console.log(`\n📤 Importing ${transformedReports.length} reports in batches of ${BATCH_SIZE}...\n`);

  const totalBatches = Math.ceil(transformedReports.length / BATCH_SIZE);

  const result = await batchAndApplyMutations({
    items: transformedReports,
    batchSize: BATCH_SIZE,
    mutation: api.tripReports.bulkImport,
    transformBatch: (batch) => ({ reports: batch }),
    onBatchResult: (batchResult, batchIndex) => {
      console.log(`  Batch ${batchIndex + 1}/${totalBatches}: ✓ (created: ${batchResult.created}, updated: ${batchResult.updated})`);
    },
    onBatchError: (error, batchIndex) => {
      console.log(`  Batch ${batchIndex + 1}/${totalBatches}: ✗ Error: ${error.message}`);
    },
    client,
    runContext,
  });

  updateAuditLog(auditLogPath, {
    result: {
      totalCreated: result.totalCreated,
      totalUpdated: result.totalUpdated,
      errorCount: result.allErrors.length,
    },
    status: result.failed ? "completed_with_errors" : "completed",
  });

  console.log("\n" + "=".repeat(50));
  console.log("📊 Migration Complete\n");
  console.log(`  ✅ Created: ${result.totalCreated}`);
  console.log(`  🔄 Updated: ${result.totalUpdated}`);

  if (result.allErrors.length > 0) {
    console.log(`  ❌ Errors: ${result.allErrors.length}`);
    console.log("\nError details:");
    for (const error of result.allErrors.slice(0, 10)) {
      console.log(`    - ${error}`);
    }
    if (result.allErrors.length > 10) {
      console.log(`    ... and ${result.allErrors.length - 10} more`);
    }
  }

  if (result.failed) {
    process.exitCode = 1;
    return;
  }
  console.log("\n✨ Done!");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
