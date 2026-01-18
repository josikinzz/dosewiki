#!/usr/bin/env node
/**
 * Export articles from Convex to articles.json
 *
 * This script fetches all articles from the Convex database and writes them
 * to src/data/articles.json. Run this before building for production to ensure
 * the static file has the latest data from Convex.
 *
 * Usage:
 *   node scripts/export-convex-to-json.mjs
 *
 * After running:
 *   node scripts/build/buildCompressedArticles.mjs
 *   git add . && git commit -m "Sync articles from Convex" && git push
 */

import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";
import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

// Load .env.local for Convex URL
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
    // .env.local not found
  }
}

loadEnvLocal();

const convexUrl = process.env.VITE_CONVEX_URL;

if (!convexUrl) {
  console.error("❌ Missing VITE_CONVEX_URL in environment or .env.local");
  process.exit(1);
}

async function main() {
  console.log("📥 Exporting articles from Convex to articles.json\n");
  console.log(`Convex URL: ${convexUrl}\n`);

  const client = new ConvexHttpClient(convexUrl);

  // Fetch all articles from Convex
  console.log("Fetching articles from Convex...");
  const articles = await client.query(api.articles.getAll, {});

  if (!articles || articles.length === 0) {
    console.error("❌ No articles found in Convex database");
    console.error("   The Convex articles table may be empty.");
    console.error("   Make sure articles have been synced to Convex first.");
    process.exit(1);
  }

  console.log(`Found ${articles.length} articles in Convex\n`);

  // Remove Convex internal fields (_id, _creationTime)
  const cleanedArticles = articles.map(({ _id, _creationTime, ...article }) => article);

  // Sort by id for consistent ordering
  cleanedArticles.sort((a, b) => {
    if (a.id === null && b.id === null) return 0;
    if (a.id === null) return 1;
    if (b.id === null) return -1;
    return a.id - b.id;
  });

  // Write to articles.json
  const outputPath = resolve(process.cwd(), "src/data/articles.json");
  writeFileSync(outputPath, JSON.stringify(cleanedArticles, null, 2) + "\n");

  console.log(`✅ Exported ${cleanedArticles.length} articles to src/data/articles.json`);
  console.log("\nNext steps:");
  console.log("  1. node scripts/build/buildCompressedArticles.mjs");
  console.log("  2. git add . && git commit -m 'Sync articles from Convex'");
  console.log("  3. git push");
}

main().catch((error) => {
  console.error("❌ Export failed:", error);
  process.exit(1);
});
