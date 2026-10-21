#!/usr/bin/env node

import { createDataClient } from "../lib/data-client.ts";
import { getAllSubstanceDocuments } from "../lib/data-pagination.mjs";

import { api } from "../../lib/postgres/runtime/api.ts";
import { assertDataOpsWriteAllowed,
backupBeforeWrite,
createDataOpsRunContext,
getFlagValue,
printDataOpsRunContext,
requireAdminIntentToken,
requireSourceUrl,
requireTargetUrl,  } from "../lib/data-ops-run-context.mjs"; import { updateAuditLog, writeAuditLog } from "../lib/data-ops-audit.mjs"
import { stripDataMetadata } from "../batch/summary/articles.mjs";

const CONFIRMATION_FLAG = "--confirm-dosage-duration-sync";
const INTENT = "editorArticleWrite";

const normalizeRoute = (value) => String(value ?? "").trim().toLowerCase();
const isFilled = (range) => Boolean(range) && (range.min !== null || range.max !== null) &&
  (range.min !== undefined || range.max !== undefined);

const sectionSignature = (article) =>
  JSON.stringify({ dosage: article?.dosage ?? null, duration: article?.duration ?? null });

const hasContent = (article) =>
  (article?.dosage?.routes ?? []).length + (article?.duration?.routes ?? []).length > 0;

function filledKeys(route, bucket) {
  const values = bucket === "dosage" ? route?.dose_ranges : route?.stages;
  return Object.entries(values ?? {})
    .filter(([, range]) => isFilled(range))
    .map(([key]) => key);
}

function findProdOnlyData(source, target) {
  const losses = [];
  for (const bucket of ["dosage", "duration"]) {
    const sourceRoutes = source?.[bucket]?.routes ?? [];
    const targetRoutes = target?.[bucket]?.routes ?? [];
    for (const targetRoute of targetRoutes) {
      const match = sourceRoutes.find(
        (route) => normalizeRoute(route.route) === normalizeRoute(targetRoute.route),
      );
      if (!match) {
        losses.push(`${bucket} route "${targetRoute.route}"`);
        continue;
      }
      const sourceKeys = new Set(filledKeys(match, bucket));
      for (const key of filledKeys(targetRoute, bucket)) {
        if (!sourceKeys.has(key)) {
          losses.push(`${bucket}."${targetRoute.route}".${key}`);
        }
      }
    }
  }
  return losses;
}

async function main() {
  const context = createDataOpsRunContext({
    operation: "sync-dosage-duration-to-prod",
    intent: INTENT,
    confirmationFlag: CONFIRMATION_FLAG,
    destructive: true,
  });
  printDataOpsRunContext(context);
  if (context.writeEnabled) assertDataOpsWriteAllowed(context);

  const sourceUrl = getFlagValue(context.argv, "--source-url") ?? requireSourceUrl(context);
  const targetUrl = requireTargetUrl(context);
  if (sourceUrl === targetUrl) throw new Error("Source and target must differ.");
  const adminKey = requireAdminIntentToken(INTENT).token;

  const sourceClient = createDataClient({ target: sourceUrl }).client;
  const targetClient = createDataClient({ target: targetUrl }).client;

  const [sourceDocs, targetDocs] = await Promise.all([
    getAllSubstanceDocuments(sourceClient, api.substanceIndex.getFullDocumentPage),
    getAllSubstanceDocuments(targetClient, api.substanceIndex.getFullDocumentPage),
  ]);
  const byTargetSlug = new Map(targetDocs.map((doc) => [doc.slug, doc]));

  console.log(`\nSource ${sourceDocs.length} docs -> target ${targetDocs.length} docs\n`);

  const work = [];
  const refused = [];
  let identical = 0;
  let sourceEmpty = 0;
  let notOnTarget = 0;

  for (const source of sourceDocs) {
    const target = byTargetSlug.get(source.slug);
    if (!target) {
      notOnTarget += 1;
      continue;
    }
    if (sectionSignature(source) === sectionSignature(target)) {
      identical += 1;
      continue;
    }
    if (!hasContent(source)) {
      sourceEmpty += 1;
      continue;
    }
    const losses = findProdOnlyData(source, target);
    if (losses.length > 0) {
      refused.push({ slug: source.slug, losses });
      continue;
    }
    work.push({ slug: source.slug, fill: !hasContent(target) });
  }

  const fills = work.filter((item) => item.fill).length;
  console.log(`  ${String(fills).padStart(4)}  fill   (target had no dosage/duration)`);
  console.log(`  ${String(work.length - fills).padStart(4)}  update (source is a superset of target)`);
  console.log(`  ${String(refused.length).padStart(4)}  REFUSED (target holds data the source lacks)`);
  console.log(`  ${String(identical).padStart(4)}  already identical`);
  console.log(`  ${String(sourceEmpty).padStart(4)}  skipped (source has nothing to publish)`);
  if (notOnTarget) console.log(`  ${String(notOnTarget).padStart(4)}  not present on target`);

  if (refused.length > 0) {
    console.log(`\nRefused — reconcile these by hand:`);
    for (const item of refused) {
      console.log(`  ${item.slug}: ${item.losses.join("; ")}`);
    }
  }

  if (!context.writeEnabled) {
    console.log(`\nDry run — no writes performed.`);
    return;
  }
  if (work.length === 0) return;

  const backup = await backupBeforeWrite({
    sourceClient: targetClient,
    queryAll: () => getAllSubstanceDocuments(targetClient, api.substanceIndex.getFullDocumentPage),
    label: "sync-dosage-duration-to-prod",
    repoRoot: context.repoRoot,
  });
  console.log(`\nBackup of TARGET written: ${backup.path} (${backup.documentCount} documents)`);

  const applied = [];
  const failures = [];
  const audit = writeAuditLog({
    operation: "sync-dosage-duration-to-prod",
    intent: INTENT,
    mutations: applied,
    repoRoot: context.repoRoot,
  });
  console.log(`Audit log: ${audit.path}\n`);

  try {
    for (const item of work) {
      try {
      const [freshSource, freshTarget] = await Promise.all([
        sourceClient.query(api.substanceIndex.getBySlug, { slug: item.slug }),
        targetClient.query(api.substanceIndex.getBySlug, { slug: item.slug }),
      ]);
      if (!freshSource || !freshTarget) continue;

      const losses = findProdOnlyData(freshSource, freshTarget);
      if (losses.length > 0) {
        console.log(`  SKIP ${item.slug}: target gained data since planning (${losses.join("; ")})`);
        continue;
      }

      const clean = stripDataMetadata(freshTarget);
      await targetClient.mutation(api.substanceIndex.saveSubstance, {
        apiKey: adminKey,
        article: { ...clean, dosage: freshSource.dosage, duration: freshSource.duration },
      });

      applied.push({
        slug: item.slug,
        mode: item.fill ? "fill" : "update",
        dosageRoutes: (freshSource.dosage?.routes ?? []).map((route) => route.route),
        durationRoutes: (freshSource.duration?.routes ?? []).map((route) => route.route),
      });
      if (applied.length % 25 === 0) console.log(`  ...${applied.length} written`);
      updateAuditLog(audit.path, { mutations: applied, failures });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const detail = message.replace(/\s+/g, " ").slice(0, 300);
        console.log(`  FAIL  ${item.slug}: ${detail}`);
        failures.push({ slug: item.slug, error: message });
        updateAuditLog(audit.path, { mutations: applied, failures });
      }
    }
  } finally {
    updateAuditLog(audit.path, { mutations: applied, failures, completed: applied.length });
  }

  console.log(`\nSynced ${applied.length} article(s). Audit log: ${audit.path}`);
  if (failures.length > 0) {
    console.log(`${failures.length} failed: ${failures.map((f) => f.slug).join(", ")}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
