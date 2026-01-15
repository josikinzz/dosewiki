#!/usr/bin/env node
/**
 * Copy trip reports from one Convex deployment to another.
 *
 * Usage:
 *   SOURCE_CONVEX_URL=https://dev.convex.cloud \
 *   TARGET_CONVEX_URL=https://prod.convex.cloud \
 *   node scripts/migrate-trip-reports-between-deployments.mjs
 */

import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

const sourceUrl = process.env.SOURCE_CONVEX_URL;
const targetUrl = process.env.TARGET_CONVEX_URL;

if (!sourceUrl || !targetUrl) {
  console.error("❌ Missing SOURCE_CONVEX_URL or TARGET_CONVEX_URL");
  process.exit(1);
}

const sourceClient = new ConvexHttpClient(sourceUrl);
const targetClient = new ConvexHttpClient(targetUrl);

const BATCH_SIZE = 10;

async function main() {
  console.log("🚚 Copying trip reports between Convex deployments");
  console.log(`Source: ${sourceUrl}`);
  console.log(`Target: ${targetUrl}`);

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
