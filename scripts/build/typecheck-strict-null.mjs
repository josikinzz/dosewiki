#!/usr/bin/env node
// Strict null rollout, expand step: type-check the whole app with
// strictNullChecks on and fail only on diagnostics inside the include list of
// tsconfig.strict-null.json. Files outside the list are still compiled because
// covered files import them; their errors wait for their own batch.
//
//   node scripts/build/typecheck-strict-null.mjs

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CONFIG = "tsconfig.strict-null.json";
const DIAGNOSTIC = /^(.+?)\(\d+,\d+\): error TS\d+:/;

export function coveredDiagnostics(output, include) {
  const covered = (file) => include.some((entry) => file === entry || file.startsWith(`${entry}/`));
  const diagnostics = [];
  let current = null;
  for (const line of output.split(/\r?\n/)) {
    const match = DIAGNOSTIC.exec(line);
    if (match) {
      current = covered(match[1]) ? [line] : null;
      if (current) diagnostics.push(current);
    } else if (current && line.startsWith(" ")) {
      current.push(line);
    } else {
      current = null;
    }
  }
  return diagnostics.map((lines) => lines.join("\n"));
}

function main() {
  const config = JSON.parse(readFileSync(path.join(repoRoot, CONFIG), "utf8"));
  const include = config.include.filter((entry) => !entry.endsWith(".d.ts"));
  const tsc = path.join(repoRoot, "node_modules", ".bin", process.platform === "win32" ? "tsc.cmd" : "tsc");
  const result = spawnSync(tsc, ["--noEmit", "--pretty", "false", "-p", CONFIG], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  const output = `${result.stdout}${result.stderr}`;
  const covered = coveredDiagnostics(output, include);
  const total = output.split(/\r?\n/).filter((line) => DIAGNOSTIC.test(line)).length;
  if (covered.length > 0) {
    console.error(covered.join("\n"));
    console.error(`\n${covered.length} strict null error(s) in files covered by ${CONFIG}.`);
    process.exit(1);
  }
  if (result.status !== 0 && total === 0) {
    console.error(output);
    process.exit(result.status ?? 1);
  }
  console.log(`Strict null checks pass for ${include.join(", ")} (${total} deferred outside the include list).`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
