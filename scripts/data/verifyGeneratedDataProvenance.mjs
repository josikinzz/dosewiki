#!/usr/bin/env node

import {
  ARTIFACT_LINEAGE_MANIFEST_PATH,
  collectArtifactLineageVerification,
} from "../lib/data-artifact-lineage.mjs";

const args = new Set(process.argv.slice(2));
const strict = args.has("--strict");
const rootDir = process.cwd();

const { errors, warnings } = collectArtifactLineageVerification({ rootDir });
const issueCount = errors.length + warnings.length;

console.log(`Generated data provenance report: ${ARTIFACT_LINEAGE_MANIFEST_PATH}`);

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
