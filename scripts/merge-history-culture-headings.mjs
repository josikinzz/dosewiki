#!/usr/bin/env node
/**
 * Merge synonymous history_culture section headings.
 *
 * This script normalizes headings that mean the same thing to a single canonical form.
 *
 * Usage:
 *   node scripts/merge-history-culture-headings.mjs --dry-run
 *   node scripts/merge-history-culture-headings.mjs
 */

import { readFileSync } from "fs";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

// Mapping of synonyms to their canonical form
// Format: { "variant": "canonical" }
const HEADING_SYNONYMS = {
  // Group 1: Research Chemical Market Emergence → "Emergence as a Research Chemical"
  "Research Chemical Market Emergence": "Emergence as a Research Chemical",
  "Emergence on the Research Chemical Market": "Emergence as a Research Chemical",
  "Emergence in the Research Chemical Market": "Emergence as a Research Chemical",
  // Note: "Reemergence as a Research Chemical" is kept separate (re-emergence implies it was there before)

  // Group 2: International Regulatory Response → "International Regulatory Response" (singular)
  "International Regulatory Responses": "International Regulatory Response",

  // Group 3: Designer Drug Emergence → "Emergence as a Designer Drug"
  "Emergence on the Designer Drug Market": "Emergence as a Designer Drug",

  // Group 4: Recreational Emergence → "Emergence as a Recreational Drug"
  "Emergence as a Recreational Substance": "Emergence as a Recreational Drug",
  "Recreational Emergence": "Emergence as a Recreational Drug",

  // Group 5: Capital Punishment → "Use in Capital Punishment"
  "Capital Punishment": "Use in Capital Punishment",
  "Use in Executions": "Use in Capital Punishment",

  // Group 6: Therapeutic Research
  "Therapeutic Investigations": "Therapeutic Research",
  "Therapeutic Exploration": "Therapeutic Research",

  // Group 7: Notable Incidents
  "Notable Incidents and Controversies": "Notable Incidents",
};

// Load .env.local if it exists
function loadEnv() {
  try {
    const envContent = readFileSync(".env.local", "utf-8");
    for (const line of envContent.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      const eqIndex = trimmed.indexOf("=");
      if (eqIndex === -1) continue;

      const key = trimmed.slice(0, eqIndex).trim();
      let value = trimmed.slice(eqIndex + 1).trim();

      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }

      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch (e) {
    // .env.local doesn't exist
  }
}

async function main() {
  loadEnv();

  const isDryRun = process.argv.includes("--dry-run");
  const convexUrl = process.env.CONVEX_URL || process.env.VITE_CONVEX_URL;

  if (!convexUrl) {
    console.error("Error: CONVEX_URL or VITE_CONVEX_URL environment variable is not set.");
    process.exit(1);
  }

  const client = new ConvexHttpClient(convexUrl);

  console.log("Fetching all articles from Convex...\n");
  const articles = await client.query(api.articles.getAll);
  console.log(`Found ${articles.length} articles.\n`);

  // Track changes
  const changes = [];
  const updatedArticles = [];

  for (const article of articles) {
    if (!article.history_culture?.sections?.length) continue;

    let articleModified = false;
    const articleChanges = [];

    for (const section of article.history_culture.sections) {
      const oldHeading = section.heading;
      const newHeading = HEADING_SYNONYMS[oldHeading];

      if (newHeading) {
        articleChanges.push({
          from: oldHeading,
          to: newHeading,
        });
        section.heading = newHeading;
        articleModified = true;
      }

      // Also check subsections
      if (section.subsections?.length) {
        for (const subsection of section.subsections) {
          const oldSubHeading = subsection.heading;
          const newSubHeading = HEADING_SYNONYMS[oldSubHeading];

          if (newSubHeading) {
            articleChanges.push({
              from: oldSubHeading,
              to: newSubHeading,
              isSubsection: true,
            });
            subsection.heading = newSubHeading;
            articleModified = true;
          }
        }
      }
    }

    if (articleModified) {
      changes.push({
        title: article.title,
        changes: articleChanges,
      });
      updatedArticles.push(article);
    }
  }

  // Report changes
  console.log("=== Changes to be made ===\n");

  if (changes.length === 0) {
    console.log("No heading changes needed.");
    return;
  }

  for (const { title, changes: articleChanges } of changes) {
    console.log(`${title}:`);
    for (const change of articleChanges) {
      const prefix = change.isSubsection ? "  (subsection) " : "  ";
      console.log(`${prefix}"${change.from}" → "${change.to}"`);
    }
  }

  console.log(`\nTotal: ${changes.length} articles, ${changes.reduce((acc, c) => acc + c.changes.length, 0)} heading changes`);

  if (isDryRun) {
    console.log("\n[DRY RUN] No changes made. Run without --dry-run to apply.");
    return;
  }

  // Apply changes
  console.log("\nApplying changes to Convex...");

  const BATCH_SIZE = 50;
  let totalUpdated = 0;

  for (let i = 0; i < updatedArticles.length; i += BATCH_SIZE) {
    const batch = updatedArticles.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(updatedArticles.length / BATCH_SIZE);

    process.stdout.write(`  Batch ${batchNum}/${totalBatches}... `);

    try {
      const result = await client.mutation(api.articles.saveArticles, {
        articles: batch,
      });
      totalUpdated += result.updated;
      console.log(`done (${result.updated} updated)`);
    } catch (error) {
      console.log(`error: ${error.message}`);
    }
  }

  console.log(`\nComplete! Updated ${totalUpdated} articles.`);
}

main();
