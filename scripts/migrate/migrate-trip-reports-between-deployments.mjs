#!/usr/bin/env node
/**
 * Copy trip reports from one Postgres deployment to another.
 *
 * Usage:
 *   SOURCE_POSTGRES_URL=postgresql://localhost/dosewiki \
 *   TARGET_POSTGRES_URL=postgresql://localhost/dosewiki \
 *   node scripts/migrate-trip-reports-between-deployments.mjs --confirm-cross-deployment-copy
 */

import { createDataClient } from "../lib/data-client.ts";
import { api } from "../../lib/postgres/runtime/api.ts"
import {
  assertDataOpsWriteAllowed,
  createDataOpsRunContext,
  printDataOpsRunContext,
  requireSourceUrl,
  requireTargetUrl,
} from "../lib/data-ops-run-context.mjs";

const runContext = createDataOpsRunContext({
  operation: "copy trip reports between Postgres deployments",
  intent: "cross-deployment-copy",
  sourceUrlKeys: ["SOURCE_POSTGRES_URL"],
  targetUrlKeys: ["TARGET_POSTGRES_URL"],
  selectedTables: ["tripReports"],
  confirmationFlag: "--confirm-cross-deployment-copy",
  destructive: true,
});

let sourceUrl;
let targetUrl;
try {
  sourceUrl = requireSourceUrl(runContext, "source Postgres URL");
  targetUrl = requireTargetUrl(runContext, "target Postgres URL");
  assertDataOpsWriteAllowed(runContext);
} catch (error) {
  console.error(`❌ ${error.message}`);
  process.exit(1);
}

const sourceClient = createDataClient({ target: sourceUrl }).client;
const targetClient = createDataClient({ target: targetUrl }).client;

const BATCH_SIZE = 10;

async function main() {
  console.log("🚚 Copying trip reports between Postgres deployments");
  printDataOpsRunContext(runContext);

  const reports = await sourceClient.query(api.tripReports.getAll, {});
  const sanitizedReports = reports.map(({ _id, _creationTime, ...report }) => report);
  console.log(`Found ${sanitizedReports.length} reports in source`);

  if (sanitizedReports.length === 0) {
    console.log("No reports to migrate. Exiting.");
    return;
  }

  let totalCreated = 0;
  let totalUpdated = 0;
  const allErrors = [];

  for (let i = 0; i < sanitizedReports.length; i += BATCH_SIZE) {
    const batch = sanitizedReports.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(sanitizedReports.length / BATCH_SIZE);

    process.stdout.write(`  Batch ${batchNum}/${totalBatches}: ${batch.length} reports... `);

    try {
      const result = await targetClient.mutation(api.tripReports.bulkImport, { reports: batch });
      totalCreated += result.created;
      totalUpdated += result.updated;
      allErrors.push(...result.errors);
      console.log(`✓ (created: ${result.created}, updated: ${result.updated})`);
    } catch (error) {
      console.log(`✗ Error: ${error instanceof Error ? error.message : String(error)}`);
      allErrors.push(`Batch ${batchNum}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  console.log("\n" + "=".repeat(50));
  console.log("📊 Migration Complete\n");
  console.log(`  ✅ Created: ${totalCreated}`);
  console.log(`  🔄 Updated: ${totalUpdated}`);
  if (allErrors.length > 0) {
    console.log(`  ❌ Errors: ${allErrors.length}`);
  } else {
    console.log("  🎉 No errors");
  }
}

main().catch((error) => {
  console.error("❌ Migration failed:", error);
  process.exit(1);
});
