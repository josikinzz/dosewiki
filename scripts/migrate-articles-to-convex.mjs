#!/usr/bin/env node
/**
 * Migrate articles.json to Convex.
 * 
 * This script reads articles.json and uploads all articles to the Convex database.
 * 
 * Prerequisites:
 * 1. Run `bunx convex dev` to set up the Convex project and generate types
 * 2. Ensure CONVEX_URL is set in your environment or .env.local
 * 
 * Usage:
 *   node scripts/migrate-articles-to-convex.mjs
 *   node scripts/migrate-articles-to-convex.mjs --dry-run
 *   node scripts/migrate-articles-to-convex.mjs --replace  # Replace all articles (destructive)
 */

import { readFileSync } from "fs";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

const ARTICLES_PATH = "./src/data/articles.json";

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

// Load .env.local if it exists
async function loadEnv() {
  try {
    const envContent = readFileSync(".env.local", "utf-8");
    for (const line of envContent.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      
      const eqIndex = trimmed.indexOf("=");
      if (eqIndex === -1) continue;
      
      const key = trimmed.slice(0, eqIndex).trim();
      let value = trimmed.slice(eqIndex + 1).trim();
      
      // Remove surrounding quotes if present
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch (e) {
    // .env.local doesn't exist, that's fine
  }
}

async function main() {
  await loadEnv();
  
  const isDryRun = process.argv.includes("--dry-run");
  const isReplace = process.argv.includes("--replace");
  
  // Get Convex URL from environment
  const convexUrl = process.env.CONVEX_URL || process.env.VITE_CONVEX_URL;
  
  if (!convexUrl && !isDryRun) {
    console.error("Error: CONVEX_URL or VITE_CONVEX_URL environment variable is not set.");
    console.error("Run 'bunx convex dev' first to set up your Convex project.");
    process.exit(1);
  }

  console.log("Reading articles.json...\n");
  
  const articlesContent = readFileSync(ARTICLES_PATH, "utf-8");
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
    console.log("\n[REPLACE MODE] Replacing all articles in Convex...");
    console.log("This will DELETE all existing articles first.");
    
    try {
      const result = await client.mutation(api.articles.replaceAllArticles, {
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
    console.log("\nImporting articles to Convex (upsert mode)...");
    console.log("Existing articles with matching IDs will be updated.\n");
    
    // Import in batches to avoid timeout
    const BATCH_SIZE = 50;
    let totalCreated = 0;
    let totalUpdated = 0;
    let totalErrors = [];
    
    for (let i = 0; i < sanitizedArticles.length; i += BATCH_SIZE) {
      const batch = sanitizedArticles.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(sanitizedArticles.length / BATCH_SIZE);
      
      process.stdout.write(`  Batch ${batchNum}/${totalBatches} (${batch.length} articles)... `);
      
      try {
        const result = await client.mutation(api.articles.saveArticles, {
          articles: batch,
        });
        
        totalCreated += result.created;
        totalUpdated += result.updated;
        
        if (result.errors && result.errors.length > 0) {
          totalErrors.push(...result.errors);
          console.log(`done (${result.created} created, ${result.updated} updated, ${result.errors.length} errors)`);
        } else {
          console.log(`done (${result.created} created, ${result.updated} updated)`);
        }
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
}

main();
