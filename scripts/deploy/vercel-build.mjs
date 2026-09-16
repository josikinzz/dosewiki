#!/usr/bin/env node
/**
 * Verification and application-build command for every Vercel project that
 * builds this repository.
 *
 * Ordinary builds check that owned Postgres function references resolve in the
 * checkout, then build the application. No database deployment is performed.
 * Deployment and rollback procedures belong to separately authorized entry
 * points and are intentionally unavailable here, even when deploy credentials
 * are present in the environment.
 *
 * Usage (normally only invoked by Vercel via `bun run build:vercel`):
 *   node scripts/deploy/vercel-build.mjs
 *   node scripts/deploy/vercel-build.mjs --plan   # print the decision, build nothing
 *
 * Exit codes:
 *   0  build succeeded
 *   1  verification or build failed
 */

import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** The real app build, separate from this wrapper to avoid recursion. */
const APP_BUILD_COMMAND = "bun run build";


function run(command, args, { env = process.env } = {}) {
  const result = spawnSync(command, args, {
    cwd: REPO_ROOT,
    env,
    stdio: "inherit",
    shell: false,
  });
  if (result.error) {
    console.error(`Failed to run ${command}: ${result.error.message}`);
    return 1;
  }
  return result.status ?? 1;
}

function banner(lines) {
  const width = Math.max(...lines.map((line) => line.length));
  const rule = "-".repeat(width + 4);
  console.log(`\n${rule}`);
  for (const line of lines) console.log(`| ${line.padEnd(width)} |`);
  console.log(`${rule}\n`);
}

/**
 * Every owned function the app names must exist in this checkout. Typecheck
 * covers the `api.*` form but not the untyped string form used for public reads,
 * so this is the only static coverage those names have.
 */
function checkCallsitesResolve() {
  console.log("[vercel-build] Checking owned Postgres function references...");
  return run("node", ["scripts/build/check-function-references.mjs"]);
}

function main() {
  const planOnly = process.argv.includes("--plan");

  banner([
    "Postgres application verification and build only",
    "No database or provider deployment is performed, regardless of credentials.",
  ]);

  if (planOnly) return;

  const callsiteStatus = checkCallsitesResolve();
  if (callsiteStatus !== 0) {
    console.error(
      "[vercel-build] The app calls an owned function this checkout does not define. " +
        "Building would ship a call that can never resolve.",
    );
    process.exit(1);
  }

  console.log(
    "[vercel-build] Checkout-internal function reference integrity was enforced; " +
      "no deployment was read or mutated.",
  );
  console.log(`[vercel-build] ${APP_BUILD_COMMAND}`);
  const status = run("bun", ["run", "build"]);
  process.exit(status);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) {
  main();
}
