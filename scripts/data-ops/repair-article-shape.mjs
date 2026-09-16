#!/usr/bin/env bun

/**
 * Repair only absent values that violate the substance article contract.
 *
 * This script deliberately refuses to reinterpret real content. It replaces
 * `null`, missing, or otherwise empty values only when the Zod issue path has
 * a known empty value in `src/schema/substance/`. A replacement is saved only
 * after the complete article validates locally.
 *
 * Usage:
 *   bun scripts/data-ops/repair-article-shape.mjs --dry-run
 *   bun scripts/data-ops/repair-article-shape.mjs --slug=alpha-pcyp --dry-run
 *   bun scripts/data-ops/repair-article-shape.mjs --write \
 *     --confirm-write=repair-article-shape \
 *     --expected-deployment=<deployment-name>
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { createDataClient } from "../lib/data-client.ts";

import { api } from "../../lib/postgres/runtime/api.ts";
import {
  getAllSubstanceDocuments,
  getUniqueSubstanceDocumentBySlug,
} from "../lib/data-pagination.mjs";
import { planBindingSiteMigration } from "../../lib/article/normalization.mjs";
import { substanceArticleSchema } from "../../src/schema/substance.schema.ts";
import { stripDataMetadata } from "../batch/summary/articles.mjs";
import { assertDataOpsWriteAllowed,
createDataOpsRunContext,
getFlagValue,
printDataOpsRunContext,
requireAdminIntentToken,
requireTargetUrl,  } from "../lib/data-ops-run-context.mjs"; import { updateAuditLog, writeAuditLog } from "../lib/data-ops-audit.mjs"

const INTENT = "editorArticleWrite";
const SENSES = ["visual", "auditory", "tactile", "olfactory", "gustatory", "multisensory"];

const emptySenseCategory = () => ({ note: "", subcategories: {} });
const emptySensory = () => Object.fromEntries(SENSES.map((sense) => [sense, emptySenseCategory()]));
const emptyNotes = () => ({ overview: "", sensory: "", cognitive: "", physical: "" });
const emptyDurationStage = () => ({ min: null, max: null, unit: "" });

/**
 * Every entry corresponds directly to a required field in the contract. Array
 * indices are normalized to `[]` before lookup so route defects use one rule.
 */
const EMPTY_VALUE_FACTORIES = new Map([
  ["summary", () => ""],
  ["identification.substitutive_name", () => ""],
  ["identification.iupac_name", () => ""],
  ["identification.alternative_names", () => []],
  ["identification.smiles", () => ""],
  ["identification.inchi_key", () => ""],
  ["identification.cas_number", () => ""],
  ["identification.molecular_formula", () => ""],
  ["identification.molecular_weight", () => ""],
  ["identification.skeletal_structure_image", () => ""],
  ["subjective_effects.notes", emptyNotes],
  ["subjective_effects.sensory", emptySensory],
  ...SENSES.map((sense) => [`subjective_effects.sensory.${sense}`, emptySenseCategory]),
  ["subjective_effects.cognitive", () => ({})],
  ["subjective_effects.physical", () => ({})],
  ["subjective_effects.progressive_stages", () => ({})],
  ["pharmacology.binding_sites", () => []],
  ["pharmacology.pharmacokinetics", () => ""],
  ["pharmacology.metabolites", () => []],
  ["pharmacology.half_life", () => ""],
  ["reagent_testing", () => ({})],
  ["tolerance.full_tolerance", () => ""],
  ["tolerance.half_tolerance", () => ""],
  ["tolerance.baseline_tolerance", () => ""],
  ["dosage.routes.[].bioavailability", () => ""],
  ["dosage.routes.[].notes", () => ""],
  ["duration.routes.[].stages.onset", emptyDurationStage],
  ["duration.routes.[].stages.come_up", emptyDurationStage],
  ["duration.routes.[].stages.peak", emptyDurationStage],
  ["duration.routes.[].stages.offset", emptyDurationStage],
  ["duration.routes.[].stages.after_effects", emptyDurationStage],
  ["duration.routes.[].stages.total_duration", emptyDurationStage],
]);

function formatPath(path) {
  return path.reduce(
    (formatted, part) => (typeof part === "number" ? `${formatted}[${part}]` : formatted ? `${formatted}.${part}` : part),
    "",
  );
}

function normalizePath(path) {
  return path.map((part) => (typeof part === "number" ? "[]" : part)).join(".");
}

function getAtPath(value, path) {
  let current = value;
  for (const part of path) {
    if (current === null || current === undefined) return undefined;
    current = current[part];
  }
  return current;
}

function setAtPath(value, path, replacement) {
  let current = value;
  for (let index = 0; index < path.length - 1; index += 1) {
    const part = path[index];
    const nextPart = path[index + 1];
    if (current[part] === null || current[part] === undefined) {
      current[part] = typeof nextPart === "number" ? [] : {};
    }
    current = current[part];
  }
  current[path.at(-1)] = replacement;
}

function hasNonEmptyContent(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.values(value).some(hasNonEmptyContent);
  return true;
}

function isCoveredBy(existingPaths, path) {
  return existingPaths.some(
    (existing) => existing.length <= path.length && existing.every((part, index) => part === path[index]),
  );
}

function planRepair(article) {
  const validation = substanceArticleSchema.safeParse(article);
  if (validation.success) {
    return { validation, patches: [], refused: [], unrepaired: [] };
  }

  const bindingSitePlan = planBindingSiteMigration(article.pharmacology);
  if (bindingSitePlan.needsMigration) {
    return {
      validation,
      repaired: article,
      repairedValidation: validation,
      patches: [],
      refused: [{
        path: "pharmacology",
        currentValue: article.pharmacology,
        reason: "Run migrate-pharmacology-schema before generic shape repair.",
      }],
      unrepaired: [],
    };
  }

  const repaired = structuredClone(article);
  const patches = [];
  const refused = [];
  const unrepaired = [];
  const patchedPaths = [];

  for (const issue of validation.error.issues) {
    const path = issue.path;
    const fieldPath = formatPath(path);
    const normalizedPath = normalizePath(path);
    const factory = EMPTY_VALUE_FACTORIES.get(normalizedPath);
    const currentValue = getAtPath(article, path);

    if (isCoveredBy(patchedPaths, path)) continue;
    if (hasNonEmptyContent(currentValue)) {
      refused.push({ path: fieldPath, currentValue, reason: issue.message });
      continue;
    }
    if (!factory) {
      unrepaired.push({ path: fieldPath, currentValue, reason: issue.message });
      continue;
    }

    const replacement = factory();
    setAtPath(repaired, path, replacement);
    patches.push({ path: fieldPath, schemaPath: normalizedPath, replacement });
    patchedPaths.push(path);
  }

  const repairedValidation = substanceArticleSchema.safeParse(repaired);
  if (!repairedValidation.success) {
    const patchedPathNames = new Set(patches.map((patch) => patch.path));
    for (const issue of repairedValidation.error.issues) {
      const path = formatPath(issue.path);
      if (!patchedPathNames.has(path) && !unrepaired.some((entry) => entry.path === path)) {
        unrepaired.push({ path, currentValue: getAtPath(article, issue.path), reason: issue.message });
      }
    }
  }

  return { validation, repaired, repairedValidation, patches, refused, unrepaired };
}

function writeArticleBackup({ article, slug, repoRoot }) {
  const backupDir = resolve(repoRoot, "scripts", "data", "backups");
  mkdirSync(backupDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const path = resolve(backupDir, `${timestamp}-repair-article-shape-${slug}.json`);
  writeFileSync(path, JSON.stringify({ timestamp: new Date().toISOString(), slug, article }, null, 2) + "\n");
  return path;
}

function printPlan(slug, plan) {
  for (const patch of plan.patches) {
    console.log(`  PATCH ${slug} ${patch.path} => ${JSON.stringify(patch.replacement)}`);
  }
  for (const entry of plan.refused) {
    console.log(`  REFUSED ${slug} ${entry.path} current=${JSON.stringify(entry.currentValue)} (${entry.reason})`);
  }
  for (const entry of plan.unrepaired) {
    console.log(`  UNREPAIRED ${slug} ${entry.path} current=${JSON.stringify(entry.currentValue)} (${entry.reason})`);
  }
}

function printSummary({ inspected, invalid, repairable, refused, unrepaired, patchCounts }) {
  console.log("\nSummary");
  console.log(`  inspected: ${inspected}`);
  console.log(`  articles failing validation: ${invalid}`);
  console.log(`  articles fully repairable: ${repairable}`);
  console.log(`  articles refused: ${refused}`);
  console.log(`  articles unrepaired: ${unrepaired}`);
  console.log("  patch counts by field path:");
  for (const [path, count] of [...patchCounts.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    console.log(`    ${path}: ${count}`);
  }
}

async function main() {
  const context = createDataOpsRunContext({
    operation: "repair-article-shape",
    intent: INTENT,
    destructive: true,
  });
  printDataOpsRunContext(context);

  const onlySlug = getFlagValue(context.argv, "--slug");
  const targetUrl = requireTargetUrl(context);
  const adminKey = requireAdminIntentToken(INTENT).token;
  const client = createDataClient({ target: targetUrl }).client;
  const targetedArticle = onlySlug
    ? await getUniqueSubstanceDocumentBySlug(
        client,
        api.substanceIndex.getFullDocumentPage,
        onlySlug,
      )
    : null;
  const candidates = onlySlug
    ? targetedArticle ? [targetedArticle] : []
    : await getAllSubstanceDocuments(client, api.substanceIndex.getFullDocumentPage);
  if (onlySlug && candidates.length === 0) {
    throw new Error(`No substance found for slug "${onlySlug}"`);
  }

  const work = [];
  const patchCounts = new Map();
  let invalid = 0;
  let refused = 0;
  let unrepaired = 0;

  for (const article of candidates) {
    const plan = planRepair(article);
    if (plan.validation.success) continue;
    invalid += 1;
    printPlan(article.slug, plan);
    for (const patch of plan.patches) {
      patchCounts.set(patch.schemaPath, (patchCounts.get(patch.schemaPath) ?? 0) + 1);
    }
    if (plan.refused.length > 0) refused += 1;
    if (plan.unrepaired.length > 0 || !plan.repairedValidation?.success) unrepaired += 1;
    if (plan.refused.length === 0 && plan.unrepaired.length === 0 && plan.repairedValidation?.success) {
      work.push({ slug: article.slug, plan });
    }
  }

  printSummary({
    inspected: candidates.length,
    invalid,
    repairable: work.length,
    refused,
    unrepaired,
    patchCounts,
  });

  if (!context.writeEnabled) {
    console.log("\nDry run — no writes performed.");
    return;
  }
  if (work.length === 0) return;

  assertDataOpsWriteAllowed(context);
  const applied = [];
  const failures = [];
  const audit = writeAuditLog({
    operation: "repair-article-shape",
    intent: INTENT,
    mutations: applied,
    repoRoot: context.repoRoot,
  });
  console.log(`\nAudit log: ${audit.path}`);

  for (const { slug } of work) {
    const fresh = await getUniqueSubstanceDocumentBySlug(
      client,
      api.substanceIndex.getFullDocumentPage,
      slug,
    );
    if (!fresh) {
      console.log(`  SKIP ${slug}: article no longer exists`);
      continue;
    }

    const plan = planRepair(fresh);
    if (
      plan.validation.success ||
      plan.refused.length > 0 ||
      plan.unrepaired.length > 0 ||
      !plan.repairedValidation.success
    ) {
      console.log(`  SKIP ${slug}: changed since planning`);
      printPlan(slug, plan);
      continue;
    }

    const backupPath = writeArticleBackup({ article: fresh, slug, repoRoot: context.repoRoot });
    try {
      await client.mutation(api.substanceIndex.saveSubstance, {
        apiKey: adminKey,
        article: stripDataMetadata(plan.repaired),
      });
      applied.push({ slug, patches: plan.patches, backupPath });
      updateAuditLog(audit.path, { mutations: applied, failures });
      console.log(`  wrote ${slug}: ${plan.patches.map((patch) => patch.path).join(", ")}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push({ slug, patches: plan.patches, backupPath, error: message });
      updateAuditLog(audit.path, { mutations: applied, failures });
      console.log(`  FAIL ${slug}: ${message}`);
    }
  }

  console.log(`\nRepaired ${applied.length} article(s). Audit log: ${audit.path}`);
  if (failures.length > 0) {
    console.log(`${failures.length} failed: ${failures.map((failure) => failure.slug).join(", ")}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
