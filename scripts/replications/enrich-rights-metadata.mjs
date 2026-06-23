#!/usr/bin/env node
/**
 * Enrich generated replication metadata with EffectIndex creator/source data
 * and dose.wiki's default creator-retained rights policy.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  enrichReplicationMetadataFromEffectIndexDump,
} from "./lib/workspace.mjs";
import {
  resolveReplicationsPaths,
} from "./lib/reconciliation.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_EFFECT_INDEX_DUMP =
  "/Users/josie/Documents/Utilities/EffectIndex-master/effectindex_dump/replications.json";

function readArg(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    return fallback;
  }

  return process.argv[index + 1] ?? fallback;
}

const { metadataFile } = resolveReplicationsPaths(__dirname);
const inputPath = readArg("--input", metadataFile);
const outputPath = readArg("--output", inputPath);
const sourcePath = readArg("--source", DEFAULT_EFFECT_INDEX_DUMP);
const dryRun = process.argv.includes("--dry-run");

if (!fs.existsSync(inputPath)) {
  throw new Error(`Replication metadata file not found: ${inputPath}`);
}

if (!fs.existsSync(sourcePath)) {
  throw new Error(`EffectIndex replication dump not found: ${sourcePath}`);
}

const metadata = JSON.parse(fs.readFileSync(inputPath, "utf8"));
const effectIndexReplications = JSON.parse(fs.readFileSync(sourcePath, "utf8"));

if (!Array.isArray(metadata.replications)) {
  throw new Error(`Expected ${inputPath} to contain a replications array.`);
}

if (!Array.isArray(effectIndexReplications)) {
  throw new Error(`Expected ${sourcePath} to contain an array.`);
}

const result = enrichReplicationMetadataFromEffectIndexDump(
  metadata.replications,
  effectIndexReplications,
);

const nextMetadata = {
  ...metadata,
  metadata: {
    ...metadata.metadata,
    rightsEnrichedAt: new Date().toISOString(),
    rightsEnrichmentSource: sourcePath,
    rightsEnrichmentStats: result.stats,
  },
  replications: result.replications,
};

console.log("Replication rights enrichment");
console.log(`Input: ${inputPath}`);
console.log(`Source: ${sourcePath}`);
console.log(`Output: ${outputPath}`);
console.log(JSON.stringify(result.stats, null, 2));

if (dryRun) {
  console.log("Dry run only; no file written.");
} else {
  fs.writeFileSync(outputPath, `${JSON.stringify(nextMetadata, null, 2)}\n`);
  console.log("Metadata written.");
}
