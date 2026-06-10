#!/usr/bin/env node
/**
 * Pre-populate articles with tolerance data from parsed-sources.json
 *
 * Fields populated:
 *   - tolerance.full_tolerance
 *   - tolerance.half_tolerance
 *   - tolerance.baseline_tolerance
 *   - tolerance.cross_tolerance
 *
 * Source priority: psychonautwiki > tripsit
 *
 * Usage:
 *   node scripts/prepopulate-tolerance.mjs --dry-run     # Preview changes
 *   node scripts/prepopulate-tolerance.mjs               # Apply changes
 *   node scripts/prepopulate-tolerance.mjs --verbose     # Show per-article details
 *   node scripts/prepopulate-tolerance.mjs --slug=lsd    # Single substance
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const repoRoot = path.resolve(__dirname, "..", "..");

// Load data
const articlesPath = path.join(ROOT, "src/data/SubstanceIndex.json");
const parsedPath = path.join(ROOT, "src/data/parsed-sources.json");

const articles = JSON.parse(fs.readFileSync(articlesPath, "utf-8"));
const parsed = JSON.parse(fs.readFileSync(parsedPath, "utf-8"));

// Parse CLI args
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const singleSlug = args.find(a => a.startsWith("--slug="))?.split("=")[1];
const verbose = args.includes("--verbose");
const runContext = createDataOpsRunContext({
  operation: "prepopulate tolerance",
  intent: "local-prepopulate",
  sourceUrlKeys: [],
  targetUrlKeys: [],
  localArtifacts: ["src/data/SubstanceIndex.json", "src/data/parsed-sources.json"],
});

// Slugify function matching parsed-sources keys
import { slugify } from "../lib/slug.mjs";

// Source priority (lower index = higher priority)
const SOURCE_PRIORITY = ["psychonautwiki", "tripsit"];

function getSourcePriority(source) {
  const idx = SOURCE_PRIORITY.indexOf(source);
  return idx === -1 ? 999 : idx;
}

// Select best tolerance entry based on source priority
function selectBestTolerance(toleranceArray) {
  if (!toleranceArray || toleranceArray.length === 0) return null;

  return toleranceArray
    .slice()
    .sort((a, b) => getSourcePriority(a.source) - getSourcePriority(b.source))[0];
}

// Stats tracking
const stats = {
  articlesProcessed: 0,
  articlesModified: 0,
  fieldsPopulated: {
    full_tolerance: 0,
    half_tolerance: 0,
    baseline_tolerance: 0,
    cross_tolerance: 0,
  },
  fieldsSkipped: {
    already_populated: 0,
    no_source_data: 0,
  },
  sourceUsage: {},
  unmatched: [],
};

// Process each article
const modifiedArticles = articles.map(article => {
  const slug = slugify(article.title);

  // Filter by single slug if specified
  if (singleSlug && slug !== singleSlug) {
    return article;
  }

  const source = parsed.substances[slug];

  if (!source) {
    stats.unmatched.push(article.title);
    return article;
  }

  stats.articlesProcessed++;

  // Check if tolerance data exists in parsed sources
  if (!source.tolerance || source.tolerance.length === 0) {
    stats.fieldsSkipped.no_source_data++;
    return article;
  }

  // Select best tolerance source
  const tol = selectBestTolerance(source.tolerance);
  if (!tol) {
    stats.fieldsSkipped.no_source_data++;
    return article;
  }

  // Track source usage
  stats.sourceUsage[tol.source] = (stats.sourceUsage[tol.source] || 0) + 1;

  // Clone article for modification
  const updated = JSON.parse(JSON.stringify(article));
  let modified = false;
  const changes = [];

  // Ensure tolerance object exists
  if (!updated.tolerance) {
    updated.tolerance = {
      full_tolerance: "",
      half_tolerance: "",
      baseline_tolerance: "",
      cross_tolerance: [],
    };
  }

  // Full tolerance
  if (tol.fullTolerance && !updated.tolerance.full_tolerance) {
    updated.tolerance.full_tolerance = tol.fullTolerance;
    stats.fieldsPopulated.full_tolerance++;
    changes.push(`full_tolerance: "${tol.fullTolerance}"`);
    modified = true;
  } else if (tol.fullTolerance && updated.tolerance.full_tolerance) {
    stats.fieldsSkipped.already_populated++;
  }

  // Half tolerance
  if (tol.halfTolerance && !updated.tolerance.half_tolerance) {
    updated.tolerance.half_tolerance = tol.halfTolerance;
    stats.fieldsPopulated.half_tolerance++;
    changes.push(`half_tolerance: "${tol.halfTolerance}"`);
    modified = true;
  } else if (tol.halfTolerance && updated.tolerance.half_tolerance) {
    stats.fieldsSkipped.already_populated++;
  }

  // Baseline tolerance
  if (tol.baselineTolerance && !updated.tolerance.baseline_tolerance) {
    updated.tolerance.baseline_tolerance = tol.baselineTolerance;
    stats.fieldsPopulated.baseline_tolerance++;
    changes.push(`baseline_tolerance: "${tol.baselineTolerance}"`);
    modified = true;
  } else if (tol.baselineTolerance && updated.tolerance.baseline_tolerance) {
    stats.fieldsSkipped.already_populated++;
  }

  // Cross tolerance (only if array is empty)
  if (tol.crossTolerances && tol.crossTolerances.length > 0) {
    const currentCross = updated.tolerance.cross_tolerance || [];
    if (currentCross.length === 0) {
      updated.tolerance.cross_tolerance = tol.crossTolerances;
      stats.fieldsPopulated.cross_tolerance++;
      changes.push(`cross_tolerance: [${tol.crossTolerances.length} items]`);
      modified = true;
    } else {
      stats.fieldsSkipped.already_populated++;
    }
  }

  if (modified) {
    stats.articlesModified++;
    if (verbose || singleSlug) {
      console.log(`\n[${tol.source}] ${article.title}:`);
      changes.forEach(c => console.log(`   + ${c}`));
    }
  }

  return updated;
});

// Output summary
console.log("\n" + "=".repeat(60));
console.log("TOLERANCE PRE-POPULATION SUMMARY");
console.log("=".repeat(60));
console.log(`\nMode: ${dryRun ? "DRY RUN (no changes written)" : "APPLY CHANGES"}`);
printDataOpsRunContext(runContext);
console.log(`Source priority: ${SOURCE_PRIORITY.join(" > ")}`);
console.log(`\nArticles processed: ${stats.articlesProcessed}`);
console.log(`Articles modified: ${stats.articlesModified}`);
console.log(`Unmatched articles: ${stats.unmatched.length}`);

console.log("\n--- Fields Populated ---");
console.log(`  tolerance.full_tolerance:     ${stats.fieldsPopulated.full_tolerance}`);
console.log(`  tolerance.half_tolerance:     ${stats.fieldsPopulated.half_tolerance}`);
console.log(`  tolerance.baseline_tolerance: ${stats.fieldsPopulated.baseline_tolerance}`);
console.log(`  tolerance.cross_tolerance:    ${stats.fieldsPopulated.cross_tolerance}`);

const totalPopulated = Object.values(stats.fieldsPopulated).reduce((a, b) => a + b, 0);
console.log(`\nTotal fields populated: ${totalPopulated}`);
console.log(`Fields skipped (already populated): ${stats.fieldsSkipped.already_populated}`);
console.log(`Articles with no source data: ${stats.fieldsSkipped.no_source_data}`);

console.log("\n--- Source Usage ---");
for (const [source, count] of Object.entries(stats.sourceUsage)) {
  console.log(`  ${source}: ${count}`);
}

if (stats.unmatched.length > 0 && verbose) {
  console.log("\n--- Unmatched Articles ---");
  stats.unmatched.slice(0, 20).forEach(t => console.log(`  - ${t}`));
  if (stats.unmatched.length > 20) {
    console.log(`  ... and ${stats.unmatched.length - 20} more`);
  }
}

// Write if not dry run
if (!dryRun) {
  assertDataOpsWriteAllowed(runContext);
  fs.writeFileSync(articlesPath, JSON.stringify(modifiedArticles, null, 2) + "\n");
  const lineage = tryWriteArtifactLineageSidecar({
    artifactPath: "src/data/SubstanceIndex.json",
    rootDir: repoRoot,
    producer: "scripts/prepopulate/prepopulate-tolerance.mjs",
    sourceDeployment: "src/data/parsed-sources.json",
    schemaVersion: "src/schema/substance.schema.ts",
    extra: {
      articlesProcessed: stats.articlesProcessed,
      articlesModified: stats.articlesModified,
    },
  });
  console.log(`\n Changes written to ${articlesPath}`);
  if (lineage) {
    console.log(`🧾 Lineage metadata written to ${lineage.outputPath}`);
  }
} else {
  console.log("\n Dry run - no changes written. Remove --dry-run to apply.");
}

console.log("");
