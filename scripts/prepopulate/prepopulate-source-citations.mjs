#!/usr/bin/env node
/**
 * Prepopulate source_citations from article-sources
 *
 * Extracts URLs from the "*Source: URL*" line at the top of each source file,
 * adds them to source_citations, and deduplicates existing citations.
 *
 * Usage:
 *   node scripts/prepopulate/prepopulate-source-citations.mjs --input <local-substance-export.json> --dry-run
 *   node scripts/prepopulate/prepopulate-source-citations.mjs --input <local-substance-export.json>
 *   node scripts/prepopulate/prepopulate-source-citations.mjs --input <local-substance-export.json> --verbose
 *
 * The input is a local Postgres export (scripts/data-ops/export-data-to-json.mjs);
 * it is never the tracked public/SubstanceIndex.json archive.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { tryWriteArtifactLineageSidecar } from "../lib/data-artifact-lineage.mjs";
import {
  assertDataOpsWriteAllowed,
  createDataOpsRunContext,
  printDataOpsRunContext,
} from "../lib/data-ops-run-context.mjs";
import { formatStructuredCitationCompatibilityError } from "./source-citations-compat.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

// Parse CLI args
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const verbose = args.includes("--verbose");
const inputIndex = args.indexOf("--input");
if (inputIndex < 0 || !args[inputIndex + 1]) {
  throw new Error("Pass --input <path> naming the local substance export to prepopulate.");
}

// Paths
const articlesPath = path.resolve(args[inputIndex + 1]);
const articleSourcesDir = path.join(repoRoot, "src/data/article-sources");

// Load articles
const articles = JSON.parse(fs.readFileSync(articlesPath, "utf-8"));
const structuredCitationCompatibilityError = formatStructuredCitationCompatibilityError(articles);
if (structuredCitationCompatibilityError) {
  console.error(structuredCitationCompatibilityError);
  process.exit(1);
}

const runContext = createDataOpsRunContext({
  operation: "prepopulate source citations",
  intent: "local-prepopulate",
  sourceUrlKeys: [],
  targetUrlKeys: [],
  localArtifacts: [path.relative(repoRoot, articlesPath), "src/data/article-sources"],
});

// Slugify function matching article-sources file naming
import { slugify } from "../lib/slug.mjs";

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
  } catch {
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
printDataOpsRunContext(runContext);

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
  assertDataOpsWriteAllowed(runContext);
  fs.writeFileSync(articlesPath, JSON.stringify(modifiedArticles, null, 2) + "\n");
  const lineage = tryWriteArtifactLineageSidecar({
    artifactPath: articlesPath,
    rootDir: repoRoot,
    producer: "scripts/prepopulate/prepopulate-source-citations.mjs",
    sourceDeployment: "src/data/article-sources",
    schemaVersion: "src/schema/substance.schema.ts",
    extra: {
      articlesProcessed: stats.articlesProcessed,
      articlesUpdated: stats.articlesUpdated,
      sourceCitationsAdded: stats.sourceCitationsAdded,
      citationsDeduplicated: stats.citationsDeduplicated,
    },
  });
  console.log(`\n✅ Changes written to ${articlesPath}`);
  if (lineage) {
    console.log(`🧾 Lineage metadata written to ${lineage.outputPath}`);
  }
} else {
  console.log("\n⚠️  Dry run - no changes written. Remove --dry-run to apply.");
}

console.log("");
