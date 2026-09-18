#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { createDataClient } from "../lib/data-client.ts";

import { api } from "../../lib/postgres/runtime/api.ts"
import { stripCitationMarkers } from "../citations/citation-only-validator.mjs";
import { assertDataOpsWriteAllowed,
backupBeforeWrite,
createDataOpsRunContext,
getFlagValue,
requireAdminIntentToken,
requireTargetUrl,  } from "../lib/data-ops-run-context.mjs"; import { updateAuditLog, writeAuditLog } from "../lib/data-ops-audit.mjs"

function requireSlug(argv) {
  const slug = getFlagValue(argv, "--slug")?.trim();
  if (!slug) throw new Error("--slug=<slug> is required.");
  return slug;
}

function validateDraft(runDir, repoRoot, draftFile) {
  const args = ["scripts/legality/validate-draft.ts", "--run", runDir];
  if (draftFile !== "legality-draft.json") {
    args.push("--draft-file", draftFile);
  }
  const result = spawnSync("bun", args, {
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

function stripDataMetadata(article) {
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
    ...(entry.citationNeeded ? { citationNeeded: true } : {}),
    ...(entry.cities ? {
      cities: Object.fromEntries(
        Object.entries(entry.cities).map(([city, cityEntry]) => [city, entryForArticle(cityEntry)]),
      ),
    } : {}),
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
  const removed = [];
  const states = [];
  const removalCountries = new Set();

  for (const removal of draft.countryRemovals ?? []) {
    if (removalCountries.has(removal.country)) {
      throw new Error(`Duplicate country removal: ${removal.country}.`);
    }
    removalCountries.add(removal.country);
    if (
      removal.country in draft.entries
      || removal.country in draft.corrections
      || removal.country in (draft.enrichments ?? {})
      || removal.country in (draft.notesRepairs ?? {})
    ) {
      throw new Error(`Cannot remove ${removal.country}: the draft also mutates that country.`);
    }
  }

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
    const notesMatch = stripCitationMarkers(liveEntry.notes)
      === stripCitationMarkers(correction.oldEntry.notes);
    if (liveEntry.status !== correction.oldEntry.status || !notesMatch) {
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
    const enrichedEntry = {
      ...countries[country],
      canonicalStatus: enrichment.canonicalStatus,
      instrument: enrichment.instrument,
      ...(enrichment.designation ? { designation: enrichment.designation } : {}),
    };
    if (enrichment.designation === null) {
      delete enrichedEntry.designation;
    }
    delete enrichedEntry.citationNeeded;
    countries[country] = enrichedEntry;
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

  const statusRepaired = [];
  for (const [country, repair] of Object.entries(draft.statusRepairs ?? {})) {
    const liveEntry = liveCountries[country];
    if (!isRecord(liveEntry)) {
      throw new Error(`Cannot repair status for ${country}: the live article has no country entry.`);
    }
    if (liveEntry.status !== repair.expectedStatus) {
      throw new Error(`Stale draft for ${country}: live status no longer matches statusRepairs.expectedStatus.`);
    }
    countries[country] = {
      ...countries[country],
      status: repair.newStatus,
    };
    statusRepaired.push(country);
  }

  const designationRepaired = [];
  for (const [country, repair] of Object.entries(draft.designationRepairs ?? {})) {
    const liveEntry = liveCountries[country];
    if (!isRecord(liveEntry)) {
      throw new Error(`Cannot repair designation for ${country}: the live article has no country entry.`);
    }
    if (liveEntry.designation !== repair.expectedDesignation) {
      throw new Error(`Stale draft for ${country}: live designation no longer matches designationRepairs.expectedDesignation.`);
    }
    const nextEntry = { ...countries[country] };
    if (repair.newDesignation === null) {
      delete nextEntry.designation;
    } else {
      nextEntry.designation = repair.newDesignation;
    }
    countries[country] = nextEntry;
    designationRepaired.push(country);
  }

  const instrumentRepaired = [];
  for (const [country, repair] of Object.entries(draft.instrumentRepairs ?? {})) {
    const liveEntry = liveCountries[country];
    if (!isRecord(liveEntry)) {
      throw new Error(`Cannot repair instrument for ${country}: the live article has no country entry.`);
    }
    if (liveEntry.instrument !== repair.expectedInstrument) {
      throw new Error(`Stale draft for ${country}: live instrument no longer matches instrumentRepairs.expectedInstrument.`);
    }
    countries[country] = {
      ...countries[country],
      instrument: repair.newInstrument,
    };
    instrumentRepaired.push(country);
  }

  for (const removal of draft.countryRemovals ?? []) {
    const liveEntry = liveCountries[removal.country];
    if (!isRecord(liveEntry)) {
      throw new Error(`Cannot remove ${removal.country}: the live article has no country entry.`);
    }
    const notesMatch = stripCitationMarkers(liveEntry.notes)
      === stripCitationMarkers(removal.oldEntry.notes);
    if (liveEntry.status !== removal.oldEntry.status || !notesMatch) {
      throw new Error(`Stale removal for ${removal.country}: live status and notes no longer match countryRemovals.oldEntry.`);
    }
    delete countries[removal.country];
    removed.push(removal);
  }

  const flagged = [];
  for (const { country, reason } of draft.refuted ?? []) {
    const liveEntry = countries[country];
    if (
      isRecord(liveEntry) &&
      !added.includes(country) &&
      !corrected.some((correction) => correction.country === country)
    ) {
      countries[country] = { ...liveEntry, citationNeeded: true };
      flagged.push({ country, reason });
    }
  }

  const internationalReplaced = draft.international.length > 0;
  const usStatesReplaced = draft.usStates !== undefined;
  const usStatesNoteApplied = draft.usStatesNote !== undefined;
  if (usStatesReplaced) {
    for (const [state, entry] of Object.entries(draft.usStates)) {
      states.push({ state, cities: Object.keys(entry.cities ?? {}) });
    }
  }
  return {
    legality: {
      ...currentLegality,
      international: internationalReplaced ? draft.international : international,
      countries,
      ...(usStatesReplaced ? {
        usStates: Object.fromEntries(
          Object.entries(draft.usStates).map(([state, entry]) => [state, entryForArticle(entry)]),
        ),
      } : {}),
      ...(usStatesNoteApplied ? { usStatesNote: draft.usStatesNote } : {}),
    },
    added,
    corrected,
    enriched,
    repaired,
    statusRepaired,
    designationRepaired,
    instrumentRepaired,
    removed,
    flagged,
    states,
    internationalReplaced,
    usStatesReplaced,
    usStatesNoteApplied,
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
  for (const country of plan.statusRepaired) {
    console.log(`REPAIR ${country} (status: ${draft.statusRepairs[country].expectedStatus} → ${draft.statusRepairs[country].newStatus})`);
  }
  for (const country of plan.designationRepaired) {
    console.log(`REPAIR ${country} (designation: ${draft.designationRepairs[country].expectedDesignation} → ${draft.designationRepairs[country].newDesignation ?? "removed"})`);
  }
  for (const country of plan.instrumentRepaired) {
    console.log(`REPAIR ${country} (instrument)`);
  }
  for (const { country, reason } of plan.removed) {
    console.log(`REMOVE ${country} (${reason})`);
  }
  for (const { country, reason } of plan.flagged) {
    console.log(`FLAG ${country} citation needed (refuted: ${reason})`);
  }
  if (plan.internationalReplaced) {
    console.log(`INTERNATIONAL: ${draft.international.length} lines`);
  }
  for (const { state, cities } of plan.states) {
    console.log(`STATE ${state} ${countryMetadata(draft.usStates[state])}`);
    for (const city of cities) {
      console.log(`CITY ${state}/${city} ${countryMetadata(draft.usStates[state].cities[city])}`);
    }
  }
  if (plan.usStatesNoteApplied) {
    console.log(`US STATES NOTE: ${draft.usStatesNote}`);
  }
  console.log(`TOTALS: ${plan.added.length} add, ${plan.corrected.length} correct, ${plan.enriched.length} enrich, ${plan.repaired.length} repair, ${plan.statusRepaired.length} status-repair, ${plan.designationRepaired.length} designation-repair, ${plan.instrumentRepaired.length} instrument-repair, ${plan.removed.length} remove, ${plan.flagged.length} flag, ${plan.states.length} state, ${plan.internationalReplaced ? "international replaced" : "international unchanged"}, ${plan.usStatesReplaced ? "US states replaced" : "US states unchanged"}, ${plan.usStatesNoteApplied ? "US states note applied" : "US states note unchanged"}`);
}

export async function main(argv = process.argv.slice(2)) {
  const slug = requireSlug(argv);
  const write = argv.includes("--write");
  if (write && argv.includes("--dry-run")) {
    throw new Error("Use either --dry-run or --write, not both.");
  }

  const draftFile = getFlagValue(argv, "--draft-file")?.trim() || "legality-draft.json";
  const existingBackupPath = getFlagValue(argv, "--existing-backup")?.trim() || null;
  const appliedFile = draftFile === "legality-draft.json"
    ? "applied.json"
    : draftFile.replace(/\.json$/, "-applied.json");

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
    localArtifacts: [resolve("runs", "legality", slug, draftFile)],
    destructive: true,
  });
  if (!write) {
    runContext.dryRun = true;
    runContext.writeEnabled = false;
  }

  const runDir = resolve(runContext.repoRoot, "runs", "legality", slug);
  const draftPath = resolve(runDir, draftFile);
  if (!existsSync(draftPath)) {
    throw new Error(`Missing legality draft: ${draftPath}`);
  }
  validateDraft(runDir, runContext.repoRoot, draftFile);
  const draft = JSON.parse(readFileSync(draftPath, "utf8"));
  if (draft.slug !== slug) {
    throw new Error(`Draft slug ${draft.slug} does not match --slug=${slug}.`);
  }

  const targetUrl = requireTargetUrl(runContext, "Postgres legality target URL");
  const client = createDataClient({ target: targetUrl }).client;
  const article = await client.query(api.substanceIndex.getBySlug, { slug });
  if (!article) throw new Error(`No article found for slug: ${slug}`);

  const plan = buildApplyPlan({ article, draft });
  printPlan(plan, draft);
  if (!write) {
    console.log("No writes performed. Re-run with --write --confirm-legality-write to update Postgres.");
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
      ...plan.statusRepaired.map((country) => ({ country, action: "repair", field: "legality.countries.*.status" })),
      ...plan.designationRepaired.map((country) => ({ country, action: "repair", field: "legality.countries.*.designation" })),
      ...plan.instrumentRepaired.map((country) => ({ country, action: "repair", field: "legality.countries.*.instrument" })),
      ...plan.removed.map(({ country }) => ({ country, action: "remove", field: "legality.countries" })),
      ...plan.flagged.map(({ country }) => ({ country, action: "flag-citation-needed", field: "legality.countries" })),
      ...(plan.internationalReplaced ? [{ action: "replace", field: "legality.international" }] : []),
      ...(plan.usStatesReplaced ? [{ action: "replace", field: "legality.usStates" }] : []),
      ...(plan.usStatesNoteApplied ? [{ action: "replace", field: "legality.usStatesNote" }] : []),
    ],
    repoRoot: runContext.repoRoot,
  });

  const { path: backupPath, documentCount, reused: reusedBackup } = await backupBeforeWrite({
    sourceClient: client,
    queryGetAll: api.substanceIndex.getBySlug,
    queryArgs: { slug },
    label: `legality-apply-${slug}`,
    existingBackupPath,
    repoRoot: runContext.repoRoot,
  });

  const articleForWrite = {
    ...stripDataMetadata(article),
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
    statusRepaired: plan.statusRepaired,
    designationRepaired: plan.designationRepaired,
    instrumentRepaired: plan.instrumentRepaired,
    removed: plan.removed.map(({ country }) => country),
    flaggedCitationNeeded: plan.flagged.map(({ country }) => country),
    internationalReplaced: plan.internationalReplaced,
    states: plan.states.map(({ state }) => state),
    usStatesReplaced: plan.usStatesReplaced,
    usStatesNoteApplied: plan.usStatesNoteApplied,
  };
  writeFileSync(resolve(runDir, appliedFile), `${JSON.stringify(applied, null, 2)}\n`);
  updateAuditLog(auditLogPath, {
    status: "completed",
    backupPath,
    result: writeResult,
    appliedPath: resolve(runDir, appliedFile),
  });
  console.log(`Applied ${slug}: ${plan.added.length} add, ${plan.corrected.length} correct, ${plan.enriched.length} enrich, ${plan.repaired.length} repair, ${plan.removed.length} remove, ${plan.flagged.length} flag, ${plan.states.length} state, ${plan.internationalReplaced ? "international replaced" : "international unchanged"}, ${plan.usStatesReplaced ? "US states replaced" : "US states unchanged"}.`);
  const backupSummary = reusedBackup ? "reused verified snapshot" : `${documentCount} documents`;
  console.log(`Backup: ${backupPath} (${backupSummary}); audit: ${auditLogPath}`);
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
