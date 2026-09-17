#!/usr/bin/env bun

/**
 * Publish generated article sections from a reviewed run directory.
 *
 * The generation side of this workflow (prompt assembly, batched generation,
 * schema validation) happens elsewhere; this script only takes drafts that have
 * already been validated and writes them to a deployment. It exists so that
 * publishing is a guarded, audited, reversible operation rather than an ad-hoc
 * one.
 *
 * The central guard is that a section is written only when the live section is
 * empty. Generated prose must never displace authored prose, and "empty" is the
 * only condition under which that is guaranteed. Overwriting a populated section
 * requires naming it explicitly, one `slug:section` pair at a time — there is
 * deliberately no run-wide overwrite flag, because the blast radius of one is
 * every article in the run.
 *
 * Run directory shape — one file per section, as written by the validation step:
 *
 *   <run-dir>/<slug>__<section>.json   ->  { slug, section, value }
 *
 * Usage:
 *   bun scripts/data-ops/apply-generated-sections.mjs --run-dir=<dir> --dry-run
 *   bun scripts/data-ops/apply-generated-sections.mjs --run-dir=<dir> --slug=meai --dry-run
 *   bun scripts/data-ops/apply-generated-sections.mjs --run-dir=<dir> --write \
 *     --confirm-generated-publication \
 *     --confirm-write=apply-generated-sections \
 *     --expected-deployment=<deployment-name>
 *
 *   # Replace one already-populated section, named explicitly:
 *   ... --overwrite=meai:summary --overwrite=ur-144:pharmacology
 */

import { readdirSync, readFileSync } from "node:fs";
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

const OPERATION = "apply-generated-sections";
const INTENT = "generatedPublicationWrite";

/** Sections this script is allowed to publish. */
const PUBLISHABLE = new Set([
  "summary",
  "pharmacology",
  "subjective_effects",
  "history_culture",
  "tolerance",
  "legality",
  "harm_potential",
]);

/**
 * A section counts as populated when any leaf under it holds content. An object
 * of empty strings is empty; one filled field anywhere makes it authored.
 */
function hasContent(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.values(value).some(hasContent);
  return true;
}

function collectFlagValues(argv, flag) {
  return argv
    .filter((arg) => arg.startsWith(`${flag}=`))
    .flatMap((arg) => arg.slice(flag.length + 1).split(","))
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

function loadDrafts(runDirectory) {
  const directory = resolve(process.cwd(), runDirectory);
  const drafts = [];
  for (const fileName of readdirSync(directory).filter((name) => name.endsWith(".json")).sort()) {
    const parsed = JSON.parse(readFileSync(resolve(directory, fileName), "utf-8"));
    if (!parsed?.slug || !parsed?.section) {
      throw new Error(`${fileName}: expected { slug, section, value }`);
    }
    if (!PUBLISHABLE.has(parsed.section)) {
      throw new Error(`${fileName}: section "${parsed.section}" is not publishable by this script`);
    }
    drafts.push(parsed);
  }
  return drafts;
}

function planArticle({ article, drafts, allowOverwrite }) {
  const next = structuredClone(article);
  const writes = [];
  const held = [];

  for (const draft of drafts) {
    // A draft can be legitimately empty — a section whose sources said nothing
    // quantitative yields the empty structure, which is a correct result. Every
    // section already exists in its empty form, so publishing one writes nothing
    // and would otherwise re-plan on every subsequent run.
    if (!hasContent(draft.value)) {
      held.push({ section: draft.section, reason: "draft is empty; section already holds its empty form" });
      continue;
    }
    const populated = hasContent(article[draft.section]);
    const permitted = allowOverwrite.has(`${draft.slug}:${draft.section}`.toLowerCase());
    if (populated && !permitted) {
      held.push({ section: draft.section, reason: "live section already has content" });
      continue;
    }
    next[draft.section] = draft.value;
    writes.push({ section: draft.section, replaced: populated });
  }

  return { next, writes, held, validation: substanceArticleSchema.safeParse(next) };
}

async function main() {
  const context = createDataOpsRunContext({ operation: OPERATION, intent: INTENT, destructive: true });
  printDataOpsRunContext(context);

  const runDirectory = getFlagValue(context.argv, "--run-dir");
  if (!runDirectory) throw new Error(`${OPERATION} requires --run-dir=<dir>`);

  const onlySlug = getFlagValue(context.argv, "--slug");
  const allowOverwrite = new Set(collectFlagValues(context.argv, "--overwrite"));
  const targetUrl = requireTargetUrl(context);
  const client = createDataClient({ target: targetUrl }).client;

  const drafts = loadDrafts(runDirectory).filter((draft) => !onlySlug || draft.slug === onlySlug);
  if (drafts.length === 0) throw new Error(`No drafts found in ${runDirectory}${onlySlug ? ` for ${onlySlug}` : ""}`);

  const bySlug = new Map();
  for (const draft of drafts) {
    if (!bySlug.has(draft.slug)) bySlug.set(draft.slug, []);
    bySlug.get(draft.slug).push(draft);
  }
  console.log(`\n${drafts.length} draft section(s) across ${bySlug.size} article(s) from ${runDirectory}`);

  const work = [];
  const held = [];
  const invalid = [];

  for (const [slug, slugDrafts] of bySlug) {
    const article = await client.query(api.substanceIndex.getBySlug, { slug });
    if (!article) {
      invalid.push({ slug, reason: "not found on target" });
      continue;
    }
    const plan = planArticle({ article, drafts: slugDrafts, allowOverwrite });
    for (const entry of plan.held) held.push({ slug, ...entry });
    if (plan.writes.length === 0) continue;
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
    work.push({ slug, writes: plan.writes });
    for (const entry of plan.writes) {
      console.log(`  ${entry.replaced ? "REPLACE" : "fill"} ${slug}.${entry.section}`);
    }
  }

  for (const entry of held) console.log(`  HELD ${entry.slug}.${entry.section}: ${entry.reason}`);
  for (const entry of invalid) console.log(`  INVALID ${entry.slug}: ${entry.reason}`);
  console.log(`\nplanned ${work.length} article(s), held ${held.length}, invalid ${invalid.length}`);

  if (!context.writeEnabled) {
    console.log("\nDry run — no writes performed.");
    return;
  }
  if (!context.argv.includes("--confirm-generated-publication")) {
    throw new Error(`${OPERATION} requires --confirm-generated-publication to write.`);
  }
  // Checked before the empty-work exit so a misaimed or under-flagged invocation
  // fails loudly rather than looking like a clean no-op run.
  assertDataOpsWriteAllowed(context);
  const adminKey = requireAdminIntentToken(INTENT).token;
  if (work.length === 0) {
    console.log("\nNothing to publish.");
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
      // saveSubstance replaces the whole document, so the plan is recomputed
      // against a fresh read; a snapshot from planning time would silently
      // revert any edit made in between.
      const fresh = await client.query(api.substanceIndex.getBySlug, { slug: item.slug });
      if (!fresh) {
        failures.push({ slug: item.slug, error: "disappeared before write" });
        updateAuditLog(audit.path, { mutations: applied, failures });
        continue;
      }
      const plan = planArticle({
        article: fresh,
        drafts: bySlug.get(item.slug),
        allowOverwrite,
      });
      if (plan.writes.length === 0 || !plan.validation.success) {
        console.log(`  SKIP ${item.slug}: changed since planning`);
        continue;
      }

      await client.mutation(api.substanceIndex.saveSubstance, {
        apiKey: adminKey,
        article: stripDataMetadata(plan.next),
      });
      applied.push({ slug: item.slug, sections: plan.writes, backupPath: backup.path });
      updateAuditLog(audit.path, { mutations: applied, failures });
      console.log(`  wrote ${item.slug}: ${plan.writes.map((entry) => entry.section).join(", ")}`);
    } catch (error) {
      // Postgres's first error line is only a request id; the reason follows it.
      const message = error instanceof Error ? error.message : String(error);
      failures.push({ slug: item.slug, error: message });
      updateAuditLog(audit.path, { mutations: applied, failures });
      console.log(`  FAIL ${item.slug}: ${message}`);
    }
  }

  updateAuditLog(audit.path, { mutations: applied, failures, completed: applied.length });
  console.log(`\nPublished ${applied.length} article(s). Audit log: ${audit.path}`);
  if (failures.length > 0) {
    console.log(`${failures.length} failed: ${failures.map((failure) => failure.slug).join(", ")}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
