#!/usr/bin/env node
/**
 * Reshape a published trip report that arrived as one flat body into the
 * corpus's standard `introduction` / onset / peak / offset / `conclusion` record.
 *
 * The reshaping is pure text movement, and this command refuses to write unless
 * it can prove that: the record is rebuilt back into a single body with
 * `reconstructBody`, and the result must equal the stored body character for
 * character. The same proof runs again against what Postgres actually stored, so a
 * successful run ends with evidence rather than an assumption. The phase
 * boundaries come from a small plan file, because deciding where the peak begins
 * is editorial judgement and does not belong in a parser.
 *
 * Usage:
 *   node scripts/reports/format-flat-trip-report.mjs --slug=ego-rebirth --dry-run
 *   TARGET_POSTGRES_URL=postgresql://localhost/dosewiki \
 *     node scripts/reports/format-flat-trip-report.mjs --slug=ego-rebirth --write \
 *     --confirm-write=format-flat-trip-report --expected-deployment=localhost/dosewiki
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { createDataClient, postgresFingerprintFromUrl } from "../lib/data-client.ts";

import { api } from "../../lib/postgres/runtime/api.ts";
import {
  assertDataOpsWriteAllowed,
  createDataOpsRunContext,
  getFlagValue,
  printDataOpsRunContext,
  requireAdminIntentToken,
  requireTargetUrl,
} from "../lib/data-ops-run-context.mjs";
import { assertLossless, formatFlatBody, reconstructBody, summarize } from "./flatTripReportTimeline.mjs";

const PHASES = ["onset", "peak", "offset"];

function fail(message) {
  console.error(message);
  process.exit(1);
}

function loadPlan(repoRoot, slug, planFlag) {
  const planPath = planFlag ?? path.join("scripts/reports/timeline-plans", `${slug}.json`);
  let plan;
  try {
    plan = JSON.parse(readFileSync(path.resolve(repoRoot, planPath), "utf8"));
  } catch (error) {
    fail(`Cannot read plan ${planPath}: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (plan.slug && plan.slug !== slug) {
    fail(`Plan ${planPath} is written for ${plan.slug}, not ${slug}.`);
  }
  return { planPath, plan };
}

/** One-line preview of an entry, so a dry run is reviewable without a diff tool. */
function previewEntry(entry) {
  const firstLine = entry.description.split("\n", 1)[0];
  const text = firstLine.length > 96 ? `${firstLine.slice(0, 96)}…` : firstLine;
  return `      ${entry.time ?? "(no time)"} — ${text}`;
}

function printPlanPreview(record) {
  const summary = summarize(record);
  console.log(`\nIntroduction: ${summary.introductionCharacters} characters`);
  for (const phase of summary.phases) {
    console.log(`  ${phase.phase}: ${phase.entries} entr${phase.entries === 1 ? "y" : "ies"}`);
    for (const entry of record[phase.phase]) {
      console.log(previewEntry(entry));
    }
  }
  console.log(`Conclusion: ${summary.conclusionCharacters} characters`);
}

async function main() {
  const argv = process.argv.slice(2);
  const slug = getFlagValue(argv, "--slug");
  if (!slug) {
    fail("Usage: --slug=<report-slug> [--plan=<path>] [--dry-run | --write --confirm-write=… --expected-deployment=…]");
  }

  const runContext = createDataOpsRunContext({
    operation: "format flat trip report",
    intent: "editorArticleWrite",
    argv,
    sourceUrlKeys: [],
  });

  const { planPath, plan } = loadPlan(runContext.repoRoot, slug, getFlagValue(argv, "--plan"));
  runContext.localArtifacts = [planPath];
  printDataOpsRunContext(runContext);

  const targetUrl = requireTargetUrl(runContext);
  const client = createDataClient({ target: targetUrl }).client;

  const stored = await client.query(api.tripReports.getBySlug, { slug });
  if (!stored) {
    fail(`No trip report is published at slug ${slug}.`);
  }

  const alreadyTimelined = PHASES.filter((phase) => (stored[phase] ?? []).length > 0);
  if (alreadyTimelined.length > 0) {
    fail(
      `${slug} already has timeline entries (${alreadyTimelined.join(", ")}); ` +
        "this command only reshapes a report whose body is still one flat block.",
    );
  }
  if (stored.conclusion) {
    fail(`${slug} already has a conclusion; refusing to overwrite it.`);
  }

  const body = stored.introduction ?? "";
  const record = formatFlatBody({
    body,
    peakFrom: plan.peakFrom,
    offsetFrom: plan.offsetFrom,
    conclusionFrom: plan.conclusionFrom,
  });

  const proof = assertLossless(body, record);
  console.log(`\n${slug}: reshaped body reproduces the original exactly (${proof.characters} characters).`);
  printPlanPreview(record);

  if (!runContext.writeEnabled) {
    console.log(`\n[DRY RUN] would reshape ${slug} on ${postgresFingerprintFromUrl(targetUrl)}. Nothing was written.`);
    return;
  }

  assertDataOpsWriteAllowed(runContext);
  const apiKey = requireAdminIntentToken("editorArticleWrite").token;

  // Snapshot the pre-write row before anything is sent. The post-write proof
  // below can only tell the operator that storage stopped matching the author's
  // text; this file is what they restore it from.
  const snapshotPath = path.join(
    runContext.repoRoot,
    "outputs/trip-report-reshape",
    `${slug}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
  );
  mkdirSync(path.dirname(snapshotPath), { recursive: true });
  writeFileSync(snapshotPath, `${JSON.stringify(stored, null, 2)}\n`);
  console.log(`\nOriginal saved to ${path.relative(runContext.repoRoot, snapshotPath)}`);

  // The portal record is the snapshot the mutation re-derives for its
  // optimistic-concurrency check, so `expected` is byte-identical by
  // construction rather than by a second local normalizer.
  const portal = await client.query(api.tripReports.getPortalRecord, { apiKey, slug });
  const expected = portal.fields;

  const updates = {
    title: expected.title,
    subject: expected.subject,
    substances: expected.substances,
    introduction: record.introduction,
    onset: record.onset,
    peak: record.peak,
    offset: record.offset,
    conclusion: record.conclusion,
    tags: expected.tags,
  };

  await client.mutation(api.tripReports.update, { apiKey, id: portal.id, expected, expectedRevision: portal.revision, updates, operationId: crypto.randomUUID() });

  // Re-read and re-prove. A write that succeeded is not yet evidence that
  // storage still spells the author's text.
  const written = await client.query(api.tripReports.getBySlug, { slug });
  const rebuilt = reconstructBody(written);
  if (rebuilt !== body) {
    fail(
      `${slug}: WROTE, but stored text no longer reproduces the original body. ` +
        `Restore it from ${path.relative(runContext.repoRoot, snapshotPath)} before continuing.`,
    );
  }

  const counts = PHASES.map((phase) => `${phase} ${written[phase].length}`).join(", ");
  console.log(`\n${slug}: applied (${counts}); stored text reproduces the original body exactly.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
