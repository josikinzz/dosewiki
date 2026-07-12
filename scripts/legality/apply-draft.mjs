#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { ConvexHttpClient } from "convex/browser";

import { api } from "../../convex/_generated/api.js";
import {
  assertDataOpsWriteAllowed,
  backupBeforeWrite,
  createDataOpsRunContext,
  getFlagValue,
  requireAdminIntentToken,
  requireTargetUrl,
  updateAuditLog,
  writeAuditLog,
} from "../lib/data-ops-run-context.mjs";

function requireSlug(argv) {
  const slug = getFlagValue(argv, "--slug")?.trim();
  if (!slug) throw new Error("--slug=<slug> is required.");
  return slug;
}

function validateDraft(runDir, repoRoot) {
  const result = spawnSync("bun", ["scripts/legality/validate-draft.ts", "--run", runDir], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  if (result.error) {
    throw new Error(`Unable to run legality draft validation: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`Legality draft validation failed.\n${result.stdout}${result.stderr}`.trim());
  }
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stripConvexMetadata(article) {
  const { _id, _creationTime, ...clean } = article;
  return clean;
}

export function entryForArticle(entry) {
  return {
    status: entry.status,
    notes: entry.notes,
    canonicalStatus: entry.canonicalStatus,
    instrument: entry.instrument,
    ...(entry.designation ? { designation: entry.designation } : {}),
  };
}

export function buildApplyPlan({ article, draft }) {
  const currentLegality = isRecord(article.legality) ? structuredClone(article.legality) : {};
  const countries = isRecord(currentLegality.countries) ? { ...currentLegality.countries } : {};
  const liveCountries = { ...countries };
  const international = Array.isArray(currentLegality.international) ? currentLegality.international : [];
  const added = [];
  const corrected = [];
  const enriched = [];
  const repaired = [];

  for (const [country, entry] of Object.entries(draft.entries)) {
    if (countries[country] !== undefined) {
      throw new Error(`Cannot add ${country}: the live article already has a country entry; use corrections instead.`);
    }
    countries[country] = entryForArticle(entry);
    added.push(country);
  }

  for (const [country, correction] of Object.entries(draft.corrections)) {
    const liveEntry = countries[country];
    if (!isRecord(liveEntry)) {
      throw new Error(`Cannot correct ${country}: the live article has no country entry.`);
    }
    if (liveEntry.status !== correction.oldEntry.status || liveEntry.notes !== correction.oldEntry.notes) {
      throw new Error(`Stale draft for ${country}: live status and notes no longer match correction.oldEntry.`);
    }
    countries[country] = entryForArticle(correction);
    corrected.push({ country, oldStatus: correction.oldEntry.status, newStatus: correction.status });
  }

  for (const [country, enrichment] of Object.entries(draft.enrichments ?? {})) {
    const liveEntry = liveCountries[country];
    if (!isRecord(liveEntry)) {
      throw new Error(`Cannot enrich ${country}: the live article has no country entry.`);
    }
    countries[country] = {
      ...countries[country],
      canonicalStatus: enrichment.canonicalStatus,
      instrument: enrichment.instrument,
      ...(enrichment.designation ? { designation: enrichment.designation } : {}),
    };
    enriched.push(country);
  }

  for (const [country, repair] of Object.entries(draft.notesRepairs ?? {})) {
    const liveEntry = liveCountries[country];
    if (!isRecord(liveEntry)) {
      throw new Error(`Cannot repair ${country}: the live article has no country entry.`);
    }
    if (liveEntry.notes !== repair.expectedNotes) {
      throw new Error(`Stale draft for ${country}: live notes no longer match notesRepairs.expectedNotes.`);
    }
    countries[country] = {
      ...countries[country],
      notes: repair.newNotes,
    };
    repaired.push(country);
  }

  const internationalReplaced = draft.international.length > 0;
  return {
    legality: {
      ...currentLegality,
      international: internationalReplaced ? draft.international : international,
      countries,
    },
    added,
    corrected,
    enriched,
    repaired,
    internationalReplaced,
  };
}

function countryMetadata(entry) {
  return `[${entry.canonicalStatus}]${entry.designation ? ` ${entry.designation}` : ""}`;
}

export function printPlan(plan, draft) {
  for (const country of plan.added) {
    console.log(`ADD ${country} ${countryMetadata(draft.entries[country])}`);
  }
  for (const correction of plan.corrected) {
    console.log(`CORRECT ${correction.country} (${correction.oldStatus} → ${correction.newStatus}) ${countryMetadata(draft.corrections[correction.country])}`);
  }
  for (const country of plan.enriched) {
    console.log(`ENRICH ${country} ${countryMetadata(draft.enrichments[country])}`);
  }
  for (const country of plan.repaired) {
    console.log(`REPAIR ${country} (notes)`);
  }
  if (plan.internationalReplaced) {
    console.log(`INTERNATIONAL: ${draft.international.length} lines`);
  }
  console.log(`TOTALS: ${plan.added.length} add, ${plan.corrected.length} correct, ${plan.enriched.length} enrich, ${plan.repaired.length} repair, ${plan.internationalReplaced ? "international replaced" : "international unchanged"}`);
}

export async function main(argv = process.argv.slice(2)) {
  const slug = requireSlug(argv);
  const write = argv.includes("--write");
  if (write && argv.includes("--dry-run")) {
    throw new Error("Use either --dry-run or --write, not both.");
  }

  const runContext = createDataOpsRunContext({
    operation: "apply legality research draft",
    intent: "legality-research",
    argv,
    sourceUrlKeys: [],
    dryRunFlag: "--dry-run",
    executeFlag: "--write",
    requiresExecute: true,
    confirmationFlag: "--confirm-legality-write",
    selectedTables: ["substanceIndex"],
    localArtifacts: [resolve("runs", "legality", slug, "legality-draft.json")],
    destructive: true,
  });
  if (!write) {
    runContext.dryRun = true;
    runContext.writeEnabled = false;
  }

  const runDir = resolve(runContext.repoRoot, "runs", "legality", slug);
  const draftPath = resolve(runDir, "legality-draft.json");
  if (!existsSync(draftPath)) {
    throw new Error(`Missing legality draft: ${draftPath}`);
  }
  validateDraft(runDir, runContext.repoRoot);
  const draft = JSON.parse(readFileSync(draftPath, "utf8"));
  if (draft.slug !== slug) {
    throw new Error(`Draft slug ${draft.slug} does not match --slug=${slug}.`);
  }

  const targetUrl = requireTargetUrl(runContext, "Convex legality target URL");
  const client = new ConvexHttpClient(targetUrl);
  const article = await client.query(api.substanceIndex.getBySlug, { slug });
  if (!article) throw new Error(`No article found for slug: ${slug}`);

  const plan = buildApplyPlan({ article, draft });
  printPlan(plan, draft);
  if (!write) {
    console.log("No writes performed. Re-run with --write --confirm-legality-write to update Convex.");
    return;
  }

  assertDataOpsWriteAllowed(runContext);
  const adminToken = requireAdminIntentToken("editorArticleWrite");
  const { path: auditLogPath } = writeAuditLog({
    operation: "legality-draft-apply",
    intent: "editorArticleWrite",
    slug,
    mutations: [
      ...plan.added.map((country) => ({ country, action: "add", field: "legality.countries" })),
      ...plan.corrected.map((correction) => ({ country: correction.country, action: "correct", field: "legality.countries" })),
      ...plan.enriched.map((country) => ({ country, action: "enrich", field: "legality.countries" })),
      ...plan.repaired.map((country) => ({ country, action: "repair", field: "legality.countries.*.notes" })),
      ...(plan.internationalReplaced ? [{ action: "replace", field: "legality.international" }] : []),
    ],
    repoRoot: runContext.repoRoot,
  });

  const { path: backupPath, documentCount } = await backupBeforeWrite({
    sourceClient: client,
    queryGetAll: api.substanceIndex.getAll,
    label: `legality-apply-${slug}`,
    repoRoot: runContext.repoRoot,
  });

  const articleForWrite = {
    ...stripConvexMetadata(article),
    legality: plan.legality,
  };
  const writeResult = await client.mutation(api.substanceIndex.saveSubstance, {
    apiKey: adminToken.token,
    article: articleForWrite,
  });
  if (writeResult?.updated !== true || writeResult?.outcome?.action !== "updated") {
    throw new Error(`Legality write did not update ${slug}: ${JSON.stringify(writeResult)}`);
  }

  const applied = {
    slug,
    appliedAt: new Date().toISOString(),
    added: plan.added,
    corrected: plan.corrected.map(({ country }) => country),
    enriched: plan.enriched,
    repaired: plan.repaired,
    internationalReplaced: plan.internationalReplaced,
  };
  writeFileSync(resolve(runDir, "applied.json"), `${JSON.stringify(applied, null, 2)}\n`);
  updateAuditLog(auditLogPath, {
    status: "completed",
    backupPath,
    result: writeResult,
    appliedPath: resolve(runDir, "applied.json"),
  });
  console.log(`Applied ${slug}: ${plan.added.length} add, ${plan.corrected.length} correct, ${plan.enriched.length} enrich, ${plan.repaired.length} repair, ${plan.internationalReplaced ? "international replaced" : "international unchanged"}.`);
  console.log(`Backup: ${backupPath} (${documentCount} documents); audit: ${auditLogPath}`);
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
