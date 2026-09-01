#!/usr/bin/env node

/**
 * Backfill the `tripReportSubstances` join table from the stored `tripReports`
 * corpus so `tripReports:getBySubstanceNames` can answer through an index
 * instead of scanning the whole table on every article render.
 *
 * Idempotent: rows already in place are kept and stale ones removed, so the
 * script can be re-run after a partial pass. It calls two internal Convex
 * functions through the Convex CLI (`convex run`), which is the only channel
 * that can reach an internal function, using the deploy key bound to the
 * target deployment. The deployment named by TARGET_CONVEX_URL must match the
 * deployment the key reaches, or the script refuses to continue.
 *
 * Usage:
 *   TARGET_CONVEX_URL=https://glad-minnow-656.convex.cloud \
 *   node scripts/convex/backfill-trip-report-substance-index.mjs --dry-run
 *
 *   TARGET_CONVEX_URL=https://glad-minnow-656.convex.cloud \
 *   node scripts/convex/backfill-trip-report-substance-index.mjs \
 *     --write --confirm-trip-report-substance-index-backfill \
 *     --confirm-write=<operation-name> --expected-deployment=<fingerprint>
 *
 * The dry run prints the operation name and fingerprint the write requires.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { deploymentNameFromUrl } from "../lib/convex-function-inventory.mjs";
import {
  assertDataOpsWriteAllowed,
  createDataOpsRunContext,
  getFlagValue,
  printDataOpsRunContext,
  requireTargetUrl,
  updateAuditLog,
  writeAuditLog,
} from "../lib/data-ops-run-context.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CONFIRMATION_FLAG = "--confirm-trip-report-substance-index-backfill";
const DEPLOY_KEY_VARS = ["CONVEX_DEPLOY_KEY_PROD", "CONVEX_DEPLOY_KEY"];
const STATUS_FUNCTION = "tripReports:getSubstanceIndexBackfillStatus";
const BACKFILL_FUNCTION = "tripReports:backfillSubstanceIndex";
const DEFAULT_BATCH_SIZE = 50;
const MAX_PAGES = 10_000;

function parseOptions(argv) {
  const write = argv.includes("--write");
  if (write && argv.includes("--dry-run")) {
    throw new Error("Use either --dry-run or --write, not both.");
  }
  const batchSize = Number.parseInt(getFlagValue(argv, "--batch-size") ?? `${DEFAULT_BATCH_SIZE}`, 10);
  if (!Number.isInteger(batchSize) || batchSize < 1) {
    throw new Error("--batch-size must be a positive integer.");
  }
  return {
    write,
    targetUrl: getFlagValue(argv, "--target-url"),
    batchSize,
    help: argv.includes("--help") || argv.includes("-h"),
  };
}

function printHelp() {
  console.log(`Backfill the tripReportSubstances join table from tripReports.

Usage:
  node scripts/convex/backfill-trip-report-substance-index.mjs --target-url=<url> --dry-run
  node scripts/convex/backfill-trip-report-substance-index.mjs --target-url=<url> --write ${CONFIRMATION_FLAG} \\
    --confirm-write=<operation-name> --expected-deployment=<fingerprint>

Options:
  --target-url=<url>     Convex deployment (or set TARGET_CONVEX_URL)
  --write                Run the backfill (default is dry-run: status only)
  ${CONFIRMATION_FLAG}
                         Required with --write
  --batch-size=<n>       Reports per Convex mutation (default: ${DEFAULT_BATCH_SIZE}, max 200)

Requires ${DEPLOY_KEY_VARS.join(" or ")} for the target deployment; internal
functions are only reachable through the Convex CLI.
`);
}

function resolveDeployKey(env) {
  for (const variable of DEPLOY_KEY_VARS) {
    const value = env[variable]?.trim();
    if (value) return { variable, value };
  }
  return null;
}

function convexCli(deployKey, args, { maxBuffer = 64 * 1024 * 1024 } = {}) {
  return execFileSync("bunx", ["convex", ...args], {
    cwd: REPO_ROOT,
    env: { ...process.env, CONVEX_DEPLOY_KEY: deployKey, CONVEX_DEPLOYMENT: "" },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer,
  });
}

/**
 * `convex run` prints the function's return value as JSON on stdout, sometimes
 * preceded by CLI chatter; parse the last JSON document in the output.
 */
function parseRunOutput(raw, functionName) {
  const trimmed = raw.trim();
  const start = trimmed.search(/[{[]/);
  if (start === -1) {
    throw new Error(`convex run ${functionName} returned no JSON payload:\n${trimmed}`);
  }
  return JSON.parse(trimmed.slice(start));
}

function runFunction(deployKey, functionName, args) {
  const raw = convexCli(deployKey, ["run", functionName, JSON.stringify(args)]);
  return parseRunOutput(raw, functionName);
}

function assertKeyReachesTarget(deployKey, targetUrl) {
  const expected = deploymentNameFromUrl(targetUrl);
  const raw = convexCli(deployKey, ["function-spec"]);
  const reached = deploymentNameFromUrl(JSON.parse(raw).url);
  if (reached !== expected) {
    throw new Error(
      `The deploy key reaches "${reached}" but TARGET_CONVEX_URL names "${expected}". ` +
        "Fix the credential or the target before continuing.",
    );
  }
  const spec = JSON.parse(raw);
  const functions = new Set((spec.functions ?? []).map((fn) => fn.identifier));
  for (const required of [`${STATUS_FUNCTION.replace(":", ".js:")}`, `${BACKFILL_FUNCTION.replace(":", ".js:")}`]) {
    if (!functions.has(required)) {
      throw new Error(
        `${required} is not deployed on ${reached}. Deploy the Convex functions first ` +
          "(npm run convex:check-functions -- --prod, then npm run convex:deploy -- --prod).",
      );
    }
  }
  return reached;
}

function printStatus(label, status) {
  console.log(`${label}:`);
  console.log(`  reports:               ${status.reportCount}`);
  console.log(`  join rows:             ${status.joinRowCount}`);
  console.log(`  reports indexed:       ${status.indexedReportCount}`);
  console.log(`  reports missing rows:  ${status.reportsMissingRows}`);
  console.log(`  orphan rows:           ${status.orphanRows}`);
  console.log(`  indexed read active:   ${status.indexActive ? "yes" : "no (readers still scan the table)"}`);
}

const argv = process.argv.slice(2);
const options = parseOptions(argv);

if (options.help) {
  printHelp();
  process.exit(0);
}

const envWithCliOverrides = {
  ...process.env,
  ...(options.targetUrl ? { TARGET_CONVEX_URL: options.targetUrl } : {}),
};

const runContext = createDataOpsRunContext({
  operation: "backfill trip report substance index",
  intent: "trip-report-substance-index-backfill",
  argv,
  env: envWithCliOverrides,
  dryRunFlag: "--dry-run",
  executeFlag: "--write",
  requiresExecute: true,
  confirmationFlag: CONFIRMATION_FLAG,
  selectedTables: ["tripReports", "tripReportSubstances"],
  destructive: true,
});
if (!options.write) {
  runContext.dryRun = true;
  runContext.writeEnabled = false;
}

async function main() {
  printDataOpsRunContext(runContext);
  const targetUrl = requireTargetUrl(runContext);

  const deployKey = resolveDeployKey(envWithCliOverrides);
  if (!deployKey) {
    throw new Error(
      `No ${DEPLOY_KEY_VARS.join(" / ")} in the environment; internal functions can only be run through the Convex CLI with a deploy key.`,
    );
  }
  console.log(`Deploy key: ${deployKey.variable}`);
  const reached = assertKeyReachesTarget(deployKey.value, targetUrl);
  console.log(`Deployment: ${reached}`);

  const before = runFunction(deployKey.value, STATUS_FUNCTION, {});
  printStatus("Before", before);

  if (!options.write) {
    console.log("\nDry run: no rows written.");
    console.log(
      `To run: add --write ${CONFIRMATION_FLAG} --confirm-write=${runContext.operationName} --expected-deployment=${runContext.deploymentFingerprint}`,
    );
    return;
  }

  assertDataOpsWriteAllowed(runContext);

  const audit = writeAuditLog({
    operation: runContext.operation,
    intent: runContext.intent,
    mutations: [],
    repoRoot: REPO_ROOT,
  });
  console.log(`Audit log: ${audit.path}`);

  let cursor = null;
  let processed = 0;
  let inserted = 0;
  let removed = 0;
  let pages = 0;
  const limit = Math.min(options.batchSize, 200);

  for (; pages < MAX_PAGES; pages += 1) {
    const result = runFunction(deployKey.value, BACKFILL_FUNCTION, {
      ...(cursor ? { cursor } : {}),
      limit,
    });
    processed += result.processed;
    inserted += result.inserted;
    removed += result.removed;
    console.log(
      `  page ${pages + 1}: processed ${result.processed}, inserted ${result.inserted}, removed ${result.removed}`,
    );
    if (result.isDone) break;
    if (typeof result.cursor !== "string" || result.cursor.length === 0 || result.cursor === cursor) {
      throw new Error(`${BACKFILL_FUNCTION} did not advance its cursor.`);
    }
    cursor = result.cursor;
  }
  if (pages >= MAX_PAGES) {
    throw new Error(`${BACKFILL_FUNCTION} exceeded ${MAX_PAGES} pages without finishing.`);
  }

  const after = runFunction(deployKey.value, STATUS_FUNCTION, {});
  updateAuditLog(audit.path, {
    deployment: reached,
    processed,
    inserted,
    removed,
    pages: pages + 1,
    before,
    after,
  });

  console.log(`\nBackfill complete: processed ${processed}, inserted ${inserted}, removed ${removed}.`);
  printStatus("After", after);
  if (after.reportsMissingRows > 0 || after.orphanRows > 0) {
    console.warn("Warning: the join table still disagrees with the corpus; re-run the script.");
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`Backfill failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
