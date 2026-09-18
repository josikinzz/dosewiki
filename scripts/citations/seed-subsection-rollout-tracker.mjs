#!/usr/bin/env node
/**
 * Step 2 of the subsection citation rollout: seed (or merge into) the
 * dedicated slug+section rollout tracker in the citation workbench.
 *
 * Reads the refreshed audit ledger (step 1) and writes one row per viable
 * uncited cohort subsection. Existing rows keep their status and frozen
 * originalContentHash; live drift and externally resolved rows are reported,
 * never silently rewritten. The slug-level citation queue is left untouched.
 *
 * Usage:
 *   node scripts/citations/seed-subsection-rollout-tracker.mjs --dry-run
 *   node scripts/citations/seed-subsection-rollout-tracker.mjs
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { mkdirSync } from "node:fs";
import {
  createDataOpsRunContext,
  getFlagValue,
  printDataOpsRunContext,
} from "../lib/data-ops-run-context.mjs";
import { seedSubsectionTracker } from "./subsection-rollout-lib.mjs";
import { resolveCitationWorkbenchRoot } from "./citation-workbench-root.mjs";

const DEFAULT_AUDIT = "tmp/subsection-citation-audit.json";
const DEFAULT_TRACKER = "<DOSEWIKI_CITATION_WORKBENCH>/trackers/subsection-rollout.json";

function parseOptions(argv) {
  const help = argv.includes("--help") || argv.includes("-h");
  return {
    help,
    dryRun: argv.includes("--dry-run"),
    audit: getFlagValue(argv, "--audit") ?? DEFAULT_AUDIT,
    tracker: getFlagValue(argv, "--tracker") ?? (help ? DEFAULT_TRACKER : resolve(resolveCitationWorkbenchRoot(), "trackers", "subsection-rollout.json")),
    scope: getFlagValue(argv, "--scope") ?? "cohort",
  };
}

function printHelp() {
  console.log(`
Seed the subsection citation rollout tracker from a refreshed audit ledger.

Usage:
  node scripts/citations/seed-subsection-rollout-tracker.mjs [--scope=cohort|public] [--dry-run]

Options:
  --audit=<path>     Audit ledger from audit-subsection-citations.mjs
                     (default: ${DEFAULT_AUDIT})
  --tracker=<path>   Tracker output path (default: ${DEFAULT_TRACKER})
  --scope=cohort|public
                     Seed the tagged first cohort or every public gap
                     (default: cohort)
  --dry-run          Print the merge report without writing the tracker
  --help, -h         Show this message
`);
}

const argv = process.argv.slice(2);
const options = parseOptions(argv);

const runContext = createDataOpsRunContext({
  operation: "seed subsection citation rollout tracker",
  intent: "citation-subsection-tracker",
  argv,
  sourceUrlKeys: [],
  targetUrlKeys: [],
  dryRunFlag: "--dry-run",
  executeFlag: null,
  localArtifacts: [options.audit, options.tracker],
});

function main() {
  if (options.help) {
    printHelp();
    return;
  }

  printDataOpsRunContext(runContext);

  const auditPath = resolve(options.audit);
  if (!existsSync(auditPath)) {
    throw new Error(`Audit ledger not found: ${auditPath}. Run audit-subsection-citations.mjs first.`);
  }
  const audit = JSON.parse(readFileSync(auditPath, "utf8"));

  const trackerPath = resolve(options.tracker);
  const existingTracker = existsSync(trackerPath)
    ? JSON.parse(readFileSync(trackerPath, "utf8"))
    : null;

  const seededAt = new Date().toISOString();
  if (!["cohort", "public"].includes(options.scope)) {
    throw new Error(`Unsupported tracker scope "${options.scope}". Use cohort or public.`);
  }
  const { tracker, report } = seedSubsectionTracker({
    audit,
    existingTracker,
    seededAt,
    scope: options.scope,
  });
  tracker.sourceAudit.path = options.audit;

  console.log(JSON.stringify({
    outcome: options.dryRun ? "dry_run" : (existingTracker ? "merged" : "seeded"),
    tracker: trackerPath,
    items: tracker.items.length,
    skipped: tracker.skipped.length,
    report,
  }, null, 2));

  if (report.drifted.length > 0) {
    console.warn(`Live drift detected on tracked rows: ${report.drifted.join(", ")}. Frozen hashes kept for review.`);
  }
  if (report.noLongerGaps.length > 0) {
    console.warn(`Tracked rows no longer uncited gaps (left unchanged): ${report.noLongerGaps.join(", ")}`);
  }

  if (options.dryRun) {
    console.log("Dry run; tracker not written.");
    return;
  }
  mkdirSync(dirname(trackerPath), { recursive: true });
  writeFileSync(trackerPath, `${JSON.stringify(tracker, null, 2)}\n`);
  console.log(`Tracker written: ${trackerPath}`);
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exit(1);
}
