#!/usr/bin/env node
/**
 * Sync all Convex data from development to production.
 *
 * Usage:
 *   node scripts/sync-convex-to-production.mjs
 *
 * Environment:
 *   SOURCE_CONVEX_URL - Dev deployment (defaults to .env.local VITE_CONVEX_URL)
 *   TARGET_CONVEX_URL - Prod deployment (required)
 *
 * Tables synced:
 *   - tripReports
 *   - subjectiveEffects
 *   - effectIndexArticles
 *   - replications (metadata only - file storage IDs are deployment-specific)
 */

import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";
import { readFileSync } from "fs";
import { resolve } from "path";

// Load .env.local for source URL if not provided
function loadEnvLocal() {
  try {
    const envPath = resolve(process.cwd(), ".env.local");
    const content = readFileSync(envPath, "utf-8");
    const lines = content.split("\n");
    for (const line of lines) {
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match) {
        const [, key, value] = match;
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    }
  } catch (e) {
    // .env.local not found, that's ok
  }
}

loadEnvLocal();

const sourceUrl = process.env.SOURCE_CONVEX_URL || process.env.VITE_CONVEX_URL;
const targetUrl = process.env.TARGET_CONVEX_URL;

if (!sourceUrl) {
  console.error("❌ Missing SOURCE_CONVEX_URL (or VITE_CONVEX_URL in .env.local)");
  process.exit(1);
}

if (!targetUrl) {
  console.error("❌ Missing TARGET_CONVEX_URL");
  console.error("\nUsage:");
  console.error("  TARGET_CONVEX_URL=https://your-prod.convex.cloud node scripts/sync-convex-to-production.mjs");
  process.exit(1);
}

const sourceClient = new ConvexHttpClient(sourceUrl);
const targetClient = new ConvexHttpClient(targetUrl);

const BATCH_SIZE = 20;

/**
 * Strip Convex internal fields from documents.
 */
function sanitize(docs) {
  return docs.map(({ _id, _creationTime, ...doc }) => doc);
}

/**
 * Sync a table from source to target.
 */
async function syncTable(name, getAllQuery, bulkImportMutation, options = {}) {
  console.log(`\n📦 Syncing ${name}...`);

  try {
    // Fetch all documents from source
    const docs = await sourceClient.query(getAllQuery, {});
    const sanitizedDocs = sanitize(docs);

    console.log(`   Found ${sanitizedDocs.length} documents in source`);

    if (sanitizedDocs.length === 0) {
      console.log(`   ⏭️  Skipping (no data)`);
      return { table: name, created: 0, updated: 0, errors: [] };
    }

    let totalCreated = 0;
    let totalUpdated = 0;
    const allErrors = [];

    // Import in batches
    for (let i = 0; i < sanitizedDocs.length; i += BATCH_SIZE) {
      const batch = sanitizedDocs.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(sanitizedDocs.length / BATCH_SIZE);

      process.stdout.write(`   Batch ${batchNum}/${totalBatches}: ${batch.length} docs... `);

      try {
        const result = await targetClient.mutation(bulkImportMutation, { [options.argName || name]: batch });
        totalCreated += result.created;
        totalUpdated += result.updated;
        if (result.errors) {
          allErrors.push(...result.errors);
        }
        console.log(`✓ (created: ${result.created}, updated: ${result.updated})`);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.log(`✗ Error: ${msg}`);
        allErrors.push(`Batch ${batchNum}: ${msg}`);
      }
    }

    return { table: name, created: totalCreated, updated: totalUpdated, errors: allErrors };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.log(`   ❌ Failed to fetch: ${msg}`);
    return { table: name, created: 0, updated: 0, errors: [msg] };
  }
}

async function main() {
  console.log("🚚 Syncing Convex data from development to production\n");
  console.log(`Source: ${sourceUrl}`);
  console.log(`Target: ${targetUrl}`);

  const results = [];

  // Sync tripReports
  results.push(await syncTable(
    "tripReports",
    api.tripReports.getAll,
    api.tripReports.bulkImport,
    { argName: "reports" }
  ));

  // Sync subjectiveEffects
  results.push(await syncTable(
    "subjectiveEffects",
    api.subjectiveEffects.getAll,
    api.subjectiveEffects.bulkImport,
    { argName: "effects" }
  ));

  // Sync effectIndexArticles
  results.push(await syncTable(
    "effectIndexArticles",
    api.effectIndexArticles.getAll,
    api.effectIndexArticles.bulkImport,
    { argName: "articles" }
  ));

  // Sync replications (metadata only - storage IDs won't resolve in prod)
  results.push(await syncTable(
    "replications",
    api.replications.getAll,
    api.replications.bulkImport,
    { argName: "replications" }
  ));

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("📊 Sync Complete\n");

  let totalCreated = 0;
  let totalUpdated = 0;
  let totalErrors = 0;

  for (const result of results) {
    const status = result.errors.length > 0 ? "⚠️" : "✅";
    console.log(`${status} ${result.table}: ${result.created} created, ${result.updated} updated`);
    totalCreated += result.created;
    totalUpdated += result.updated;
    totalErrors += result.errors.length;
  }

  console.log("\n" + "-".repeat(40));
  console.log(`Total: ${totalCreated} created, ${totalUpdated} updated, ${totalErrors} errors`);

  if (totalErrors > 0) {
    console.log("\n⚠️  Some errors occurred. Check output above for details.");
  } else {
    console.log("\n✨ All data synced successfully!");
  }
}

main().catch((error) => {
  console.error("❌ Sync failed:", error);
  process.exit(1);
});
