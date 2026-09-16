#!/usr/bin/env bun

/**
 * Merge transcribed dose and duration figures into the dosage and duration
 * sections, filling gaps only.
 *
 * Input is a transcript produced upstream, in which every figure carries the
 * verbatim source span it was taken from and that span has already been checked
 * against the source text. This script does not re-derive figures; it decides
 * where they are allowed to land.
 *
 * The merge is fill-only. An attested dose range or duration stage on the target
 * is never replaced by a transcribed one, because the target may hold a figure a
 * human reconciled or a source that is no longer in the excerpt set — the same
 * reasoning that makes `sync-dosage-duration-to-prod.mjs` refuse articles where
 * production is richer. Replacing a specific figure requires naming it:
 *
 *   --overwrite=<slug>:<route>:doses.<tier>
 *   --overwrite=<slug>:<route>:duration.<stage>
 *
 * There is deliberately no run-wide overwrite flag. Correcting a handful of
 * figures is a reviewed act; corrupting every dose ladder in a run should not be
 * one flag away.
 *
 * Run directory shape:
 *
 *   <run-dir>/dd/verified.json  ->  { "<slug>": { routes: [ { route, doses, duration, bioavailability, notes } ] } }
 *
 * where each dose tier / duration stage is either null or {min, max, unit}.
 *
 * Usage:
 *   bun scripts/data-ops/apply-dosage-duration-transcript.mjs --run-dir=<dir> --dry-run
 *   bun scripts/data-ops/apply-dosage-duration-transcript.mjs --run-dir=<dir> --write \
 *     --confirm-dosage-duration-merge \
 *     --confirm-write=apply-dosage-duration-transcript \
 *     --expected-deployment=<deployment-name>
 */

import { readFileSync } from "node:fs";
import { getAllSubstanceDocuments } from "../lib/data-pagination.mjs";
import { resolve } from "node:path";

import { createDataClient } from "../lib/data-client.ts";

import { api } from "../../lib/postgres/runtime/api.ts";
import { substanceArticleSchema } from "../../src/schema/substance.schema.ts";
import { stripDataMetadata } from "../batch/summary/articles.mjs";
import { assertDataOpsWriteAllowed,
backupBeforeWrite,
createDataOpsRunContext,
getFlagValue,
printDataOpsRunContext,
requireAdminIntentToken,
requireTargetUrl,  } from "../lib/data-ops-run-context.mjs"; import { updateAuditLog, writeAuditLog } from "../lib/data-ops-audit.mjs"

const OPERATION = "apply-dosage-duration-transcript";
const INTENT = "generatedPublicationWrite";

const TIERS = ["threshold", "light", "moderate", "strong", "heavy"];
const STAGES = ["onset", "come_up", "peak", "offset", "after_effects", "total_duration"];

const emptyRange = () => ({ min: null, max: null, unit: "" });
const isFilled = (value) => Boolean(value) && (value.min !== null || value.max !== null);
const normalizeRoute = (value) => String(value ?? "").trim().toLowerCase();
const toRange = (figure) => ({ min: figure.min ?? null, max: figure.max ?? null, unit: figure.unit ?? "" });

function collectFlagValues(argv, flag) {
  return argv
    .filter((arg) => arg.startsWith(`${flag}=`))
    .flatMap((arg) => arg.slice(flag.length + 1).split(","))
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

function planArticle({ article, transcript, slug, allowOverwrite }) {
  const next = structuredClone(article);
  next.dosage ??= { routes: [], plateau_dosing: null };
  next.dosage.routes ??= [];
  next.duration ??= { routes: [] };
  next.duration.routes ??= [];

  const changes = [];
  const permitted = (route, kind, key) =>
    allowOverwrite.has(`${slug}:${normalizeRoute(route)}:${kind}.${key}`.toLowerCase());

  const useful = transcript.routes.filter(
    (route) => TIERS.some((tier) => route.doses?.[tier]) || STAGES.some((stage) => route.duration?.[stage]),
  );

  for (const route of useful) {
    let dosageRoute = next.dosage.routes.find((entry) => normalizeRoute(entry.route) === normalizeRoute(route.route));
    if (!dosageRoute) {
      dosageRoute = {
        route: route.route,
        bioavailability: "",
        bioavailability_notes: "",
        dose_ranges: Object.fromEntries(TIERS.map((tier) => [tier, emptyRange()])),
        notes: "",
      };
      next.dosage.routes.push(dosageRoute);
      changes.push(`+dosage route ${route.route}`);
    }

    for (const tier of TIERS) {
      const figure = route.doses?.[tier];
      if (!figure) continue;
      if (isFilled(dosageRoute.dose_ranges[tier])) {
        if (!permitted(route.route, "doses", tier)) {
          changes.push(`kept ${route.route}/${tier} (already attested)`);
          continue;
        }
        changes.push(
          `REPLACED ${route.route}/${tier} ${JSON.stringify(dosageRoute.dose_ranges[tier])} -> ${JSON.stringify(toRange(figure))}`,
        );
      } else {
        changes.push(`${route.route}/${tier}`);
      }
      dosageRoute.dose_ranges[tier] = toRange(figure);
    }

    if (route.bioavailability?.value && !dosageRoute.bioavailability) {
      dosageRoute.bioavailability = route.bioavailability.value;
      changes.push(`${route.route}/bioavailability`);
    }
    if (route.notes && !dosageRoute.notes) dosageRoute.notes = route.notes;

    if (!STAGES.some((stage) => route.duration?.[stage])) continue;

    let durationRoute = next.duration.routes.find(
      (entry) => normalizeRoute(entry.route) === normalizeRoute(route.route),
    );
    if (!durationRoute) {
      durationRoute = {
        route: route.route,
        half_life: "",
        half_life_notes: "",
        stages: Object.fromEntries(STAGES.map((stage) => [stage, emptyRange()])),
      };
      next.duration.routes.push(durationRoute);
      changes.push(`+duration route ${route.route}`);
    }

    for (const stage of STAGES) {
      const figure = route.duration?.[stage];
      if (!figure) continue;
      if (isFilled(durationRoute.stages[stage])) {
        if (!permitted(route.route, "duration", stage)) {
          changes.push(`kept ${route.route}/${stage} (already attested)`);
          continue;
        }
        changes.push(`REPLACED ${route.route}/dur.${stage}`);
      } else {
        changes.push(`${route.route}/dur.${stage}`);
      }
      durationRoute.stages[stage] = toRange(figure);
    }
  }

  const mutating = changes.filter((change) => !change.startsWith("kept "));
  return { next, changes, mutating, validation: substanceArticleSchema.safeParse(next) };
}

async function main() {
  const context = createDataOpsRunContext({ operation: OPERATION, intent: INTENT, destructive: true });
  printDataOpsRunContext(context);

  const runDirectory = getFlagValue(context.argv, "--run-dir");
  if (!runDirectory) throw new Error(`${OPERATION} requires --run-dir=<dir>`);
  const onlySlug = getFlagValue(context.argv, "--slug");
  const allowOverwrite = new Set(collectFlagValues(context.argv, "--overwrite"));

  const transcriptPath = resolve(process.cwd(), runDirectory, "dd", "verified.json");
  const transcript = JSON.parse(readFileSync(transcriptPath, "utf-8"));
  const targetUrl = requireTargetUrl(context);
  const client = createDataClient({ target: targetUrl }).client;

  const entries = Object.entries(transcript).filter(([slug]) => !onlySlug || slug === onlySlug);
  console.log(`\n${entries.length} transcript(s) from ${transcriptPath}`);

  const work = [];
  const skipped = [];
  const invalid = [];

  for (const [slug, data] of entries) {
    const article = await client.query(api.substanceIndex.getBySlug, { slug });
    if (!article) {
      invalid.push({ slug, reason: "not found on target" });
      continue;
    }
    const plan = planArticle({ article, transcript: data, slug, allowOverwrite });
    if (plan.mutating.length === 0) {
      skipped.push({ slug, reason: "no attested figures to add" });
      continue;
    }
    if (!plan.validation.success) {
      invalid.push({
        slug,
        reason: plan.validation.error.issues
          .slice(0, 3)
          .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
          .join(" | "),
      });
      continue;
    }
    work.push({ slug, changes: plan.mutating });
    console.log(`  ${slug}: ${plan.mutating.join(", ")}`);
  }

  for (const entry of skipped) console.log(`  SKIP ${entry.slug}: ${entry.reason}`);
  for (const entry of invalid) console.log(`  INVALID ${entry.slug}: ${entry.reason}`);
  console.log(`\nplanned ${work.length} article(s), skipped ${skipped.length}, invalid ${invalid.length}`);

  if (!context.writeEnabled) {
    console.log("\nDry run — no writes performed.");
    return;
  }
  if (!context.argv.includes("--confirm-dosage-duration-merge")) {
    throw new Error(`${OPERATION} requires --confirm-dosage-duration-merge to write.`);
  }
  // Checked before the empty-work exit so a misaimed or under-flagged invocation
  // fails loudly rather than looking like a clean no-op run.
  assertDataOpsWriteAllowed(context);
  const adminKey = requireAdminIntentToken(INTENT).token;
  if (work.length === 0) {
    console.log("\nNothing to merge.");
    return;
  }

  const backup = await backupBeforeWrite({
    sourceClient: client,
    queryAll: () => getAllSubstanceDocuments(client, api.substanceIndex.getFullDocumentPage),
    label: OPERATION,
    repoRoot: context.repoRoot,
  });
  console.log(`\nBackup of TARGET written: ${backup.path} (${backup.documentCount} documents)`);

  const applied = [];
  const failures = [];
  const audit = writeAuditLog({ operation: OPERATION, intent: INTENT, mutations: applied, repoRoot: context.repoRoot });
  console.log(`Audit log: ${audit.path}\n`);

  for (const item of work) {
    try {
      // Recomputed against a fresh read: saveSubstance replaces the whole
      // document, and a figure filled since planning must stay filled.
      const fresh = await client.query(api.substanceIndex.getBySlug, { slug: item.slug });
      if (!fresh) {
        failures.push({ slug: item.slug, error: "disappeared before write" });
        updateAuditLog(audit.path, { mutations: applied, failures });
        continue;
      }
      const plan = planArticle({
        article: fresh,
        transcript: transcript[item.slug],
        slug: item.slug,
        allowOverwrite,
      });
      if (plan.mutating.length === 0 || !plan.validation.success) {
        console.log(`  SKIP ${item.slug}: changed since planning`);
        continue;
      }

      await client.mutation(api.substanceIndex.saveSubstance, {
        apiKey: adminKey,
        article: stripDataMetadata(plan.next),
      });
      applied.push({ slug: item.slug, changes: plan.mutating, backupPath: backup.path });
      updateAuditLog(audit.path, { mutations: applied, failures });
      console.log(`  wrote ${item.slug}: ${plan.mutating.join(", ")}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push({ slug: item.slug, error: message });
      updateAuditLog(audit.path, { mutations: applied, failures });
      console.log(`  FAIL ${item.slug}: ${message}`);
    }
  }

  updateAuditLog(audit.path, { mutations: applied, failures, completed: applied.length });
  console.log(`\nMerged ${applied.length} article(s). Audit log: ${audit.path}`);
  if (failures.length > 0) {
    console.log(`${failures.length} failed: ${failures.map((failure) => failure.slug).join(", ")}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
