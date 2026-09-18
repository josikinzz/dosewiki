#!/usr/bin/env node
/**
 * Migrate SubstanceIndex.json to Postgres.
 *
 * This script reads SubstanceIndex.json and uploads all substances to the Postgres database.
 *
 * Prerequisites:
 * 1. Set DATA_BACKEND=postgres and configure an explicit Postgres target
 * 2. Ensure POSTGRES_DIRECT_URL is set in your environment or .env.local
 *
 * Usage:
 *   node scripts/migrate-substance-index-to-data.mjs
 *   node scripts/migrate-substance-index-to-data.mjs --dry-run
 *
 * Whole-corpus --replace mode is retired. Use bounded per-article/CAS writes.
 */

import { readFileSync } from "fs";
import { createDataClient } from "../lib/data-client.ts";
import { api } from "../../lib/postgres/runtime/api.ts"
import {
  assertDataOpsWriteAllowed,
  createDataOpsRunContext,
  printDataOpsRunContext,
  requireAdminIntentToken,
  requireTargetUrl,
} from "../lib/data-ops-run-context.mjs";
import { assertSubstanceIndexReplaceModeRetired } from "./substance-index-migration-policy.mjs";

const SUBSTANCE_INDEX_PATH = "./src/data/SubstanceIndex.json";

// Greek letter to ASCII mapping for field name sanitization
const GREEK_TO_ASCII = {
  'α': 'alpha',
  'β': 'beta',
  'γ': 'gamma',
  'δ': 'delta',
  'ε': 'epsilon',
  'ζ': 'zeta',
  'η': 'eta',
  'θ': 'theta',
  'ι': 'iota',
  'κ': 'kappa',
  'λ': 'lambda',
  'μ': 'mu',
  'ν': 'nu',
  'ξ': 'xi',
  'ο': 'omicron',
  'π': 'pi',
  'ρ': 'rho',
  'σ': 'sigma',
  'τ': 'tau',
  'υ': 'upsilon',
  'φ': 'phi',
  'χ': 'chi',
  'ψ': 'psi',
  'ω': 'omega',
};

/**
 * Sanitize a string to only contain ASCII characters (for Postgres field names).
 * Replaces Greek letters with their ASCII names.
 */
function sanitizeFieldName(name) {
  let result = name;
  for (const [greek, ascii] of Object.entries(GREEK_TO_ASCII)) {
    result = result.replace(new RegExp(greek, 'g'), ascii);
  }
  // Replace any remaining non-ASCII with underscores
  let sanitizedName = '';
  for (let index = 0; index < result.length; index += 1) {
    sanitizedName += result.charCodeAt(index) <= 0x7F ? result[index] : '_';
  }
  return sanitizedName;
}

/**
 * Deep sanitize an object's keys to ensure they're ASCII-only.
 * Postgres doesn't allow non-ASCII characters in field names.
 */
function sanitizeObjectKeys(obj) {
  if (obj === null || obj === undefined) {
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(sanitizeObjectKeys);
  }
  
  if (typeof obj !== 'object') {
    return obj;
  }
  
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    const sanitizedKey = sanitizeFieldName(key);
    result[sanitizedKey] = sanitizeObjectKeys(value);
  }
  return result;
}

async function main() {
  try {
    assertSubstanceIndexReplaceModeRetired();
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exitCode = 1;
    return;
  }

  const isDryRun = process.argv.includes("--dry-run");
  const runContext = createDataOpsRunContext({
    operation: "migrate SubstanceIndex.json to Postgres",
    intent: "dev-data-import",
    sourceUrlKeys: [],
    localArtifacts: ["src/data/SubstanceIndex.json"],
    confirmationFlag: "--confirm-replace",
    destructive: false,
  });
  
  let dataUrl = null;
  if (!isDryRun) {
    try {
      dataUrl = requireTargetUrl(runContext);
    } catch (error) {
      console.error(`Error: ${error.message}`);
      console.error("Set DATA_BACKEND=postgres and TARGET_POSTGRES_URL before writing.");
      process.exit(1);
    }
  }

  console.log("Reading SubstanceIndex.json...\n");
  printDataOpsRunContext(runContext);
  
  const articlesContent = readFileSync(SUBSTANCE_INDEX_PATH, "utf-8");
  const articles = JSON.parse(articlesContent);
  
  console.log(`Found ${articles.length} articles.`);
  console.log(`Total size: ${(articlesContent.length / 1024 / 1024).toFixed(2)} MB`);
  
  // Sanitize all article keys for Postgres compatibility
  console.log("Sanitizing field names for Postgres compatibility...");
  const sanitizedArticles = articles.map(sanitizeObjectKeys);

  if (isDryRun) {
    console.log("\n[DRY RUN] Would import the following articles:");
    
    const byPriority = sanitizedArticles.reduce((acc, a) => {
      const p = a.priority || "normal";
      acc[p] = (acc[p] || 0) + 1;
      return acc;
    }, {});
    
    console.log("\nBy priority:");
    for (const [priority, count] of Object.entries(byPriority)) {
      console.log(`  ${priority}: ${count}`);
    }
    
    console.log("\nSample articles:");
    sanitizedArticles.slice(0, 10).forEach((a) => {
      const hasId = a.id !== null ? `id: ${a.id}` : "no id";
      console.log(`  - ${a.title} (${hasId}, ${a.priority || "normal"})`);
    });
    
    if (sanitizedArticles.length > 10) {
      console.log(`  ... and ${sanitizedArticles.length - 10} more`);
    }
    
    console.log("\nRun without --dry-run to perform the actual import.");
    return;
  }

  // Create Postgres client
  const client = createDataClient({ target: dataUrl }).client;

  try {
    assertDataOpsWriteAllowed(runContext);
  } catch (error) {
    console.error(`\nError: ${error.message}`);
    process.exit(1);
  }

  console.log("\nImporting articles to Postgres (upsert mode)...");
  console.log("Existing articles with matching IDs will be updated.\n");

  // Import in batches to avoid timeout
  const BATCH_SIZE = 50;
  let totalCreated = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;
  let totalErrors = [];
  const adminKey = requireAdminIntentToken("editorArticleWrite").token;

  for (let i = 0; i < sanitizedArticles.length; i += BATCH_SIZE) {
    const batch = sanitizedArticles.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(sanitizedArticles.length / BATCH_SIZE);

    process.stdout.write(`  Batch ${batchNum}/${totalBatches} (${batch.length} articles)... `);
    
    try {
      const result = await client.mutation(api.substanceIndex.saveSubstances, {
        apiKey: adminKey,
        articles: batch,
      });
      
      totalCreated += result.created;
      totalUpdated += result.updated;
      totalSkipped += result.skipped || 0;
      
      if (result.errors && result.errors.length > 0) {
        totalErrors.push(...result.errors);
        const skippedText = result.skipped ? `, ${result.skipped} skipped` : "";
        console.log(`done (${result.created} created, ${result.updated} updated${skippedText}, ${result.errors.length} errors)`);
      } else {
        const skippedText = result.skipped ? `, ${result.skipped} skipped` : "";
        console.log(`done (${result.created} created, ${result.updated} updated${skippedText})`);
      }
    } catch (error) {
      console.log(`error: ${error.message}`);
      totalErrors.push(`Batch ${batchNum}: ${error.message}`);
    }
  }

  console.log("\nImport complete!");
  console.log(`  Created: ${totalCreated}`);
  console.log(`  Updated: ${totalUpdated}`);
  if (totalSkipped > 0) {
    console.log(`  Skipped: ${totalSkipped}`);
  }
  if (totalErrors.length > 0) {
    console.log(`  Errors: ${totalErrors.length}`);
    totalErrors.slice(0, 10).forEach((e) => console.log(`    - ${e}`));
    if (totalErrors.length > 10) {
      console.log(`    ... and ${totalErrors.length - 10} more`);
    }
  }
}

main();
