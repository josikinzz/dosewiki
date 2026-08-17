#!/usr/bin/env bun
/**
 * Prepopulate interactions from TripSit combo data with fallback to other sources
 *
 * Priority:
 * 1. TripSit combos (curated, class-based) - primary source
 * 2. parsed-sources.json (PsychonautWiki, etc.) - fallback for unmapped substances
 *
 * Deduplicates by normalizing case and applies consistent formatting.
 *
 * Usage:
 *   bun scripts/prepopulate/prepopulate-interactions-tripsit.mjs --dry-run     # Preview changes
 *   bun scripts/prepopulate/prepopulate-interactions-tripsit.mjs               # Apply changes
 *   bun scripts/prepopulate/prepopulate-interactions-tripsit.mjs --verbose     # Show details
 */

import fs from "fs";
import { getCategoryForSubstance } from "../parsers/tripsit-combos.ts";
import {
  normalizeParsedInteractions,
  normalizeTripSitInteractions,
  resolveInteractionDataPaths,
} from "./prepopulate-interactions-tripsit-core.mjs";
import { tryWriteArtifactLineageSidecar } from "../lib/data-artifact-lineage.mjs";
import {
  assertDataOpsWriteAllowed,
  createDataOpsRunContext,
  printDataOpsRunContext,
} from "../lib/data-ops-run-context.mjs";

const {
  repoRoot,
  articlesPath,
  combosPath,
  parsedPath,
} = resolveInteractionDataPaths(import.meta.url);

const articles = JSON.parse(fs.readFileSync(articlesPath, "utf-8"));
const combos = JSON.parse(fs.readFileSync(combosPath, "utf-8"));
const parsed = JSON.parse(fs.readFileSync(parsedPath, "utf-8"));

// Parse CLI args
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const verbose = args.includes("--verbose");
const runContext = createDataOpsRunContext({
  operation: "prepopulate TripSit interactions",
  intent: "local-prepopulate",
  sourceUrlKeys: [],
  targetUrlKeys: [],
  localArtifacts: [
    "src/data/SubstanceIndex.json",
    "src/data/tripsit-combos.json",
    "src/data/parsed-sources.json",
  ],
});

// Slugify function matching parsed-sources keys
import { slugify } from "../lib/slug.mjs";



// === Stats Tracking ===

const stats = {
  articlesProcessed: 0,
  articlesWithCombos: 0,
  articlesWithFallback: 0,
  articlesCleared: 0,
  interactionsByCategory: {},
  dangerousCount: 0,
  unsafeCount: 0,
  cautionCount: 0,
  lowRiskSkipped: 0,
  fallbackSources: {},
  noDataSubstances: [],
};

// === Process Articles ===

const modifiedArticles = articles.map(article => {
  const slug = slugify(article.title);
  const category = getCategoryForSubstance(slug);

  stats.articlesProcessed++;

  // Clone article for modification
  const updated = JSON.parse(JSON.stringify(article));

  // === PRIMARY: TripSit Combos ===
  if (category && combos[category]) {
    stats.articlesWithCombos++;
    stats.interactionsByCategory[category] = (stats.interactionsByCategory[category] || 0) + 1;

    const { interactions, lowRiskSkipped } = normalizeTripSitInteractions(combos[category]);
    const { dangerous, unsafe, caution } = interactions;
    stats.dangerousCount += dangerous.length;
    stats.unsafeCount += unsafe.length;
    stats.cautionCount += caution.length;
    stats.lowRiskSkipped += lowRiskSkipped;
    updated.interactions = interactions;

    if (verbose) {
      const total = dangerous.length + unsafe.length + caution.length;
      console.log(`  ${article.title} [combos:${category}]: ${total} interactions`);
    }

    return updated;
  }

  // === FALLBACK: parsed-sources.json ===
  const parsedData = parsed.substances[slug];
  if (parsedData && parsedData.interactions && parsedData.interactions.length > 0) {
    const { interactions, sources, validCount } = normalizeParsedInteractions(parsedData.interactions);

    if (validCount > 0) {
      stats.articlesWithFallback++;

      for (const src of sources) {
        stats.fallbackSources[src] = (stats.fallbackSources[src] || 0) + 1;
      }

      const { dangerous, unsafe, caution } = interactions;
      stats.dangerousCount += dangerous.length;
      stats.unsafeCount += unsafe.length;
      stats.cautionCount += caution.length;

      updated.interactions = interactions;

      if (verbose) {
        const total = dangerous.length + unsafe.length + caution.length;
        console.log(`  ${article.title} [fallback:${sources.join(",")}]: ${total} interactions`);
      }

      return updated;
    }
  }

  // === NO DATA: Clear interactions ===
  const hadInteractions =
    updated.interactions.dangerous.length > 0 ||
    updated.interactions.unsafe.length > 0 ||
    updated.interactions.caution.length > 0;

  if (hadInteractions) {
    stats.articlesCleared++;
    if (verbose) {
      console.log(`  Cleared: ${article.title} (no data)`);
    }
  }

  updated.interactions = { dangerous: [], unsafe: [], caution: [] };
  stats.noDataSubstances.push(article.title);
  return updated;
});

// === Output Summary ===

console.log("\n" + "=".repeat(60));
console.log("INTERACTION PREPOPULATION (TripSit Combos + Fallback)");
console.log("=".repeat(60));
console.log(`\nMode: ${dryRun ? "DRY RUN (no changes written)" : "APPLY CHANGES"}`);
printDataOpsRunContext(runContext);

console.log(`\n--- Articles ---`);
console.log(`  Total processed:        ${stats.articlesProcessed}`);
console.log(`  From TripSit Combos:    ${stats.articlesWithCombos}`);
console.log(`  From fallback sources:  ${stats.articlesWithFallback}`);
console.log(`  No data available:      ${stats.noDataSubstances.length}`);
console.log(`  Had interactions cleared: ${stats.articlesCleared}`);

console.log(`\n--- Interactions Added ---`);
console.log(`  Dangerous:  ${stats.dangerousCount}`);
console.log(`  Unsafe:     ${stats.unsafeCount}`);
console.log(`  Caution:    ${stats.cautionCount}`);
console.log(`  Total:      ${stats.dangerousCount + stats.unsafeCount + stats.cautionCount}`);
console.log(`  Low-risk skipped: ${stats.lowRiskSkipped}`);

console.log(`\n--- TripSit Combo Categories ---`);
const sortedCategories = Object.entries(stats.interactionsByCategory)
  .sort((a, b) => b[1] - a[1]);
for (const [cat, count] of sortedCategories) {
  console.log(`  ${cat}: ${count} substances`);
}

if (Object.keys(stats.fallbackSources).length > 0) {
  console.log(`\n--- Fallback Sources Used ---`);
  const sortedSources = Object.entries(stats.fallbackSources)
    .sort((a, b) => b[1] - a[1]);
  for (const [src, count] of sortedSources) {
    console.log(`  ${src}: ${count} substances`);
  }
}

if (verbose && stats.noDataSubstances.length > 0) {
  console.log(`\n--- No Data Available (${stats.noDataSubstances.length}) ---`);
  stats.noDataSubstances.slice(0, 20).forEach(s => console.log(`  - ${s}`));
  if (stats.noDataSubstances.length > 20) {
    console.log(`  ... and ${stats.noDataSubstances.length - 20} more`);
  }
}

// Write if not dry run
if (!dryRun) {
  assertDataOpsWriteAllowed(runContext);
  fs.writeFileSync(articlesPath, JSON.stringify(modifiedArticles, null, 2) + "\n");
  const lineage = tryWriteArtifactLineageSidecar({
    artifactPath: "src/data/SubstanceIndex.json",
    rootDir: repoRoot,
    producer: "scripts/prepopulate/prepopulate-interactions-tripsit.mjs",
    sourceDeployment: "src/data/tripsit-combos.json and src/data/parsed-sources.json",
    schemaVersion: "src/schema/substance.schema.ts",
    extra: {
      articlesProcessed: stats.articlesProcessed,
      articlesWithCombos: stats.articlesWithCombos,
      articlesWithFallback: stats.articlesWithFallback,
      dangerousCount: stats.dangerousCount,
      unsafeCount: stats.unsafeCount,
      cautionCount: stats.cautionCount,
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
