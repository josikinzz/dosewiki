#!/usr/bin/env node
/**
 * Pre-populate articles with identification data from oldosewiki-article.json
 *
 * Fields extracted:
 * - IUPAC_name → identification.iupac_name
 * - smiles → identification.smiles
 * - substitutive_name → identification.substitutive_name
 * - alternative_name → identification.alternative_names (split by "; ")
 * - botanical_name → identification.botanical_name
 *
 * Usage:
 *   node scripts/prepopulate/prepopulate-from-old-articles.mjs --input <local-substance-export.json> --dry-run
 *   node scripts/prepopulate/prepopulate-from-old-articles.mjs --input <local-substance-export.json>
 *   node scripts/prepopulate/prepopulate-from-old-articles.mjs --input <local-substance-export.json> --verbose
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const repoRoot = path.resolve(__dirname, "..", "..");

// Parse CLI args
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const verbose = args.includes("--verbose");
const inputIndex = args.indexOf("--input");
if (inputIndex < 0 || !args[inputIndex + 1]) {
  throw new Error("Pass --input <path> naming the local substance export to prepopulate.");
}

// Load data files
const articlesPath = path.resolve(args[inputIndex + 1]);
const oldArticlesPath = path.join(ROOT, "oldosewiki-article.json");

const articles = JSON.parse(fs.readFileSync(articlesPath, "utf-8"));
const oldArticles = JSON.parse(fs.readFileSync(oldArticlesPath, "utf-8"));

const runContext = createDataOpsRunContext({
  operation: "prepopulate identification from old articles",
  intent: "local-prepopulate",
  sourceUrlKeys: [],
  targetUrlKeys: [],
  localArtifacts: [path.relative(repoRoot, articlesPath), "oldosewiki-article.json"],
});

// Build lookup map from old articles by title (case-insensitive)
const oldByTitle = new Map();
for (const art of oldArticles) {
  if (art.title) {
    oldByTitle.set(art.title.toLowerCase().trim(), art);
  }
}

// Stats tracking
const stats = {
  articlesProcessed: 0,
  articlesModified: 0,
  fieldsPopulated: {
    iupac_name: 0,
    smiles: 0,
    substitutive_name: 0,
    alternative_names: 0,
    botanical_name: 0,
  },
  fieldsSkipped: {
    already_populated: 0,
    no_source_data: 0,
  },
  unmatched: [],
};

// Helper: check if field is empty
function isEmpty(value) {
  if (value === undefined || value === null) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

// Helper: split alternative names by semicolon
function splitAlternativeNames(str) {
  if (!str || typeof str !== "string") return [];
  return str
    .split(/;\s*/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

// Process each article
const modifiedArticles = articles.map((article) => {
  const title = article.title?.toLowerCase().trim();
  const oldArt = oldByTitle.get(title);

  if (!oldArt) {
    stats.unmatched.push(article.title);
    return article;
  }

  stats.articlesProcessed++;

  const info = oldArt.drug_info || {};
  const updated = JSON.parse(JSON.stringify(article));
  let modified = false;
  const changes = [];

  // Ensure identification object exists
  if (!updated.identification) {
    updated.identification = {};
  }

  // === IUPAC Name ===
  if (typeof info.IUPAC_name === "string" && info.IUPAC_name.trim()) {
    if (isEmpty(updated.identification.iupac_name)) {
      updated.identification.iupac_name = info.IUPAC_name.trim();
      stats.fieldsPopulated.iupac_name++;
      changes.push(`iupac_name: "${info.IUPAC_name.trim().slice(0, 50)}..."`);
      modified = true;
    } else {
      stats.fieldsSkipped.already_populated++;
    }
  }

  // === SMILES ===
  if (typeof info.smiles === "string" && info.smiles.trim()) {
    if (isEmpty(updated.identification.smiles)) {
      updated.identification.smiles = info.smiles.trim();
      stats.fieldsPopulated.smiles++;
      changes.push(`smiles: "${info.smiles.trim().slice(0, 40)}..."`);
      modified = true;
    } else {
      stats.fieldsSkipped.already_populated++;
    }
  }

  // === Substitutive Name ===
  if (typeof info.substitutive_name === "string" && info.substitutive_name.trim()) {
    if (isEmpty(updated.identification.substitutive_name)) {
      updated.identification.substitutive_name = info.substitutive_name.trim();
      stats.fieldsPopulated.substitutive_name++;
      changes.push(`substitutive_name: "${info.substitutive_name.trim().slice(0, 50)}..."`);
      modified = true;
    } else {
      stats.fieldsSkipped.already_populated++;
    }
  }

  // === Alternative Names (split by semicolon) ===
  if (typeof info.alternative_name === "string" && info.alternative_name.trim()) {
    if (isEmpty(updated.identification.alternative_names)) {
      const altNames = splitAlternativeNames(info.alternative_name);
      if (altNames.length > 0) {
        updated.identification.alternative_names = altNames;
        stats.fieldsPopulated.alternative_names++;
        changes.push(`alternative_names: [${altNames.length} items]`);
        modified = true;
      }
    } else {
      stats.fieldsSkipped.already_populated++;
    }
  }

  // === Botanical Name ===
  if (typeof info.botanical_name === "string" && info.botanical_name.trim()) {
    if (isEmpty(updated.identification.botanical_name)) {
      updated.identification.botanical_name = info.botanical_name.trim();
      stats.fieldsPopulated.botanical_name++;
      changes.push(`botanical_name: "${info.botanical_name.trim()}"`);
      modified = true;
    } else {
      stats.fieldsSkipped.already_populated++;
    }
  }

  if (modified) {
    stats.articlesModified++;
    if (verbose) {
      console.log(`\n📝 ${article.title}:`);
      changes.forEach((c) => console.log(`   + ${c}`));
    }
  }

  return updated;
});

// Output summary
console.log("\n" + "=".repeat(60));
console.log("PRE-POPULATION FROM OLD ARTICLES SUMMARY");
console.log("=".repeat(60));
console.log(`\nMode: ${dryRun ? "DRY RUN (no changes written)" : "APPLY CHANGES"}`);
printDataOpsRunContext(runContext);
console.log(`\nArticles matched: ${stats.articlesProcessed} / ${articles.length}`);
console.log(`Articles modified: ${stats.articlesModified}`);
console.log(`Unmatched articles: ${stats.unmatched.length}`);

console.log("\n--- Fields Populated ---");
console.log(`  identification.iupac_name:        ${stats.fieldsPopulated.iupac_name}`);
console.log(`  identification.smiles:            ${stats.fieldsPopulated.smiles}`);
console.log(`  identification.substitutive_name: ${stats.fieldsPopulated.substitutive_name}`);
console.log(`  identification.alternative_names: ${stats.fieldsPopulated.alternative_names}`);
console.log(`  identification.botanical_name:    ${stats.fieldsPopulated.botanical_name}`);

const totalPopulated = Object.values(stats.fieldsPopulated).reduce((a, b) => a + b, 0);
console.log(`\nTotal fields populated: ${totalPopulated}`);
console.log(`Fields skipped (already populated): ${stats.fieldsSkipped.already_populated}`);

if (stats.unmatched.length > 0 && verbose) {
  console.log("\n--- Unmatched Articles ---");
  stats.unmatched.forEach((t) => console.log(`  - ${t}`));
}

// Write if not dry run
if (!dryRun) {
  assertDataOpsWriteAllowed(runContext);
  fs.writeFileSync(articlesPath, JSON.stringify(modifiedArticles, null, 2) + "\n");
  const lineage = tryWriteArtifactLineageSidecar({
    artifactPath: articlesPath,
    rootDir: repoRoot,
    producer: "scripts/prepopulate/prepopulate-from-old-articles.mjs",
    sourceDeployment: "oldosewiki-article.json",
    schemaVersion: "src/schema/substance.schema.ts",
    extra: {
      articlesProcessed: stats.articlesProcessed,
      articlesModified: stats.articlesModified,
      totalFieldsPopulated: totalPopulated,
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
