#!/usr/bin/env node

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

const CONFIRMATION_FLAG = "--confirm-subjective-effects-repair";
const INTENT = "editorArticleWrite";

const SENSES = ["visual", "auditory", "tactile", "olfactory", "gustatory", "multisensory"];
const RECORD_FIELDS = ["cognitive", "physical", "progressive_stages"];

const emptySenseCategory = () => ({ note: "", subcategories: {} });

const emptySensory = () =>
  Object.fromEntries(SENSES.map((sense) => [sense, emptySenseCategory()]));

const emptyNotes = () => ({ overview: "", sensory: "", cognitive: "", physical: "" });

function planRepair(article) {
  const effects = article?.subjective_effects;
  if (!effects || Array.isArray(effects)) return null;

  const repaired = { ...effects };
  const fixed = [];
  const refused = [];

  for (const field of RECORD_FIELDS) {
    const value = effects[field];
    if (!Array.isArray(value)) continue;
    if (value.length > 0) {
      refused.push(`${field} holds ${value.length} entr${value.length === 1 ? "y" : "ies"}`);
      continue;
    }
    repaired[field] = {};
    fixed.push(field);
  }

  if (Array.isArray(effects.sensory)) {
    if (effects.sensory.length > 0) {
      refused.push(`sensory holds ${effects.sensory.length} entries`);
    } else {
      repaired.sensory = emptySensory();
      fixed.push("sensory (whole block)");
    }
  } else if (effects.sensory) {
    const sensory = { ...effects.sensory };
    let touched = false;
    for (const sense of SENSES) {
      const value = sensory[sense];
      if (value !== undefined && !Array.isArray(value)) continue;
      if (Array.isArray(value) && value.length > 0) {
        refused.push(`sensory.${sense} holds ${value.length} entries`);
        continue;
      }
      sensory[sense] = emptySenseCategory();
      fixed.push(`sensory.${sense}`);
      touched = true;
    }
    if (touched) repaired.sensory = sensory;
  } else {
    repaired.sensory = emptySensory();
    fixed.push("sensory (missing)");
  }

  if (effects.notes === null || effects.notes === undefined) {
    repaired.notes = emptyNotes();
    fixed.push("notes");
  }

  if (fixed.length === 0 && refused.length === 0) return null;
  return { repaired, fixed, refused };
}

async function main() {
  const context = createDataOpsRunContext({
    operation: "repair-subjective-effects-shape",
    intent: INTENT,
    confirmationFlag: CONFIRMATION_FLAG,
    destructive: true,
  });
  printDataOpsRunContext(context);

  const onlySlug = getFlagValue(context.argv, "--slug");
  const targetUrl = requireTargetUrl(context);
  const adminKey = requireAdminIntentToken(INTENT).token;
  const client = createDataClient({ target: targetUrl }).client;

  const all = await getAllSubstanceDocuments(client, api.substanceIndex.getFullDocumentPage);
  const candidates = onlySlug ? all.filter((doc) => doc.slug === onlySlug) : all;
  if (onlySlug && candidates.length === 0) {
    throw new Error(`No substance found for slug "${onlySlug}"`);
  }

  const work = [];
  let blocked = 0;
  for (const article of candidates) {
    const plan = planRepair(article);
    if (!plan) continue;
    if (plan.refused.length > 0) {
      console.log(`  SKIP ${article.slug}: ${plan.refused.join("; ")} — needs a human`);
      blocked += 1;
      continue;
    }
    console.log(`  OK   ${article.slug.padEnd(30)} ${plan.fixed.length} field(s): ${plan.fixed.join(", ")}`);
    work.push({ article, plan });
  }

  console.log(
    `\n${work.length} article(s) repairable, ${blocked} refused (non-empty arrays), ` +
      `${candidates.length} inspected.`,
  );

  if (!context.writeEnabled) {
    console.log("\nDry run — no writes performed.");
    return;
  }
  if (work.length === 0) return;

  assertDataOpsWriteAllowed(context);

  const backup = await backupBeforeWrite({
    sourceClient: client,
    queryAll: () => getAllSubstanceDocuments(client, api.substanceIndex.getFullDocumentPage),
    label: "repair-subjective-effects-shape",
    repoRoot: context.repoRoot,
  });
  console.log(`\nBackup written: ${backup.path} (${backup.documentCount} documents)`);

  const applied = [];
  const failures = [];
  const audit = writeAuditLog({
    operation: "repair-subjective-effects-shape",
    intent: INTENT,
    mutations: applied,
    repoRoot: context.repoRoot,
  });
  console.log(`Audit log: ${audit.path}\n`);

  try {
    for (const { article } of work) {
      const fresh = await client.query(api.substanceIndex.getBySlug, { slug: article.slug });
      if (!fresh) continue;
      const plan = planRepair(fresh);
      if (!plan || plan.refused.length > 0) {
        console.log(`  SKIP ${article.slug}: changed since planning`);
        continue;
      }

      const clean = stripDataMetadata(fresh);
      try {
        await client.mutation(api.substanceIndex.saveSubstance, {
          apiKey: adminKey,
          article: { ...clean, subjective_effects: plan.repaired },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const detail = message.replace(/\s+/g, " ").slice(0, 300);
        console.log(`  FAIL  ${article.slug}: ${detail}`);
        failures.push({ slug: article.slug, error: message });
        updateAuditLog(audit.path, { mutations: applied, failures });
        continue;
      }

      console.log(`  wrote ${article.slug}: ${plan.fixed.join(", ")}`);
      applied.push({ slug: article.slug, fixed: plan.fixed });
      updateAuditLog(audit.path, { mutations: applied, failures });
    }
  } finally {
    updateAuditLog(audit.path, { mutations: applied, failures, completed: applied.length });
  }

  console.log(`\nRepaired ${applied.length} article(s). Audit log: ${audit.path}`);
  if (failures.length > 0) {
    console.log(`${failures.length} failed: ${failures.map((f) => f.slug).join(", ")}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
