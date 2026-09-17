#!/usr/bin/env node

import {
  ARTIFACT_LINEAGE_MANIFEST_PATH,
  collectArtifactLineageVerification,
  collectArtifactLineageWarnings,
} from "../lib/data-artifact-lineage.mjs";

const args = new Set(process.argv.slice(2));
const strict = args.has("--strict");
const checkSidecars = args.has("--check-sidecars");
if (args.has("--help")) {
  console.log("Usage: node scripts/data/verifyGeneratedDataProvenance.mjs [--strict] [--check-sidecars]");
  console.log("Checks manifest paths and export retention. --check-sidecars also compares recorded local artifact digests, not source freshness. --strict fails on errors or warnings.");
  process.exit(0);
}
const rootDir = process.cwd();

const { errors, warnings, generatedExports } = collectArtifactLineageVerification({ rootDir });
if (checkSidecars) warnings.push(...collectArtifactLineageWarnings({ rootDir }));
const issueCount = errors.length + warnings.length;

console.log(`Generated data provenance report: ${ARTIFACT_LINEAGE_MANIFEST_PATH}`);
console.log(`Scope: manifest paths and export retention${checkSidecars ? ", plus local sidecar digests" : "; sidecar digests not checked (use --check-sidecars)"}. Source freshness is not verified.`);
console.log(
  `Tracked generated exports: ${generatedExports.tracked} file(s), ${generatedExports.retained} retained by policy, ${generatedExports.unclassified.length} unclassified.`,
);

if (errors.length > 0) {
  console.log(`\n${errors.length} manifest error(s):`);
  for (const error of errors) {
    console.log(`- ${error}`);
  }
}

if (warnings.length > 0) {
  console.log(`\n${warnings.length} informational warning(s):`);
  for (const warning of warnings) {
    console.log(`- ${warning}`);
  }
}

if (issueCount === 0) {
  console.log("No provenance issues found.");
}

if (strict && issueCount > 0) {
  process.exitCode = 1;
}
