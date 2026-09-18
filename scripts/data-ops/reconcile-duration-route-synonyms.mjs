#!/usr/bin/env node

/**
 * Reconcile duration routes that name the same real-world route twice.
 *
 * Where `prune-orphan-duration-routes.mjs` removes rows that are provably
 * redundant, this script applies *editorial* decisions a human approved: rename a
 * duration route so it pairs with an existing dosage route, or fold one route's
 * timings into another and drop the husk.
 *
 * Because these are judgement calls rather than proofs, the guard rails are
 * tighter, not looser:
 *
 *   - `rename` refuses if the target name is already taken by another duration
 *     route, so it can never silently create a duplicate.
 *   - `merge` only fills stage fields that are EMPTY on the target. If both rows
 *     carry a value for the same stage and the values disagree, the merge is
 *     refused — a real conflict is a question for a human, not something to
 *     resolve by picking a side.
 *   - `drop` requires a written reason and reports exactly which stage values are
 *     being discarded, so a lost number is never invisible in the log.
 *
 * Usage:
 *   node scripts/data-ops/reconcile-duration-route-synonyms.mjs --plan=<path> --dry-run
 *   node scripts/data-ops/reconcile-duration-route-synonyms.mjs --plan=<path> --write \
 *     --confirm-duration-route-reconcile \
 *     --confirm-write=reconcile-duration-route-synonyms \
 *     --expected-deployment=<name>
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createDataClient } from "../lib/data-client.ts";

import { api } from "../../lib/postgres/runtime/api.ts";
import { getAllSubstanceDocuments } from "../lib/data-pagination.mjs";
import { assertDataOpsWriteAllowed,
backupBeforeWrite,
createDataOpsRunContext,
getFlagValue,
printDataOpsRunContext,
requireAdminIntentToken,
requireTargetUrl,  } from "../lib/data-ops-run-context.mjs"; import { updateAuditLog, writeAuditLog } from "../lib/data-ops-audit.mjs"
import { stripDataMetadata } from "../batch/summary/articles.mjs";

const CONFIRMATION_FLAG = "--confirm-duration-route-reconcile";
const INTENT = "editorArticleWrite";

const normalizeRoute = (value) => String(value ?? "").trim().toLowerCase();

const STAGE_KEYS = [
  "onset",
  "come_up",
  "peak",
  "offset",
  "after_effects",
  "total_duration",
];

function stageIsEmpty(stage) {
  return !stage || (stage.min === null && stage.max === null) ||
    (stage.min === undefined && stage.max === undefined);
}

function describeStage(stage) {
  if (stageIsEmpty(stage)) return "empty";
  return `${stage.min ?? "?"}-${stage.max ?? "?"} ${stage.unit ?? ""}`.trim();
}

function findRoute(routes, name) {
  const matches = routes
    .map((route, index) => ({ route, index }))
    .filter(({ route }) => normalizeRoute(route.route) === normalizeRoute(name));
  return matches.length === 1 ? matches[0] : null;
}

/**
 * Build the new duration array for one plan entry, or explain why it is refused.
 * Nothing here mutates the input.
 */
function planEntry(article, entry) {
  const routes = (article?.duration?.routes ?? []).map((route) => ({ ...route }));

  if (entry.op === "rename") {
    const found = findRoute(routes, entry.route);
    if (!found) return { ok: false, reason: `no single duration route named "${entry.route}"` };
    const collision = routes.some(
      (route, index) =>
        index !== found.index && normalizeRoute(route.route) === normalizeRoute(entry.to),
    );
    if (collision) {
      return { ok: false, reason: `"${entry.to}" already exists — rename would duplicate it` };
    }
    routes[found.index] = { ...found.route, route: entry.to };
    return { ok: true, routes, detail: `"${entry.route}" -> "${entry.to}"`, discarded: [] };
  }

  if (entry.op === "merge") {
    const from = findRoute(routes, entry.from);
    const into = findRoute(routes, entry.into);
    if (!from) return { ok: false, reason: `no single duration route named "${entry.from}"` };
    if (!into) return { ok: false, reason: `no single duration route named "${entry.into}"` };

    const merged = { ...into.route, stages: { ...into.route.stages } };
    const filled = [];
    const conflicts = [];
    for (const key of STAGE_KEYS) {
      const source = from.route.stages?.[key];
      const target = merged.stages?.[key];
      if (stageIsEmpty(source)) continue;
      if (stageIsEmpty(target)) {
        merged.stages[key] = source;
        filled.push(`${key}=${describeStage(source)}`);
        continue;
      }
      if (JSON.stringify(source) !== JSON.stringify(target)) {
        conflicts.push(
          `${key}: "${entry.from}" has ${describeStage(source)}, "${entry.into}" has ${describeStage(target)}`,
        );
      }
    }
    if (conflicts.length > 0) {
      return { ok: false, reason: `conflicting stage values — ${conflicts.join("; ")}` };
    }
    // Carry half-life prose across only when the target has none of its own.
    for (const key of ["half_life", "half_life_notes"]) {
      if (!merged[key] && from.route[key]) {
        merged[key] = from.route[key];
        filled.push(`${key}`);
      }
    }

    const next = routes
      .map((route, index) => (index === into.index ? merged : route))
      .filter((_, index) => index !== from.index);
    return {
      ok: true,
      routes: next,
      detail: `"${entry.from}" into "${entry.into}"${filled.length ? ` (filled ${filled.join(", ")})` : " (nothing to fill)"}`,
      discarded: [],
    };
  }

  if (entry.op === "drop") {
    if (!entry.reason) return { ok: false, reason: "drop entries require a written reason" };
    const found = findRoute(routes, entry.route);
    if (!found) return { ok: false, reason: `no single duration route named "${entry.route}"` };
    const discarded = STAGE_KEYS.filter((key) => !stageIsEmpty(found.route.stages?.[key])).map(
      (key) => `${key}=${describeStage(found.route.stages[key])}`,
    );
    return {
      ok: true,
      routes: routes.filter((_, index) => index !== found.index),
      detail: `drop "${entry.route}" — ${entry.reason}`,
      discarded,
    };
  }

  return { ok: false, reason: `unknown op "${entry.op}"` };
}

async function main() {
  const context = createDataOpsRunContext({
    operation: "reconcile-duration-route-synonyms",
    intent: INTENT,
    confirmationFlag: CONFIRMATION_FLAG,
    destructive: true,
  });
  printDataOpsRunContext(context);

  const planPath = getFlagValue(context.argv, "--plan");
  if (!planPath) throw new Error("Missing --plan=<path to plan JSON>");
  const plan = JSON.parse(readFileSync(resolve(planPath), "utf8"));
  if (!Array.isArray(plan) || plan.length === 0) {
    throw new Error("Plan must be a non-empty JSON array");
  }

  const targetUrl = requireTargetUrl(context);
  const adminKey = requireAdminIntentToken(INTENT).token;
  const client = createDataClient({ target: targetUrl }).client;

  console.log(`\nPlan: ${plan.length} operation(s)\n`);

  // A plan may touch the same article twice (drop a duplicate, then rename the
  // survivor into its place). The write loop re-reads between entries so it sees
  // the first change before applying the second; the preview has to simulate that
  // chain in memory, or it reports refusals that would never actually happen.
  const simulated = new Map();

  const previews = [];
  for (const entry of plan) {
    const stored = simulated.get(entry.slug)
      ?? (await client.query(api.substanceIndex.getBySlug, { slug: entry.slug }));
    const article = stored;
    if (!article) {
      console.log(`  SKIP ${entry.slug}: not found`);
      continue;
    }
    const result = planEntry(article, entry);
    if (!result.ok) {
      console.log(`  SKIP ${entry.slug}: ${result.reason}`);
      continue;
    }
    console.log(`  OK   ${entry.slug.padEnd(18)} ${result.detail}`);
    for (const value of result.discarded) {
      console.log(`         discards ${value}`);
    }
    console.log(
      `         duration routes: ${(article.duration.routes ?? []).map((r) => r.route).join(", ")}` +
        ` -> ${result.routes.map((r) => r.route).join(", ")}`,
    );
    simulated.set(entry.slug, {
      ...article,
      duration: { ...article.duration, routes: result.routes },
    });
    previews.push(entry);
  }

  console.log(`\n${previews.length} of ${plan.length} operation(s) applicable.`);

  if (!context.writeEnabled) {
    console.log(`\nDry run — no writes performed.`);
    return;
  }

  assertDataOpsWriteAllowed(context);

  const backup = await backupBeforeWrite({
    sourceClient: client,
    queryAll: () => getAllSubstanceDocuments(client, api.substanceIndex.getFullDocumentPage),
    label: "reconcile-duration-route-synonyms",
    repoRoot: context.repoRoot,
  });
  console.log(`\nBackup written: ${backup.path} (${backup.documentCount} documents)`);

  const applied = [];
  const failures = [];
  const audit = writeAuditLog({
    operation: "reconcile-duration-route-synonyms",
    intent: INTENT,
    mutations: applied,
    repoRoot: context.repoRoot,
  });
  console.log(`Audit log: ${audit.path}\n`);

  try {
    for (const entry of previews) {
      // Re-read per entry: `saveSubstance` writes a whole document, so a snapshot
      // taken earlier in the run would revert anything edited in between.
      const fresh = await client.query(api.substanceIndex.getBySlug, { slug: entry.slug });
      if (!fresh) {
        console.log(`  SKIP ${entry.slug}: disappeared between plan and write`);
        continue;
      }
      const result = planEntry(fresh, entry);
      if (!result.ok) {
        console.log(`  SKIP ${entry.slug}: ${result.reason} (changed since planning)`);
        continue;
      }

      const clean = stripDataMetadata(fresh);
      try {
        await client.mutation(api.substanceIndex.saveSubstance, {
          apiKey: adminKey,
          article: { ...clean, duration: { ...clean.duration, routes: result.routes } },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        // The first line is only a request id; the validator's reason follows it.
        const detail = message.replace(/\s+/g, " ").slice(0, 300);
        console.log(`  FAIL  ${entry.slug}: ${detail}`);
        failures.push({ slug: entry.slug, op: entry.op, error: message });
        updateAuditLog(audit.path, { mutations: applied, failures });
        continue;
      }

      console.log(`  wrote ${entry.slug}: ${result.detail}`);
      applied.push({
        slug: entry.slug,
        op: entry.op,
        detail: result.detail,
        discarded: result.discarded,
        routesAfter: result.routes.map((route) => route.route),
      });
      updateAuditLog(audit.path, { mutations: applied, failures });
    }
  } finally {
    updateAuditLog(audit.path, { mutations: applied, failures, completed: applied.length });
  }

  console.log(`\nApplied ${applied.length} operation(s). Audit log: ${audit.path}`);
  if (failures.length > 0) {
    console.log(`${failures.length} failed: ${failures.map((f) => f.slug).join(", ")}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
