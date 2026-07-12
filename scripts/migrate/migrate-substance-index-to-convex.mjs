#!/usr/bin/env node
/**
 * Migrate SubstanceIndex.json to Convex.
 *
 * This script reads SubstanceIndex.json and uploads all substances to the Convex database.
 *
 * Prerequisites:
 * 1. Run `bunx convex dev` to set up the Convex project and generate types
 * 2. Ensure CONVEX_URL is set in your environment or .env.local
 *
 * Usage:
 *   node scripts/migrate-substance-index-to-convex.mjs
 *   node scripts/migrate-substance-index-to-convex.mjs --dry-run
 *   node scripts/migrate-substance-index-to-convex.mjs --replace --confirm-replace
 */

import { readFileSync } from "fs";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api.js";
import {
  assertDataOpsWriteAllowed,
  createDataOpsRunContext,
  printDataOpsRunContext,
  requireAdminIntentToken,
  requireTargetUrl,
} from "../lib/data-ops-run-context.mjs";

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
 * Sanitize a string to only contain ASCII characters (for Convex field names).
 * Replaces Greek letters with their ASCII names.
 */
function sanitizeFieldName(name) {
  let result = name;
  for (const [greek, ascii] of Object.entries(GREEK_TO_ASCII)) {
    result = result.replace(new RegExp(greek, 'g'), ascii);
  }
  // Replace any remaining non-ASCII with underscores
  return result.replace(/[^\x00-\x7F]/g, '_');
}

/**
 * Deep sanitize an object's keys to ensure they're ASCII-only.
 * Convex doesn't allow non-ASCII characters in field names.
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
  const isDryRun = process.argv.includes("--dry-run");
  const isReplace = process.argv.includes("--replace");
  const runContext = createDataOpsRunContext({
    operation: "migrate SubstanceIndex.json to Convex",
    intent: isReplace ? "replace-all-convex-import" : "dev-convex-import",
    sourceUrlKeys: [],
    localArtifacts: ["src/data/SubstanceIndex.json"],
    confirmationFlag: "--confirm-replace",
    destructive: isReplace,
  });
  
  let convexUrl = null;
  if (!isDryRun) {
    try {
      convexUrl = requireTargetUrl(runContext);
    } catch (error) {
      console.error(`Error: ${error.message}`);
      console.error("Run 'bunx convex dev' first to set up your Convex project.");
      process.exit(1);
    }
  }

  console.log("Reading SubstanceIndex.json...\n");
  printDataOpsRunContext(runContext);
  
  const articlesContent = readFileSync(SUBSTANCE_INDEX_PATH, "utf-8");
  const articles = JSON.parse(articlesContent);
  
  console.log(`Found ${articles.length} articles.`);
  console.log(`Total size: ${(articlesContent.length / 1024 / 1024).toFixed(2)} MB`);
  
  // Sanitize all article keys for Convex compatibility
  console.log("Sanitizing field names for Convex compatibility...");
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
    console.log("Use --replace to delete all existing articles first (destructive).");
    return;
  }

  // Create Convex client
  const client = new ConvexHttpClient(convexUrl);

  if (isReplace) {
    try {
      assertDataOpsWriteAllowed(runContext);
    } catch (error) {
      console.error(`\nError: ${error.message}`);
      process.exit(1);
    }

    console.log("\n[REPLACE MODE] Replacing all articles in Convex...");
    console.log("This will DELETE all existing articles first.");
    
    try {
      const result = await client.mutation(api.substanceIndex.replaceAllSubstances, {
        articles: sanitizedArticles,
      });
      
      console.log(`\nReplace complete!`);
      console.log(`  Deleted: ${result.deleted}`);
      console.log(`  Inserted: ${result.inserted}`);
    } catch (error) {
      console.error(`\nError during replace: ${error.message}`);
      process.exit(1);
    }
  } else {
    try {
      assertDataOpsWriteAllowed(runContext);
    } catch (error) {
      console.error(`\nError: ${error.message}`);
      process.exit(1);
    }

    console.log("\nImporting articles to Convex (upsert mode)...");
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
}

main();
