#!/usr/bin/env node
/**
 * Prepopulate source_citations from article-sources
 *
 * Extracts URLs from the "*Source: URL*" line at the top of each source file,
 * adds them to source_citations, and deduplicates existing citations.
 *
 * Usage:
 *   node scripts/prepopulate-source-citations.mjs --dry-run     # Preview changes
 *   node scripts/prepopulate-source-citations.mjs               # Apply changes
 *   node scripts/prepopulate-source-citations.mjs --verbose     # Show details
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// Paths
const articlesPath = path.join(ROOT, "src/data/SubstanceIndex.json");
const articleSourcesDir = path.join(ROOT, "src/data/article-sources");

// Load articles
const articles = JSON.parse(fs.readFileSync(articlesPath, "utf-8"));

// Parse CLI args
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const verbose = args.includes("--verbose");

// Slugify function matching article-sources file naming
function slugify(str) {
  return str.toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// Source display names for citations
const SOURCE_DISPLAY_NAMES = {
  "disregardeverythingisay": "Disregard Everything I Say",
  "drugbank": "DrugBank",
  "drugusersbible": "Drug Users Bible",
  "erowid": "Erowid",
  "isomerdesign": "Isomer Design (TiHKAL/PiHKAL)",
  "psychonautwiki": "PsychonautWiki",
  "saferparty": "Safer Party",
  "thedrugclassroom": "The Drug Classroom",
  "tripsit-factsheets": "TripSit Factsheets",
  "tripsit-wiki": "TripSit Wiki",
  "wikipedia": "Wikipedia",
};

// Extract source URL from content
// Format: *Source: https://example.com/...*
function extractSourceUrl(content) {
  const match = content.match(/\*Source:\s*(https?:\/\/[^\s*]+)\*/);
  return match ? match[1] : null;
}

// Check if URL matches (for deduplication)
function normalizeUrl(url) {
  if (!url) return "";
  return url.toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/+$/, "");
}

// Stats tracking
const stats = {
  articlesProcessed: 0,
  articlesUpdated: 0,
  articlesSkipped: 0,
  sourcesMissing: 0,
  sourceCitationsAdded: 0,
  citationsDeduplicated: 0,
  drugUsersBibleCount: 0,
  bySource: {},
};

// Process each article
const modifiedArticles = articles.map(article => {
  stats.articlesProcessed++;

  const slug = slugify(article.title);
  const sourceFilePath = path.join(articleSourcesDir, `${slug}.ts`);

  // Check if source file exists
  if (!fs.existsSync(sourceFilePath)) {
    stats.articlesSkipped++;
    if (verbose) {
      console.log(`  SKIP: ${article.title} (no source file)`);
    }
    return article;
  }

  // Read and parse the TypeScript source file
  const sourceContent = fs.readFileSync(sourceFilePath, "utf-8");

  // Extract sources array using regex (since we can't import TS directly)
  // Format: export const sources = [{...}];
  const sourcesMatch = sourceContent.match(/export const sources = (\[[\s\S]*?\]);/);
  if (!sourcesMatch) {
    stats.articlesSkipped++;
    if (verbose) {
      console.log(`  SKIP: ${article.title} (no sources array found)`);
    }
    return article;
  }

  let sourcesArray;
  try {
    sourcesArray = JSON.parse(sourcesMatch[1]);
  } catch (e) {
    stats.articlesSkipped++;
    if (verbose) {
      console.log(`  SKIP: ${article.title} (failed to parse sources)`);
    }
    return article;
  }

  // Build source citations
  const newSourceCitations = [];
  const sourceUrls = new Set();

  for (const source of sourcesArray) {
    const sourceId = source.id;
    const displayName = SOURCE_DISPLAY_NAMES[sourceId] || source.displayName;

    // Find the content for this source using a more flexible pattern
    // Look for "sourceId": ` followed by content until closing backtick
    // Need to handle template literals with backticks inside
    const contentStartRegex = new RegExp(`"${sourceId}":\\s*\``, "m");
    const startMatch = sourceContent.match(contentStartRegex);

    if (!startMatch) {
      stats.sourcesMissing++;
      continue;
    }

    // Find the start position and extract until we find the closing pattern
    const startPos = startMatch.index + startMatch[0].length;

    // Look for the first few lines of content to extract the source URL
    // We just need the beginning of the content where the source URL is
    const contentPreview = sourceContent.substring(startPos, startPos + 500);
    const url = extractSourceUrl(contentPreview);

    // Track by source type
    stats.bySource[sourceId] = (stats.bySource[sourceId] || 0) + 1;

    if (url) {
      // Has URL - add as linked citation
      newSourceCitations.push({
        name: displayName,
        url: url,
      });
      sourceUrls.add(normalizeUrl(url));
      stats.sourceCitationsAdded++;
    } else if (sourceId === "drugusersbible") {
      // Drug Users Bible - add as text-only (no URL)
      newSourceCitations.push({
        name: "Drug Users Bible by Dominic Milton Trott",
        url: "",
      });
      stats.drugUsersBibleCount++;
      stats.sourceCitationsAdded++;
    }
    // Skip other sources without URLs
  }

  if (newSourceCitations.length === 0) {
    stats.articlesSkipped++;
    if (verbose) {
      console.log(`  SKIP: ${article.title} (no source URLs extracted)`);
    }
    return article;
  }

  // Deduplicate existing citations
  const existingCitations = article.citations || [];
  const deduplicatedCitations = existingCitations.filter(citation => {
    const citationUrl = normalizeUrl(citation.url);
    if (citationUrl && sourceUrls.has(citationUrl)) {
      stats.citationsDeduplicated++;
      if (verbose) {
        console.log(`    Deduplicated: ${citation.name} (${citation.url})`);
      }
      return false;
    }
    return true;
  });

  stats.articlesUpdated++;

  if (verbose) {
    console.log(`  ${article.title}: ${newSourceCitations.length} sources, ${deduplicatedCitations.length} further reading`);
  }

  return {
    ...article,
    source_citations: newSourceCitations,
    citations: deduplicatedCitations,
  };
});

// Output summary
console.log("\n" + "=".repeat(60));
console.log("SOURCE CITATIONS PREPOPULATION");
console.log("=".repeat(60));
console.log(`\nMode: ${dryRun ? "DRY RUN (no changes written)" : "APPLY CHANGES"}`);

console.log(`\n--- Articles ---`);
console.log(`  Total processed:     ${stats.articlesProcessed}`);
console.log(`  Updated:             ${stats.articlesUpdated}`);
console.log(`  Skipped:             ${stats.articlesSkipped}`);

console.log(`\n--- Source Citations ---`);
console.log(`  Total added:         ${stats.sourceCitationsAdded}`);
console.log(`  Drug Users Bible:    ${stats.drugUsersBibleCount}`);

console.log(`\n--- Deduplication ---`);
console.log(`  Citations removed:   ${stats.citationsDeduplicated}`);

console.log(`\n--- By Source Type ---`);
const sortedSources = Object.entries(stats.bySource).sort((a, b) => b[1] - a[1]);
for (const [source, count] of sortedSources) {
  console.log(`  ${SOURCE_DISPLAY_NAMES[source] || source}: ${count}`);
}

// Write if not dry run
if (!dryRun) {
  fs.writeFileSync(articlesPath, JSON.stringify(modifiedArticles, null, 2) + "\n");
  console.log(`\n✅ Changes written to ${articlesPath}`);
  console.log(`\n⚠️  Remember to run: node scripts/build/buildCompressedArticles.mjs`);
} else {
  console.log("\n⚠️  Dry run - no changes written. Remove --dry-run to apply.");
}

console.log("");
