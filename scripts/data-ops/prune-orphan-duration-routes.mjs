#!/usr/bin/env node

/**
 * Remove phantom `duration.routes[]` entries — rows whose route has no counterpart
 * in `dosage.routes[]` and which are provably duplication artifacts rather than
 * curated data.
 *
 * The public renderer builds a route tab from the union of `dosage.routes` and
 * `duration.routes`, while the editor only draws a card per `dosage.routes` entry.
 * A duration-only route is therefore visible to readers but unreachable in the UI,
 * which is how these rows survived. See docs discussion in the route audit.
 *
 * This script only ever DELETES a duration route. It never merges, renames, or
 * edits stage values — those are content decisions that belong to a human.
 *
 * Every deletion is guarded by a precondition re-checked against live data at write
 * time, so a plan built against stale data fails closed instead of deleting the
 * wrong row.
 *
 * Usage:
 *   node scripts/data-ops/prune-orphan-duration-routes.mjs --plan=<path> --dry-run
 *   node scripts/data-ops/prune-orphan-duration-routes.mjs --plan=<path> --write \
 *     --confirm-orphan-route-prune
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

const CONFIRMATION_FLAG = "--confirm-orphan-route-prune";
const INTENT = "editorArticleWrite";

/** Route names are stored inconsistently cased ("Oral" vs "oral"). */
function normalizeRoute(value) {
  return String(value ?? "").trim().toLowerCase();
}

/**
 * Signature of everything about a route EXCEPT its name. Comparing only `stages`
 * would call two rows identical while one carried a route-specific `half_life`,
 * `half_life_notes`, or `reference_ids` that deletion would destroy.
 */
function routeSignature(route) {
  const { route: _name, ...rest } = route ?? {};
  const ordered = Object.keys(rest)
    .sort()
    .reduce((acc, key) => {
      acc[key] = rest[key];
      return acc;
    }, {});
  return JSON.stringify(ordered);
}

function isEmptyValue(value) {
  if (value === undefined || value === null || value === "") return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value).length === 0;
  return false;
}

/**
 * True when `candidate` carries no information that `twin` does not already hold:
 * identical stages, and every other field either equal to the twin's or empty.
 *
 * This is the honest test for the degraded duplicates in this dataset — rows with
 * the same timings as a real route but blank `half_life` / `half_life_notes`.
 * Deleting one loses nothing; the twin is strictly richer. A row holding any
 * non-empty value the twin lacks fails this test and is left alone.
 */
function carriesNoUniqueData(candidate, twin) {
  if (JSON.stringify(candidate?.stages ?? {}) !== JSON.stringify(twin?.stages ?? {})) {
    return false;
  }
  const keys = new Set([...Object.keys(candidate ?? {}), ...Object.keys(twin ?? {})]);
  keys.delete("route");
  keys.delete("stages");
  for (const key of keys) {
    const mine = candidate?.[key];
    const theirs = twin?.[key];
    if (JSON.stringify(mine) === JSON.stringify(theirs)) continue;
    if (isEmptyValue(mine)) continue;
    return false;
  }
  return true;
}

/**
 * Re-derive the facts that justified the deletion, against whatever the deployment
 * holds right now. A plan entry is only applied when its stated justification still
 * describes live data.
 */
function checkPreconditions(article, entry) {
  const durationRoutes = article?.duration?.routes ?? [];
  const dosageRoutes = article?.dosage?.routes ?? [];

  const matches = durationRoutes
    .map((route, index) => ({ route, index }))
    .filter(({ route }) => normalizeRoute(route.route) === normalizeRoute(entry.route));

  if (matches.length === 0) {
    return { ok: false, reason: `no duration route named "${entry.route}" remains` };
  }
  if (matches.length > 1) {
    return {
      ok: false,
      reason: `duration route "${entry.route}" is ambiguous (${matches.length} matches)`,
    };
  }

  const { route: target, index } = matches[0];

  // Guard: never delete a duration route that has a dosage counterpart. Those are
  // paired rows, not orphans, and removing one would strand a dosage table.
  const pairedDosage = dosageRoutes.some(
    (route) => normalizeRoute(route.route) === normalizeRoute(entry.route),
  );
  if (pairedDosage) {
    return { ok: false, reason: `"${entry.route}" now has a dosage counterpart — not an orphan` };
  }

  if (entry.justification === "identical_clone") {
    const twin = durationRoutes.find(
      (route, otherIndex) =>
        otherIndex !== index && routeSignature(route) === routeSignature(target),
    );
    if (!twin) {
      return {
        ok: false,
        reason: `"${entry.route}" is no longer byte-identical to a sibling route`,
      };
    }
    return { ok: true, index, detail: `clone of "${twin.route}"` };
  }

  if (entry.justification === "subset_clone") {
    const twin = durationRoutes.find(
      (route, otherIndex) => otherIndex !== index && carriesNoUniqueData(target, route),
    );
    if (!twin) {
      return {
        ok: false,
        reason: `"${entry.route}" now holds data no sibling route has — refusing to delete`,
      };
    }
    return { ok: true, index, detail: `carries nothing beyond "${twin.route}"` };
  }

  if (entry.justification === "contradicted_by_article") {
    // The justification is a claim about live prose, so re-check the prose rather
    // than trusting a string in the plan. If an editor has since rewritten the
    // note that declared this route inactive, the deletion no longer follows and
    // the entry is refused.
    if (!entry.quote_must_appear) {
      return { ok: false, reason: "plan entry lacks quote_must_appear" };
    }
    const prose = (dosageRoutes.map((route) => route.notes ?? "").join("\n") ?? "").replace(
      /\s+/g,
      " ",
    );
    const needle = String(entry.quote_must_appear).replace(/\s+/g, " ").trim();
    if (!prose.includes(needle)) {
      return {
        ok: false,
        reason: `article prose no longer contains the quote justifying this deletion`,
      };
    }
    return { ok: true, index, detail: "route declared inactive by article prose" };
  }

  return { ok: false, reason: `unknown justification "${entry.justification}"` };
}

function buildUpdatedArticle(article, index) {
  const clean = stripDataMetadata(article);
  return {
    ...clean,
    duration: {
      ...clean.duration,
      routes: (clean.duration?.routes ?? []).filter((_, i) => i !== index),
    },
  };
}

async function main() {
  const context = createDataOpsRunContext({
    operation: "prune-orphan-duration-routes",
    intent: INTENT,
    confirmationFlag: CONFIRMATION_FLAG,
    destructive: true,
  });
  printDataOpsRunContext(context);

  const planPath = getFlagValue(context.argv, "--plan");
  if (!planPath) {
    throw new Error("Missing --plan=<path to plan JSON>");
  }
  const plan = JSON.parse(readFileSync(resolve(planPath), "utf8"));
  if (!Array.isArray(plan) || plan.length === 0) {
    throw new Error("Plan must be a non-empty JSON array");
  }

  const targetUrl = requireTargetUrl(context);
  // requireAdminIntentToken returns a descriptor ({ token, envVar, source }), not
  // the bare secret the mutation validator expects.
  const adminKey = requireAdminIntentToken(INTENT).token;
  const client = createDataClient({ target: targetUrl }).client;

  console.log(`\nPlan: ${plan.length} duration route(s) to remove\n`);

  const applicable = [];
  const refused = [];

  for (const entry of plan) {
    const article = await client.query(api.substanceIndex.getBySlug, { slug: entry.slug });
    if (!article) {
      refused.push({ ...entry, reason: "substance not found" });
      continue;
    }
    const check = checkPreconditions(article, entry);
    if (!check.ok) {
      refused.push({ ...entry, reason: check.reason });
      continue;
    }
    applicable.push({ entry, article, index: check.index, detail: check.detail });
    console.log(
      `  OK   ${entry.slug.padEnd(22)} remove duration route "${entry.route}" — ${check.detail}`,
    );
  }

  for (const item of refused) {
    console.log(`  SKIP ${item.slug.padEnd(22)} ${item.reason}`);
  }

  console.log(
    `\n${applicable.length} applicable, ${refused.length} refused by preconditions.`,
  );

  if (!context.writeEnabled) {
    console.log(
      `\nDry run — no writes performed. Re-run with --write ${CONFIRMATION_FLAG} to apply.`,
    );
    return;
  }

  assertDataOpsWriteAllowed(context);

  const backup = await backupBeforeWrite({
    sourceClient: client,
    queryAll: () => getAllSubstanceDocuments(client, api.substanceIndex.getFullDocumentPage),
    label: "prune-orphan-duration-routes",
    repoRoot: context.repoRoot,
  });
  console.log(`\nBackup written: ${backup.path} (${backup.documentCount} documents)`);

  // The audit log is opened BEFORE the first mutation and updated after each one,
  // so a run that dies partway still leaves a durable record of what landed.
  const mutations = [];
  const failures = [];
  const audit = writeAuditLog({
    operation: "prune-orphan-duration-routes",
    intent: INTENT,
    mutations,
    repoRoot: context.repoRoot,
  });
  console.log(`Audit log: ${audit.path}\n`);

  try {
    for (const { entry } of applicable) {
      // Re-read immediately before writing. `saveSubstance` takes a whole document,
      // so writing a snapshot captured earlier in the run would silently revert any
      // edit made in between — and an index derived from that snapshot could point
      // at the wrong element. Re-reading also makes the run idempotent: a route
      // already removed by an earlier attempt simply fails its precondition.
      const fresh = await client.query(api.substanceIndex.getBySlug, { slug: entry.slug });
      if (!fresh) {
        console.log(`  SKIP ${entry.slug}: disappeared between plan and write`);
        continue;
      }
      const recheck = checkPreconditions(fresh, entry);
      if (!recheck.ok) {
        console.log(`  SKIP ${entry.slug}: ${recheck.reason} (changed since planning)`);
        continue;
      }

      const updated = buildUpdatedArticle(fresh, recheck.index);
      try {
        await client.mutation(api.substanceIndex.saveSubstance, {
          apiKey: adminKey,
          article: updated,
        });
      } catch (error) {
        // `saveSubstance` revalidates the WHOLE article, so a document that was
        // already violating the schema before this run rejects the write. That is a
        // pre-existing defect in that article, not a fault in this deletion — record
        // it and keep going rather than stranding the rest of the plan.
        const message = error instanceof Error ? error.message : String(error);
        // The first line is only a request id; the validator's reason follows it.
        const detail = message.replace(/\s+/g, " ").slice(0, 300);
        console.log(`  FAIL  ${entry.slug}: ${detail}`);
        failures.push({ slug: entry.slug, route: entry.route, error: message });
        updateAuditLog(audit.path, { mutations, failures });
        continue;
      }

      const before = fresh.duration.routes.length;
      const after = updated.duration.routes.length;
      console.log(`  wrote ${entry.slug}: duration.routes ${before} -> ${after}`);
      mutations.push({
        slug: entry.slug,
        removedRoute: entry.route,
        justification: entry.justification,
        detail: recheck.detail,
        routeCountBefore: before,
        routeCountAfter: after,
      });
      updateAuditLog(audit.path, { mutations });
    }
  } finally {
    updateAuditLog(audit.path, { mutations, failures, completed: mutations.length });
  }

  console.log(`\nApplied ${mutations.length} deletion(s). Audit log: ${audit.path}`);
  if (failures.length > 0) {
    console.log(`\n${failures.length} article(s) rejected the write:`);
    for (const failure of failures) {
      console.log(`  ${failure.slug} (${failure.route})`);
    }
    console.log("These articles already violate the substance schema; fix them separately, then re-run.");
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
