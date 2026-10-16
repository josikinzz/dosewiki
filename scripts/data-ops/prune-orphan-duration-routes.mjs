#!/usr/bin/env node

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

function normalizeRoute(value) {
  return String(value ?? "").trim().toLowerCase();
}

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
        const message = error instanceof Error ? error.message : String(error);
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
