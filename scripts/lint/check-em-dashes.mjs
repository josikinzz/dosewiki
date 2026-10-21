#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";
import { findEmDashes, listScannedFiles } from "./em-dash-policy.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const files = process.argv.slice(2);
const violations = findEmDashes(repoRoot, files.length > 0 ? files : listScannedFiles(repoRoot));
for (const { file, line } of violations) console.error(`${file}:${line}: em dash in text`);
if (violations.length > 0) {
  console.error(`\n${violations.length} em dash violation(s). Em dashes are forbidden.`);
  process.exit(1);
}
console.log("No em dashes in scanned text.");
