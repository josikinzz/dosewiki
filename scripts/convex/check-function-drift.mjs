#!/usr/bin/env node
/**
 * Answer "does this deployment actually have the functions this checkout calls?"
 * and fail when it does not.
 *
 * The app build never deploys Convex functions — `vercel.json` runs
 * `bun install` / `bun run build`, and `build` is plain `next build`. Functions
 * move only on an explicit `convex deploy`. A release can therefore ship a UI
 * that calls a mutation which exists locally and on dev but was never published
 * to production. Production redacts every error to a bare "Server Error", so
 * nothing at runtime can tell you which function is missing. Static comparison
 * is the only detection that works.
 *
 * Usage:
 *   node scripts/convex/check-function-drift.mjs                  # dev deployment
 *   node scripts/convex/check-function-drift.mjs --deployment=prod
 *   node scripts/convex/check-function-drift.mjs --spec-file=spec.json
 *   node scripts/convex/check-function-drift.mjs --prod --json
 *   node scripts/convex/check-function-drift.mjs --prod --skip-without-credentials
 *
 * Exit codes:
 *   0  no failing drift (warnings may still be printed)
 *   1  drift that breaks a caller
 *   2  could not reach the deployment (no usable deploy key, CLI failure)
 *
 * Read-only. It runs `convex function-spec`, never `convex deploy` and never a
 * mutation. It prints function names and a deployment name; never a secret.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildCallsiteIntegrityReport,
  buildDriftReport,
  driftFailures,
  driftWarnings,
  formatCallsiteIntegrityReport,
  formatDriftReport,
} from "../lib/convex-drift-report.mjs";
import { deploymentNameFromUrl } from "../lib/convex-function-inventory.mjs";
import { loadEnvFiles } from "../lib/data-ops-run-context.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/**
 * A deploy key is bound to one deployment, and the Convex CLI resolves its
 * target from the key ahead of `--prod` and `CONVEX_DEPLOYMENT`. Asking for the
 * wrong variable does not error — it quietly reports the other deployment.
 */
const DEPLOY_KEY_VARS = {
  dev: ["CONVEX_DEPLOY_KEY"],
  prod: ["CONVEX_DEPLOY_KEY_PROD"],
};

const EXPECTED_DEPLOYMENT_URL_VARS = {
  dev: ["VITE_CONVEX_URL", "NEXT_PUBLIC_CONVEX_URL"],
  prod: ["CONVEX_PUBLIC_READ_URL"],
};

function parseArgs(argv) {
  const args = {
    deployment: "dev",
    specFile: null,
    json: false,
    strict: false,
    skipWithoutCredentials: false,
    checkoutOnly: false,
  };
  for (const arg of argv.slice(2)) {
    if (arg === "--checkout-only") args.checkoutOnly = true;
    else if (arg === "--prod") args.deployment = "prod";
    else if (arg === "--dev") args.deployment = "dev";
    else if (arg.startsWith("--deployment=")) args.deployment = arg.slice("--deployment=".length);
    else if (arg.startsWith("--spec-file=")) args.specFile = arg.slice("--spec-file=".length);
    else if (arg === "--json") args.json = true;
    else if (arg === "--strict") args.strict = true;
    else if (arg === "--about-to-deploy") args.aboutToDeploy = true;
    else if (arg === "--skip-without-credentials") args.skipWithoutCredentials = true;
    else if (arg === "--help" || arg === "-h") args.help = true;
    else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(2);
    }
  }
  return args;
}

function printHelp() {
  console.log(
    [
      "Compare the Convex functions this checkout defines and calls against a deployment.",
      "",
      "  --deployment=dev|prod        which deployment to inspect (default: dev)",
      "  --prod | --dev               shorthand for the above",
      "  --checkout-only              needs no credential: only checks that every call",
      "                               site resolves to a function this checkout defines",
      "  --spec-file=<path>           diff against a saved `convex function-spec` JSON",
      "  --json                       machine-readable report on stdout",
      "  --strict                     treat warnings (silent-deletion risk) as failures",
      "  --about-to-deploy            a deploy of this checkout follows: functions missing",
      "                               from the deployment are the deploy's purpose, not a",
      "                               failure. Deletion-risk severity is unchanged.",
      "  --skip-without-credentials   exit 0 with a notice when no deploy key is present",
      "",
      "Read-only. Never deploys, never runs a mutation, never prints a secret.",
    ].join("\n"),
  );
}

function resolveDeployKey(deployment, env) {
  for (const key of DEPLOY_KEY_VARS[deployment] ?? []) {
    const value = env[key]?.trim();
    if (value) return { variable: key, value };
  }
  return null;
}

function expectedDeploymentName(deployment, env) {
  for (const key of EXPECTED_DEPLOYMENT_URL_VARS[deployment] ?? []) {
    const value = env[key]?.trim();
    if (value) return deploymentNameFromUrl(value);
  }
  return null;
}

/**
 * Ask the deployment for its own function list. `CONVEX_DEPLOYMENT` is cleared
 * so the key alone decides the target, and the payload's `url` is what we then
 * trust — never the flag the caller passed.
 */
function fetchFunctionSpec(deployKey) {
  return execFileSync("bunx", ["convex", "function-spec"], {
    cwd: REPO_ROOT,
    env: { ...process.env, CONVEX_DEPLOY_KEY: deployKey, CONVEX_DEPLOYMENT: "" },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 64 * 1024 * 1024,
  });
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    return;
  }

  if (args.checkoutOnly) {
    const report = buildCallsiteIntegrityReport({ repoRoot: REPO_ROOT });
    console.log(
      args.json ? JSON.stringify(report, null, 2) : formatCallsiteIntegrityReport(report),
    );
    if (report.danglingCallsites.length > 0) {
      console.error(
        `FAIL: ${report.danglingCallsites.length} call site(s) name a Convex function ` +
          "this checkout does not define.",
      );
      process.exit(1);
    }
    return;
  }

  if (!args.specFile && !DEPLOY_KEY_VARS[args.deployment]) {
    console.error(`Unknown deployment "${args.deployment}". Use dev or prod.`);
    process.exit(2);
  }

  loadEnvFiles({ rootDir: REPO_ROOT, env: process.env });

  let rawSpec;
  let requestedDeployment = null;

  if (args.specFile) {
    rawSpec = readFileSync(path.resolve(REPO_ROOT, args.specFile), "utf8");
  } else {
    const deployKey = resolveDeployKey(args.deployment, process.env);
    if (!deployKey) {
      const variables = DEPLOY_KEY_VARS[args.deployment].join(" or ");
      const message =
        `No deploy key for the ${args.deployment} deployment. ` +
        `Set ${variables} to compare against a live deployment.`;
      if (args.skipWithoutCredentials) {
        console.log(`Convex function drift check SKIPPED — ${message}`);
        console.log("The deployment half of this gate is NOT enforced in this run.");
        return;
      }
      console.error(message);
      process.exit(2);
    }

    requestedDeployment = expectedDeploymentName(args.deployment, process.env);
    try {
      rawSpec = fetchFunctionSpec(deployKey.value);
    } catch (error) {
      console.error(
        `Could not read the function spec using ${deployKey.variable}.\n` +
          "The key may belong to another deployment or have been revoked.\n" +
          `${error.stderr?.toString().trim() ?? error.message}`,
      );
      process.exit(2);
    }
  }

  const report = buildDriftReport({ repoRoot: REPO_ROOT, spec: rawSpec });
  const failures = driftFailures(report);
  const warnings = driftWarnings(report);

  if (args.json) {
    console.log(JSON.stringify({ ...report, failureCount: failures.length }, null, 2));
  } else {
    console.log(formatDriftReport(report, { requestedDeployment }));
  }

  if (failures.length > 0) {
    // As a standalone health check, a function the app calls but the deployment
    // lacks is broken production. As a PRE-DEPLOY gate it is the opposite: the
    // deploy about to run is what publishes it, and failing here would make it
    // impossible to ever ship a commit that introduces a new function — the
    // gate deadlocks against its own fix. `--about-to-deploy` encodes that
    // difference; deletion-risk warnings keep their severity either way.
    if (args.aboutToDeploy) {
      console.log(
        `NOTE: ${failures.length} function(s) the app calls are not on ` +
          `${report.deploymentName ?? "the deployment"} yet — the deploy this gate ` +
          "precedes will publish them.",
      );
    } else {
      console.error(
        `FAIL: ${failures.length} Convex function(s) the app calls are missing from ` +
          `${report.deploymentName ?? "the deployment"}.\n` +
          "Publish them with `bunx convex deploy` against that deployment, or remove the call.\n" +
          "Read docs/agents/deployment.md before deploying — deploy publishes the WORKING TREE.",
      );
      process.exit(1);
    }
  }

  if (args.strict && warnings.length > 0) {
    console.error(`FAIL (--strict): ${warnings.length} drift warning(s).`);
    process.exit(1);
  }
}

main();
