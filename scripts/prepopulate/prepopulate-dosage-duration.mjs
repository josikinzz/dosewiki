#!/usr/bin/env node
/**
 * Prepopulate dosage and duration from parsed-sources.json.
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
import { printSummary, processArticles } from "./dosage-duration/index.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");
const articlesPath = path.join(ROOT, "src/data/SubstanceIndex.json");
const parsedPath = path.join(ROOT, "src/data/parsed-sources.json");

function parseArgs(argv) {
  const args = argv.slice(2);
  const substanceArg = args.find((arg) => arg.startsWith("--substance="));

  return {
    dryRun: args.includes("--dry-run"),
    verbose: args.includes("--verbose"),
    targetSubstances: substanceArg
      ? substanceArg.split("=")[1].split(",").map((slug) => slug.trim().toLowerCase())
      : null,
  };
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function main() {
  const { dryRun, verbose, targetSubstances } = parseArgs(process.argv);
  const runContext = createDataOpsRunContext({
    operation: "prepopulate dosage and duration",
    intent: "local-prepopulate",
  sourceUrlKeys: [],
  targetUrlKeys: [],
    localArtifacts: ["src/data/SubstanceIndex.json", "src/data/parsed-sources.json"],
  });
  printDataOpsRunContext(runContext);

  const articles = readJson(articlesPath);
  const parsed = readJson(parsedPath);

  const result = processArticles({
    articles,
    parsed,
    targetSubstances,
    verbose,
    logger: console,
  });

  printSummary({
    articles,
    beforeStats: result.beforeStats,
    afterStats: result.afterStats,
    stats: result.stats,
    dryRun,
    targetSubstances,
    logger: console,
    verbose,
  });

  if (!dryRun) {
    assertDataOpsWriteAllowed(runContext);
    fs.writeFileSync(articlesPath, JSON.stringify(result.modifiedArticles, null, 2) + "\n");
    const lineage = tryWriteArtifactLineageSidecar({
      artifactPath: articlesPath,
      rootDir: ROOT,
      producer: "scripts/prepopulate/prepopulate-dosage-duration.mjs",
      sourceDeployment: "src/data/parsed-sources.json",
      schemaVersion: "src/schema/substance.schema.ts",
      extra: {
        targetSubstances,
        populatedDosage: result.stats.populatedDosage.length,
        populatedDuration: result.stats.populatedDuration.length,
        overwrittenDosage: result.stats.overwrittenDosage.length,
        overwrittenDuration: result.stats.overwrittenDuration.length,
      },
    });
    console.log(`\n✅ Changes written to ${articlesPath}`);
    if (lineage) {
      console.log(`🧾 Lineage metadata written to ${lineage.outputPath}`);
    }
  } else {
    console.log("\n📋 Dry run - no changes written. Remove --dry-run to apply.");
  }

  console.log("");
}

main();
