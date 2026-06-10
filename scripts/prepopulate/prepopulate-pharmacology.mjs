#!/usr/bin/env node
/**
 * Pre-populate articles with STRUCTURED pharmacology data from parsed-sources.json
 *
 * Only populates:
 * - receptor_binding (from DrugBank receptors array)
 *
 * Other pharmacology fields (half_life, bioavailability_notes, metabolism) are
 * narrative text that should be formatted by the LLM generator, not prepopulated.
 *
 * Usage:
 *   node scripts/prepopulate-pharmacology.mjs --dry-run
 *   node scripts/prepopulate-pharmacology.mjs
 *   node scripts/prepopulate-pharmacology.mjs --slug=alprazolam
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

const articlesPath = path.join(ROOT, "src/data/SubstanceIndex.json");
const parsedPath = path.join(ROOT, "src/data/parsed-sources.json");

const articles = JSON.parse(fs.readFileSync(articlesPath, "utf-8"));
const parsed = JSON.parse(fs.readFileSync(parsedPath, "utf-8"));

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const singleSlug = args.find((a) => a.startsWith("--slug="))?.split("=")[1];
const verbose = args.includes("--verbose");
const runContext = createDataOpsRunContext({
  operation: "prepopulate pharmacology",
  intent: "local-prepopulate",
  sourceUrlKeys: [],
  targetUrlKeys: [],
  localArtifacts: ["src/data/SubstanceIndex.json", "src/data/parsed-sources.json"],
});

import { slugify } from "../lib/slug.mjs";

const stats = {
  articlesProcessed: 0,
  articlesModified: 0,
  receptorBindingPopulated: 0,
  skippedAlreadyPopulated: 0,
  skippedNoSourceData: 0,
};

const modifiedArticles = articles.map((article) => {
  const slug = slugify(article.title);

  if (singleSlug && slug !== singleSlug) {
    return article;
  }

  stats.articlesProcessed++;

  const sourceData = parsed.substances?.[slug];
  if (!sourceData?.pharmacology?.receptors?.length) {
    stats.skippedNoSourceData++;
    return article;
  }

  // Ensure pharmacology object exists
  if (!article.pharmacology) {
    article.pharmacology = {
      mechanism_of_action: [],
      receptor_binding: {},
      metabolism: "",
      metabolites: [],
      half_life: "",
      bioavailability_notes: "",
    };
  }

  // Only populate receptor_binding if empty
  if (Object.keys(article.pharmacology.receptor_binding || {}).length === 0) {
    const binding = {};
    for (const receptor of sourceData.pharmacology.receptors) {
      binding[receptor.name] = receptor.action;
    }
    article.pharmacology.receptor_binding = binding;
    stats.receptorBindingPopulated++;
    stats.articlesModified++;

    if (verbose) {
      console.log(`  ${slug}: receptor_binding (${sourceData.pharmacology.receptors.length} receptors)`);
    }
  } else {
    stats.skippedAlreadyPopulated++;
  }

  return article;
});

console.log("\n📊 Pharmacology Prepopulation (Structured Data Only)\n");
console.log(`Articles processed: ${stats.articlesProcessed}`);
console.log(`Articles modified: ${stats.articlesModified}`);
console.log();
console.log("Populated:");
console.log(`  receptor_binding: ${stats.receptorBindingPopulated}`);
console.log();
console.log("Skipped:");
console.log(`  Already populated: ${stats.skippedAlreadyPopulated}`);
console.log(`  No source data: ${stats.skippedNoSourceData}`);
console.log();
console.log("Note: half_life, bioavailability_notes, metabolism are left for LLM generation");
printDataOpsRunContext(runContext);

if (dryRun) {
  console.log("\n⚠️  DRY RUN - No changes written");
} else {
  assertDataOpsWriteAllowed(runContext);
  fs.writeFileSync(articlesPath, JSON.stringify(modifiedArticles, null, 2));
  const lineage = tryWriteArtifactLineageSidecar({
    artifactPath: "src/data/SubstanceIndex.json",
    rootDir: repoRoot,
    producer: "scripts/prepopulate/prepopulate-pharmacology.mjs",
    sourceDeployment: "src/data/parsed-sources.json",
    schemaVersion: "src/schema/substance.schema.ts",
    extra: {
      articlesProcessed: stats.articlesProcessed,
      articlesModified: stats.articlesModified,
      receptorBindingPopulated: stats.receptorBindingPopulated,
    },
  });
  console.log(`\n✅ Written to ${articlesPath}`);
  if (lineage) {
    console.log(`🧾 Lineage metadata written to ${lineage.outputPath}`);
  }
}
