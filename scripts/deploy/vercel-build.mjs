#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, realpathSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeSiteFlavor, resolveBuildDirectory, resolveBuildSurface } from "../build/build-surface.mjs";
import { BUILD_TIMING_FILE } from "../build/prerender-census.lib.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

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

function writeBuildTiming({ startedAt, endedAt, exitStatus }) {
  let buildDirectory;
  try {
    buildDirectory = path.resolve(REPO_ROOT, resolveBuildDirectory(process.env));
  } catch (error) {
    console.error(`[vercel-build] Not recording build timing: ${error.message}`);
    return;
  }
  if (!existsSync(buildDirectory)) {
    console.error(`[vercel-build] Not recording build timing: ${buildDirectory} does not exist.`);
    return;
  }
  const record = {
    command: APP_BUILD_COMMAND,
    surface: resolveBuildSurface(process.env),
    flavor: normalizeSiteFlavor(process.env.NEXT_PUBLIC_SITE_FLAVOR),
    buildDirectory: path.relative(REPO_ROOT, buildDirectory),
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    elapsedSeconds: Math.round((endedAt.getTime() - startedAt.getTime()) / 100) / 10,
    exitStatus,
  };
  writeFileSync(path.join(buildDirectory, BUILD_TIMING_FILE), `${JSON.stringify(record, null, 2)}\n`);
  console.log(`[vercel-build] Build ran ${record.elapsedSeconds}s; timing recorded in ${record.buildDirectory}/${BUILD_TIMING_FILE}`);
}

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
  const startedAt = new Date();
  const status = run("bun", ["run", "build"]);
  writeBuildTiming({ startedAt, endedAt: new Date(), exitStatus: status });
  if (status === 0) {
    const censusStatus = run("node", ["scripts/build/prerender-census.mjs"]);
    if (censusStatus !== 0) {
      console.error(
        `[vercel-build] WARNING: the prerender census exited ${censusStatus}, so this log has no page count. ` +
          "The census only reports; the build succeeded and still deploys. " +
          "Run bun run build:census -- <build directory> before recording this release.",
      );
    }
  }
  process.exit(status);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) {
  main();
}
