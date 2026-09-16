#!/usr/bin/env node
/**
 * Migration script for trip reports from EffectIndex.
 * 
 * Usage:
 *   node scripts/migrate-trip-reports.mjs [path-to-reports.json] [--dry-run]
 * 
 * If no path is provided, defaults to looking for reports.json in the current directory.
 * 
 * Prerequisites:
 *   - Postgres deployment must be running
 *   - TARGET_POSTGRES_URL, POSTGRES_DIRECT_URL, or POSTGRES_POOLED_URL must be set (or use .env.local)
 */

import { readFileSync, existsSync } from "fs";
import { createDataClient, postgresFingerprintFromUrl } from "../lib/data-client.ts";
import { api } from "../../lib/postgres/runtime/api.ts"
import { assertDataOpsWriteAllowed,
batchAndApplyMutations,
createDataOpsRunContext,
printDataOpsRunContext,
requireTargetUrl,  } from "../lib/data-ops-run-context.mjs"; import { writeAuditLog, updateAuditLog } from "../lib/data-ops-audit.mjs"

// Configuration
const DEFAULT_REPORTS_PATH = "./reports.json";
const BATCH_SIZE = 50; // Postgres mutation size limit considerations

/**
 * Transform a MongoDB-style report to our clean schema.
 */
function transformReport(rawReport) {
  // Extract subject fields, handling empty strings as undefined
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

  // Clean up subject - remove empty string values
  Object.keys(subject).forEach(key => {
    if (subject[key] === "" || subject[key] === null) {
      delete subject[key];
    }
  });

  // Ensure name is always present
  if (!subject.name) {
    subject.name = "Anonymous";
  }

  // Transform substances - strip MongoDB _id
  const substances = (rawReport.substances || []).map(s => ({
    name: s.name || "Unknown",
    dose: s.dose || undefined,
    roa: s.roa || undefined,
  }));

  // Transform timeline entries - strip MongoDB _id
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

  // Get reports file path from args or use default
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
  
  // Load and parse reports
  let rawReports;
  try {
    const content = readFileSync(reportsPath, "utf-8");
    rawReports = JSON.parse(content);
  } catch (error) {
    console.error(`❌ Failed to parse reports file: ${error.message}`);
    process.exit(1);
  }

  console.log(`📊 Found ${rawReports.length} reports in source file\n`);

  // Filter out unpublished reports
  const publishedReports = rawReports.filter(r => !r.unpublished);
  console.log(`📋 ${publishedReports.length} published reports (${rawReports.length - publishedReports.length} unpublished filtered out)`);

  // Transform reports
  console.log("🔄 Transforming reports to new schema...");
  const transformedReports = publishedReports.map(transformReport);

  // Count featured
  const featuredCount = transformedReports.filter(r => r.featured).length;
  console.log(`⭐ ${featuredCount} featured reports\n`);

  // Get unique substances and authors for summary
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

  // Initialize Postgres client
  console.log(`🔗 Connecting to Postgres: ${postgresFingerprintFromUrl(dataUrl)}`);
  const client = createDataClient({ target: dataUrl }).client;

  // Write audit log before making changes
  const { path: auditLogPath } = writeAuditLog({
    operation: "migrate-trip-reports",
    intent: "trip-report-migration",
    mutations: [{ action: "bulk-import", count: transformedReports.length }],
  });
  console.log(`Audit log: ${auditLogPath}`);

  // Import in batches using shared batch helper
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

  // Update audit log with results
  updateAuditLog(auditLogPath, {
    result: {
      totalCreated: result.totalCreated,
      totalUpdated: result.totalUpdated,
      errorCount: result.allErrors.length,
    },
    status: result.failed ? "completed_with_errors" : "completed",
  });

  // Summary
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

  console.log("\n✨ Done!");
}

main().catch(console.error);
