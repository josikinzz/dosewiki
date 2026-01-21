#!/usr/bin/env node
/**
 * Import SubstanceIndex.json into Convex.
 *
 * This script reads the local SubstanceIndex.json file and uploads all substances
 * to the Convex database. Use this for initial data migration.
 *
 * Prerequisites:
 * 1. Run `bunx convex dev` to set up the Convex project and generate types
 * 2. Ensure CONVEX_URL is set in your environment or .env.local
 *
 * Usage:
 *   node scripts/convex-import-substance-index.mjs
 *   node scripts/convex-import-substance-index.mjs --dry-run
 */

import { readFileSync } from "fs";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api.js";

const SUBSTANCE_INDEX_PATH = "./src/data/SubstanceIndex.json";

/**
 * Greek letter replacements for Convex field name compatibility.
 * Convex only allows ASCII characters in field names.
 */
const GREEK_REPLACEMENTS = {
  'α': 'alpha',
  'β': 'beta',
  'γ': 'gamma',
  'δ': 'delta',
  'ε': 'epsilon',
  'κ': 'kappa',
  'μ': 'mu',
  'σ': 'sigma',
  'Δ': 'Delta',
};

/**
 * Sanitize object keys to be ASCII-only (Convex requirement).
 */
function sanitizeKeys(obj) {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(sanitizeKeys);
  if (typeof obj !== 'object') return obj;

  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    // Replace Greek letters in key
    let sanitizedKey = key;
    for (const [greek, ascii] of Object.entries(GREEK_REPLACEMENTS)) {
      sanitizedKey = sanitizedKey.replaceAll(greek, ascii);
    }
    // Replace any remaining non-ASCII characters with underscores
    sanitizedKey = sanitizedKey.replace(/[^\x00-\x7F]/g, '_');
    
    result[sanitizedKey] = sanitizeKeys(value);
  }
  return result;
}

async function main() {
  const isDryRun = process.argv.includes("--dry-run");
  
  // Get Convex URL from environment
  const convexUrl = process.env.CONVEX_URL || process.env.VITE_CONVEX_URL;
  
  if (!convexUrl) {
    console.error("Error: CONVEX_URL or VITE_CONVEX_URL environment variable is not set.");
    console.error("Run 'bunx convex dev' first to set up your Convex project.");
    process.exit(1);
  }

  console.log("Reading articles from:", SUBSTANCE_INDEX_PATH);
  
  // Read SubstanceIndex.json
  const articlesJson = readFileSync(SUBSTANCE_INDEX_PATH, "utf-8");
  const articles = JSON.parse(articlesJson);
  
  console.log(`Found ${articles.length} articles to import.`);

  if (isDryRun) {
    console.log("\n[DRY RUN] Would import the following articles:");
    articles.slice(0, 10).forEach((article, i) => {
      console.log(`  ${i + 1}. ${article.title} (ID: ${article.id})`);
    });
    if (articles.length > 10) {
      console.log(`  ... and ${articles.length - 10} more`);
    }
    console.log("\nRun without --dry-run to perform the actual import.");
    return;
  }

  // Create Convex client
  const client = new ConvexHttpClient(convexUrl);

  console.log("\nImporting articles to Convex...");
  console.log("This will replace ALL existing articles in the database.\n");

  try {
    // Sanitize articles to ensure all field names are ASCII-only
    const sanitizedArticles = articles.map(sanitizeKeys);
    
    // Use replaceAllSubstances to do a clean import
    const result = await client.mutation(api.substanceIndex.replaceAllSubstances, {
      articles: sanitizedArticles,
    });

    console.log("Import complete!");
    console.log(`  Deleted: ${result.deleted} existing articles`);
    console.log(`  Inserted: ${result.inserted} new articles`);
  } catch (error) {
    console.error("Error importing articles:", error);
    process.exit(1);
  }
}

main();
