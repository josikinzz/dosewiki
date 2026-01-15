#!/usr/bin/env node
/**
 * Migrate quote documents to Convex.
 * 
 * This script reads all quote files from:
 * - harmpotential-quotes/
 * - pharmacology-quotes/
 * - history-culture-quotes/
 * 
 * And uploads them to the Convex database.
 * 
 * Prerequisites:
 * 1. Run `bunx convex dev` to set up the Convex project and generate types
 * 2. Ensure CONVEX_URL is set in your environment or .env.local
 * 
 * Usage:
 *   node scripts/migrate-quotes-to-convex.mjs
 *   node scripts/migrate-quotes-to-convex.mjs --dry-run
 */

import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

const QUOTES_DIRS = [
  {
    path: "./harmpotential-quotes",
    section: "harm_potential",
    suffix: "-harmpotential.md",
  },
  {
    path: "./pharmacology-quotes",
    section: "pharmacology",
    suffix: "-pharmacology.md",
  },
  {
    path: "./history-culture-quotes",
    section: "history_culture",
    suffix: "-history-culture.md",
  },
];

// Convex has a size limit for mutations. We'll batch if needed.
const BATCH_SIZE = 50;

async function main() {
  const isDryRun = process.argv.includes("--dry-run");
  
  // Get Convex URL from environment
  const convexUrl = process.env.CONVEX_URL || process.env.VITE_CONVEX_URL;
  
  if (!convexUrl && !isDryRun) {
    console.error("Error: CONVEX_URL or VITE_CONVEX_URL environment variable is not set.");
    console.error("Run 'bunx convex dev' first to set up your Convex project.");
    process.exit(1);
  }

  console.log("Collecting quote documents...\n");

  const allQuotes = [];

  for (const { path: dirPath, section, suffix } of QUOTES_DIRS) {
    if (!existsSync(dirPath)) {
      console.log(`  ${section}: directory not found, skipping`);
      continue;
    }

    const files = readdirSync(dirPath);
    const mdFiles = files.filter((f) => f.endsWith(suffix));

    console.log(`  ${section}: ${mdFiles.length} files`);

    for (const file of mdFiles) {
      const filePath = join(dirPath, file);
      const content = readFileSync(filePath, "utf-8");
      
      // Extract slug from filename: ketamine-harmpotential.md -> ketamine
      const slug = file.replace(suffix, "");

      allQuotes.push({
        slug,
        section,
        content,
      });
    }
  }

  console.log(`\nTotal: ${allQuotes.length} quote documents collected.`);

  if (isDryRun) {
    console.log("\n[DRY RUN] Would import quotes:");
    const bySectionCount = {};
    for (const q of allQuotes) {
      bySectionCount[q.section] = (bySectionCount[q.section] || 0) + 1;
    }
    for (const [section, count] of Object.entries(bySectionCount)) {
      console.log(`  - ${section}: ${count} documents`);
    }
    console.log("\nSample entries:");
    allQuotes.slice(0, 5).forEach((q) => {
      console.log(`  - ${q.slug}/${q.section}: ${q.content.length.toLocaleString()} chars`);
    });
    console.log("\nRun without --dry-run to perform the actual import.");
    return;
  }

  // Create Convex client
  const client = new ConvexHttpClient(convexUrl);

  console.log("\nImporting quotes to Convex in batches...");

  let totalCreated = 0;
  let totalUpdated = 0;
  let totalErrors = [];

  // Process in batches
  for (let i = 0; i < allQuotes.length; i += BATCH_SIZE) {
    const batch = allQuotes.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(allQuotes.length / BATCH_SIZE);

    process.stdout.write(`  Batch ${batchNum}/${totalBatches} (${batch.length} quotes)... `);

    try {
      const result = await client.mutation(api.quotes.bulkImport, {
        quotes: batch,
        updatedBy: "migration-script",
      });

      totalCreated += result.created;
      totalUpdated += result.updated;
      totalErrors = totalErrors.concat(result.errors);

      console.log(`created: ${result.created}, updated: ${result.updated}`);
    } catch (error) {
      console.log(`error: ${error.message}`);
      totalErrors.push(`Batch ${batchNum}: ${error.message}`);
    }
  }

  console.log("\nImport complete!");
  console.log(`  Created: ${totalCreated}`);
  console.log(`  Updated: ${totalUpdated}`);
  if (totalErrors.length > 0) {
    console.log(`  Errors: ${totalErrors.length}`);
    totalErrors.slice(0, 10).forEach((e) => console.log(`    - ${e}`));
    if (totalErrors.length > 10) {
      console.log(`    ... and ${totalErrors.length - 10} more`);
    }
  }
}

main();
