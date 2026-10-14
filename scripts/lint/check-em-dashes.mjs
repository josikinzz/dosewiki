#!/usr/bin/env node
// Enforces rule 10 (no em dashes). See em-dash-policy.mjs for what counts.
//
//   node scripts/lint/check-em-dashes.mjs                    fail on violations or a file over its baseline
//   node scripts/lint/check-em-dashes.mjs --shrink-baseline  lower baseline counts to match the tree

import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { BASELINE_PATH, checkRepository } from "./em-dash-policy.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const { violations, comments, baseline, baselineProblems } = checkRepository(repoRoot);

if (process.argv.includes("--shrink-baseline")) {
  const shrunk = {};
  for (const [file, allowed] of Object.entries(baseline).sort(([a], [b]) => a.localeCompare(b))) {
    const count = Math.min(allowed, comments[file] ?? 0);
    if (count > 0) shrunk[file] = count;
  }
  writeFileSync(path.join(repoRoot, BASELINE_PATH), `${JSON.stringify(shrunk, null, 2)}\n`);
  console.log(`Baseline now allows ${Object.values(shrunk).reduce((sum, count) => sum + count, 0)} comment em dashes.`);
  process.exit(0);
}

for (const { file, line } of violations) console.error(`${file}:${line}: em dash in reader-facing text`);
for (const problem of baselineProblems) console.error(problem);
if (violations.length > 0 || baselineProblems.length > 0) {
  console.error(`\n${violations.length} em dash violation(s), ${baselineProblems.length} baseline problem(s). Rule 10 of AGENTS.md bans em dashes.`);
  process.exit(1);
}
console.log("No em dashes in reader-facing text; comment baseline matches.");
