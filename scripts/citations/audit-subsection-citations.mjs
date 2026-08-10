#!/usr/bin/env node
/**
 * Step 1 of the subsection citation rollout: refresh the public-only
 * uncited-subsection audit from the live production Convex dataset.
 *
 * Read-only. Covers all six canonical citable sections (including tolerance)
 * for every article in the public category-layout scope, and tags the
 * first-rollout cohort (the 36 changed pharmacology slugs from the final
 * regeneration audit artifact).
 *
 * Usage:
 *   node scripts/citations/audit-subsection-citations.mjs
 *   node scripts/citations/audit-subsection-citations.mjs --out tmp/subsection-citation-audit.json
 *
 * Environment:
 *   SOURCE_CONVEX_URL / CONVEX_PUBLIC_READ_URL / VITE_CONVEX_URL ... selects the
 *   deployment to read (see scripts/lib/data-ops-run-context.mjs).
 *   CONVEX_ADMIN_KEY (optional) enables per-cohort citationEvidence status
 *   counts; without it evidence fields are null.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { getAllSubstanceDocuments } from "../lib/convex-pagination.mjs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api.js";
import {
  createDataOpsRunContext,
  getFlagValue,
  printDataOpsRunContext,
  requireSourceUrl,
} from "../lib/data-ops-run-context.mjs";
import { buildSubsectionAudit } from "./subsection-rollout-lib.mjs";

const DEFAULT_COHORT_AUDIT = "tmp/pharmacology-regeneration-43-final-audit.json";
const DEFAULT_QUEUE_PATH = `${homedir()}/.codex/dosewiki-citation-workbench/trackers/citation-queue.json`;
const DEFAULT_OUT = "tmp/subsection-citation-audit.json";

function parseOptions(argv) {
  return {
    help: argv.includes("--help") || argv.includes("-h"),
    out: getFlagValue(argv, "--out") ?? DEFAULT_OUT,
    cohortAudit: getFlagValue(argv, "--cohort-audit") ?? DEFAULT_COHORT_AUDIT,
    queuePath: getFlagValue(argv, "--queue-path") ?? DEFAULT_QUEUE_PATH,
    skipEvidence: argv.includes("--skip-evidence"),
  };
}

function printHelp() {
  console.log(`
Refresh the public-only subsection citation audit from live production.

Usage:
  node scripts/citations/audit-subsection-citations.mjs [--out <path>]

Options:
  --out=<path>           Audit ledger output (default: ${DEFAULT_OUT})
  --cohort-audit=<path>  Final regeneration audit artifact for cohort slugs
                         (default: ${DEFAULT_COHORT_AUDIT})
  --queue-path=<path>    Workbench slug queue for tracker status
                         (default: ${DEFAULT_QUEUE_PATH})
  --skip-evidence        Do not query citationEvidence (evidence fields null)
  --help, -h             Show this help message
`);
}

function cohortSlugsFromFinalAudit(path) {
  if (!existsSync(path)) {
    console.warn(`Cohort audit artifact not found: ${path}; cohort tagging disabled.`);
    return [];
  }
  const audit = JSON.parse(readFileSync(path, "utf8"));
  return (audit.rows ?? [])
    .filter((row) => Array.isArray(row.changedFields) && row.changedFields.length > 0)
    .map((row) => row.slug)
    .filter(Boolean);
}

function queueItemsFromPath(path) {
  if (!existsSync(path)) {
    console.warn(`Workbench queue not found: ${path}; queue status disabled.`);
    return [];
  }
  const queue = JSON.parse(readFileSync(path, "utf8"));
  return Array.isArray(queue.items) ? queue.items : [];
}

async function fetchCohortEvidence(client, cohortSlugs) {
  const apiKey = process.env.CONVEX_ADMIN_KEY;
  if (!apiKey) {
    console.warn("CONVEX_ADMIN_KEY not set; evidence status fields will be null.");
    return {};
  }
  const entries = [];
  for (const slug of cohortSlugs) {
    try {
      const rows = await client.query(api.citationEvidence.getBySlug, { slug, apiKey });
      entries.push([slug, rows]);
    } catch (error) {
      console.warn(`Evidence query failed for ${slug}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return Object.fromEntries(entries);
}

const argv = process.argv.slice(2);
const options = parseOptions(argv);

const runContext = createDataOpsRunContext({
  operation: "audit public subsection citation coverage",
  intent: "citation-subsection-audit",
  argv,
  sourceUrlKeys: [
    "SOURCE_CONVEX_URL",
    "CONVEX_PUBLIC_READ_URL",
    "VITE_CONVEX_URL",
    "CONVEX_URL",
    "NEXT_PUBLIC_CONVEX_URL",
  ],
  targetUrlKeys: [],
  dryRunFlag: null,
  executeFlag: null,
  localArtifacts: [options.out],
});

async function main() {
  if (options.help) {
    printHelp();
    return;
  }

  const sourceUrl = requireSourceUrl(runContext, "Convex audit source URL");
  printDataOpsRunContext(runContext);

  const client = new ConvexHttpClient(sourceUrl);
  const [articles, layout] = await Promise.all([
    getAllSubstanceDocuments(client, api.substanceIndex.getFullDocumentPage),
    client.query(api.categoryLayout.get, {}),
  ]);
  if (!articles.length) throw new Error("No articles found in the source Convex deployment.");
  if (!layout) throw new Error("No category layout found in the source Convex deployment.");

  const cohortSlugs = cohortSlugsFromFinalAudit(resolve(runContext.repoRoot, options.cohortAudit));
  const queueItems = queueItemsFromPath(options.queuePath);
  const evidenceBySlug = options.skipEvidence ? {} : await fetchCohortEvidence(client, cohortSlugs);

  const audit = buildSubsectionAudit({
    articles,
    layout,
    cohortSlugs,
    queueItems,
    evidenceBySlug,
    generatedAt: new Date().toISOString(),
    source: { convexUrl: sourceUrl },
  });

  const outPath = resolve(runContext.repoRoot, options.out);
  writeFileSync(outPath, `${JSON.stringify(audit, null, 2)}\n`);
  console.log(`Audit ledger: ${outPath}`);
  console.log(JSON.stringify({
    publicArticles: audit.totals.publicArticles,
    missingLayoutArticles: audit.totals.missingLayoutArticles.length,
    cohortArticles: audit.totals.cohortArticles,
    viableGaps: audit.totals.viableGaps,
    cohortViableGaps: audit.totals.cohortViableGaps,
    sections: audit.sections,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
