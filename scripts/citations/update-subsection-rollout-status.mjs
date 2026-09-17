#!/usr/bin/env node
/**
 * Transition rows in the subsection citation rollout tracker.
 *
 * Local tracker bookkeeping only; never touches the slug-level queue or
 * Postgres. Every transition records updatedAt (and runId when given) so the
 * tracker stays an auditable slug+section ledger.
 *
 * Usage:
 *   node scripts/citations/update-subsection-rollout-status.mjs \
 *     --slug=3-me-pcpy --section=pharmacology --status=researching --run-id=3-me-pcpy
 *   node scripts/citations/update-subsection-rollout-status.mjs \
 *     --all-slugs --section=tolerance --status=excluded --reason="outside rollout scope"
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  createDataOpsRunContext,
  getFlagValue,
  printDataOpsRunContext,
} from "../lib/data-ops-run-context.mjs";
import { TRACKER_STATUSES } from "./subsection-rollout-lib.mjs";
import { resolveCitationWorkbenchRoot } from "./citation-workbench-root.mjs";

const argv = process.argv.slice(2);
const help = argv.includes("--help") || argv.includes("-h");
const options = {
  help,
  dryRun: argv.includes("--dry-run"),
  allSlugs: argv.includes("--all-slugs"),
  tracker: getFlagValue(argv, "--tracker") ?? (help ? null : resolve(resolveCitationWorkbenchRoot(), "trackers", "subsection-rollout.json")),
  slug: getFlagValue(argv, "--slug"),
  section: getFlagValue(argv, "--section"),
  status: getFlagValue(argv, "--status"),
  runId: getFlagValue(argv, "--run-id"),
  reason: getFlagValue(argv, "--reason"),
};

if (options.help) {
  console.log(`
Transition subsection rollout tracker rows.

Usage:
  node scripts/citations/update-subsection-rollout-status.mjs \\
    (--slug=<slug> | --all-slugs) --section=<section> --status=<status> \\
    [--run-id=<id>] [--reason=<text>] [--dry-run]

Use --all-slugs for a section-wide policy transition. --status=excluded requires
--reason and prevents those rows from entering tracker-scoped exports.

Statuses: ${TRACKER_STATUSES.join(", ")}
`);
  process.exit(0);
}

for (const flag of ["section", "status"]) {
  if (!options[flag]) throw new Error(`--${flag} is required`);
}
if ((!options.slug && !options.allSlugs) || (options.slug && options.allSlugs)) {
  throw new Error("Choose exactly one of --slug=<slug> or --all-slugs.");
}
if (!TRACKER_STATUSES.includes(options.status)) {
  throw new Error(`Unknown status "${options.status}". Expected one of: ${TRACKER_STATUSES.join(", ")}`);
}
if (options.status === "excluded" && !options.reason) {
  throw new Error("--status=excluded requires --reason=<text>.");
}

const runContext = createDataOpsRunContext({
  operation: "update subsection citation rollout tracker status",
  intent: "citation-subsection-tracker",
  argv,
  sourceUrlKeys: [],
  targetUrlKeys: [],
  dryRunFlag: "--dry-run",
  executeFlag: null,
  localArtifacts: [options.tracker],
});

printDataOpsRunContext(runContext);

const trackerPath = resolve(options.tracker);
if (!existsSync(trackerPath)) throw new Error(`Tracker not found: ${trackerPath}`);
const tracker = JSON.parse(readFileSync(trackerPath, "utf8"));

const rows = (tracker.items ?? []).filter(
  (item) => item.section === options.section && (options.allSlugs || item.slug === options.slug),
);
if (rows.length === 0) {
  const scope = options.allSlugs ? `all slugs:${options.section}` : `${options.slug}:${options.section}`;
  throw new Error(`No tracker rows for ${scope}`);
}

const now = new Date().toISOString();
const transitions = [];
for (const row of rows) {
  const previous = row.status;
  row.status = options.status;
  row.updatedAt = now;
  if (options.runId) row.runId = options.runId;
  if (options.status === "researching" && options.runId) row.researchStartedAt = now;
  if (options.status === "applied") row.appliedAt = now;
  if (options.status === "verified") row.verifiedAt = now;
  if (options.status === "excluded") {
    row.excludedAt = now;
    row.exclusionReason = options.reason;
  } else {
    delete row.excludedAt;
    delete row.exclusionReason;
  }
  transitions.push({ row: `${row.slug}:${row.section}`, from: previous, to: options.status });
}
tracker.updatedAt = now;

console.log(JSON.stringify({
  outcome: options.dryRun ? "dry_run" : "updated",
  count: transitions.length,
  transitions,
  runId: options.runId ?? null,
  reason: options.reason ?? null,
}, null, 2));

if (!options.dryRun) {
  writeFileSync(trackerPath, `${JSON.stringify(tracker, null, 2)}\n`);
  console.log(`Tracker written: ${trackerPath}`);
}
