#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { createDataClient, postgresFingerprintFromUrl } from "../lib/data-client.ts";
import yaml from "../../node_modules/yaml/dist/index.js";
import { api } from "../../lib/postgres/runtime/api.ts";
import { stripDataMetadata } from "../batch/summary/articles.mjs";
import {
  hasDosageDurationContent,
  routeHasDosageContent,
  routeHasDurationContent,
} from "../../src/schema/substance/dosageDurationPresence.ts";
import {
  assertDataOpsWriteAllowed,
  createDataOpsRunContext,
  getFlagValue,
  printDataOpsRunContext,
  requireAdminIntentToken,
  requireTargetUrl,
} from "../lib/data-ops-run-context.mjs";

const PK_FIELDS = [
  "pharmacokinetics",
  "half_life",
  "bioavailability_notes",
  "protein_binding",
  "volume_of_distribution",
];
const PK_RECORD_FIELDS = [
  "route_bioavailability",
  "route_half_life",
  "route_half_life_notes",
  "route_bioavailability_notes",
];

function isEmptyString(v) {
  return v === undefined || v === null || (typeof v === "string" && v.trim() === "");
}
function isEmptyRecord(v) {
  return v === undefined || v === null || (typeof v === "object" && Object.keys(v).length === 0);
}
function isEmptyDoseTier(t) {
  return !t || (t.min === null || t.min === undefined) && (t.max === null || t.max === undefined);
}
function hasAnyDoseValue(t) {
  return t && (t.min !== null && t.min !== undefined || t.max !== null && t.max !== undefined);
}
function routeKey(r) {
  return (r?.route ?? "").trim().toLowerCase();
}

function newRouteRefusal(route, side) {
  if (routeKey(route) === "") {
    return "route name is blank (echoed template)";
  }
  const hasContent = side === "dosage"
    ? routeHasDosageContent(route)
    : routeHasDurationContent(route);
  if (!hasContent) {
    return side === "dosage"
      ? "no dose values, bioavailability, or notes"
      : "no stage values or half-life prose";
  }
  return null;
}

export function mergeDosageDuration(live, draft) {
  const changes = [];
  const skipped = [];
  const liveDosage = live.dosage ?? { routes: [], plateau_dosing: null };
  const liveDuration = live.duration ?? { routes: [] };
  const draftDosage = draft.dosage ?? { routes: [] };
  const draftDuration = draft.duration ?? { routes: [] };

  const dosageRoutes = liveDosage.routes.map((r) => ({ ...r }));
  for (const dr of draftDosage.routes ?? []) {
    const idx = dosageRoutes.findIndex((r) => routeKey(r) === routeKey(dr));
    if (idx === -1) {
      const refusal = newRouteRefusal(dr, "dosage");
      if (refusal) {
        skipped.push(`dosage: withheld new route "${dr.route ?? ""}" (${refusal})`);
        continue;
      }
      dosageRoutes.push(dr);
      changes.push(`dosage: added new route "${dr.route}"`);
      continue;
    }
    const lr = dosageRoutes[idx];
    if (isEmptyString(lr.bioavailability) && !isEmptyString(dr.bioavailability)) {
      lr.bioavailability = dr.bioavailability;
      changes.push(`dosage.${lr.route}: filled bioavailability`);
    }
    if (isEmptyString(lr.bioavailability_notes) && !isEmptyString(dr.bioavailability_notes)) {
      lr.bioavailability_notes = dr.bioavailability_notes;
      changes.push(`dosage.${lr.route}: filled bioavailability_notes`);
    }
    if (isEmptyString(lr.notes) && !isEmptyString(dr.notes)) {
      lr.notes = dr.notes;
      changes.push(`dosage.${lr.route}: filled notes`);
    }
    for (const tier of ["threshold", "light", "moderate", "strong", "heavy"]) {
      const lt = lr.dose_ranges?.[tier];
      const dt = dr.dose_ranges?.[tier];
      if (isEmptyDoseTier(lt) && hasAnyDoseValue(dt)) {
        lr.dose_ranges = { ...lr.dose_ranges, [tier]: dt };
        changes.push(`dosage.${lr.route}.${tier}: filled ${dt.min}-${dt.max}${dt.unit}`);
      }
    }
  }

  const durationRoutes = liveDuration.routes.map((r) => ({ ...r }));
  for (const dr of draftDuration.routes ?? []) {
    const idx = durationRoutes.findIndex((r) => routeKey(r) === routeKey(dr));
    if (idx === -1) {
      const refusal = newRouteRefusal(dr, "duration");
      if (refusal) {
        skipped.push(`duration: withheld new route "${dr.route ?? ""}" (${refusal})`);
        continue;
      }
      durationRoutes.push(dr);
      changes.push(`duration: added new route "${dr.route}"`);
      continue;
    }
    const lr = durationRoutes[idx];
    if (isEmptyString(lr.half_life) && !isEmptyString(dr.half_life)) {
      lr.half_life = dr.half_life;
      changes.push(`duration.${lr.route}: filled half_life`);
    }
    if (isEmptyString(lr.half_life_notes) && !isEmptyString(dr.half_life_notes)) {
      lr.half_life_notes = dr.half_life_notes;
      changes.push(`duration.${lr.route}: filled half_life_notes`);
    }
    for (const stage of ["onset", "come_up", "peak", "offset", "after_effects", "total_duration"]) {
      const lt = lr.stages?.[stage];
      const dt = dr.stages?.[stage];
      if (isEmptyDoseTier(lt) && hasAnyDoseValue(dt)) {
        lr.stages = { ...lr.stages, [stage]: dt };
        changes.push(`duration.${lr.route}.${stage}: filled ${dt.min}-${dt.max}${dt.unit}`);
      }
    }
  }

  return {
    dosage: { ...liveDosage, routes: dosageRoutes },
    duration: { ...liveDuration, routes: durationRoutes },
    changes,
    skipped,
  };
}

export function normalizeDraftDefaults(section, doc) {
  if (section !== "dosage_duration") return doc;
  const d = JSON.parse(JSON.stringify(doc));
  for (const r of d.dosage?.routes ?? []) {
    if (typeof r.bioavailability !== "string") r.bioavailability = "";
    if (typeof r.bioavailability_notes !== "string") r.bioavailability_notes = "";
    if (typeof r.notes !== "string") r.notes = "";
  }
  for (const r of d.duration?.routes ?? []) {
    if (typeof r.half_life !== "string") r.half_life = "";
    if (typeof r.half_life_notes !== "string") r.half_life_notes = "";
  }
  return d;
}

export function deepChars(v) {
  if (v == null) return 0;
  if (typeof v === "string") return v.trim().length;
  if (typeof v === "number" || typeof v === "boolean") return 0;
  if (Array.isArray(v)) return v.reduce((a, x) => a + deepChars(x), 0);
  if (typeof v === "object") return Object.values(v).reduce((a, x) => a + deepChars(x), 0);
  return 0;
}

export function deepFillMerge(live, draft, path = "", changes = []) {
  if (draft === undefined || draft === null) return { merged: live, changes };
  if (live === undefined || live === null) {
    if (deepChars(draft) > 0 || (typeof draft === "number")) changes.push(`${path}: filled`);
    return { merged: draft, changes };
  }
  if (typeof live === "string") {
    if (live.trim() === "" && typeof draft === "string" && draft.trim() !== "") {
      changes.push(`${path}: filled`);
      return { merged: draft, changes };
    }
    return { merged: live, changes };
  }
  if (Array.isArray(live)) {
    if (live.length === 0 && Array.isArray(draft) && draft.length > 0) {
      changes.push(`${path}: filled (${draft.length} items)`);
      return { merged: draft, changes };
    }
    return { merged: live, changes };
  }
  if (typeof live === "object" && typeof draft === "object" && !Array.isArray(draft)) {
    const merged = { ...live };
    for (const key of Object.keys(draft)) {
      const r = deepFillMerge(live[key], draft[key], path ? `${path}.${key}` : key, changes);
      merged[key] = r.merged;
    }
    return { merged, changes };
  }
  return { merged: live, changes };
}

export function mergePharmacologyPK(live, draft) {
  const changes = [];
  const merged = { ...live };
  for (const field of PK_FIELDS) {
    if (isEmptyString(live[field]) && !isEmptyString(draft[field])) {
      merged[field] = draft[field];
      changes.push(`pharmacology.${field}: filled`);
    }
  }
  for (const field of PK_RECORD_FIELDS) {
    if (isEmptyRecord(live[field]) && !isEmptyRecord(draft[field])) {
      merged[field] = draft[field];
      changes.push(`pharmacology.${field}: filled (${Object.keys(draft[field]).length} routes)`);
    }
  }
  return { pharmacology: merged, changes };
}

function parseArgs(argv) {
  return {
    section: getFlagValue(argv, "--section"),
    slug: getFlagValue(argv, "--slug"),
    draftPath: getFlagValue(argv, "--draft"),
    mode: getFlagValue(argv, "--mode"),
    write: argv.includes("--write"),
    dryRun: argv.includes("--dry-run") || !argv.includes("--write"),
  };
}

async function main() {
  const argv = process.argv.slice(2);
  const opts = parseArgs(argv);
  if (!opts.section || !opts.slug || !opts.draftPath || !opts.mode) {
    console.error("Usage: --section=<key> --slug=<slug> --draft=<path> --mode=<replace|merge> [--dry-run|--write ...]");
    process.exit(1);
  }

  const runContext = createDataOpsRunContext({
    operation: "apply gap generation",
    intent: "editorArticleWrite",
    argv,
    sourceUrlKeys: [],
    localArtifacts: [opts.draftPath],
  });
  printDataOpsRunContext(runContext);
  if (runContext.writeEnabled) assertDataOpsWriteAllowed(runContext);

  const targetUrl = requireTargetUrl(runContext);
  const client = createDataClient({ target: targetUrl }).client;

  const doc = normalizeDraftDefaults(opts.section, yaml.parse(readFileSync(opts.draftPath, "utf8")));
  const existing = await client.query(api.substanceIndex.getBySlug, { slug: opts.slug });
  if (!existing) {
    console.error(`${opts.slug}: article not found`);
    process.exit(1);
  }
  const article = existing.article ?? existing;

  let updatedFields = {};
  let changes = [];
  let skipped = [];

  if (opts.section === "dosage_duration") {
    if (!hasDosageDurationContent(doc)) {
      console.log(`${opts.slug}/dosage_duration: no-op (draft has no dosage or duration content)`);
      return;
    }
    const result = mergeDosageDuration(article, doc);
    updatedFields = { dosage: result.dosage, duration: result.duration };
    changes = result.changes;
    skipped = result.skipped;
  } else if (opts.section === "pharmacology") {
    const liveEmpty = deepChars(article.pharmacology) === 0;
    if (liveEmpty && (opts.mode === "replace" || opts.mode === "auto")) {
      updatedFields = { pharmacology: doc.pharmacology };
      changes = ["pharmacology: full replace (live section empty)"];
    } else {
      const result = mergePharmacologyPK(article.pharmacology ?? {}, doc.pharmacology ?? {});
      updatedFields = { pharmacology: result.pharmacology };
      changes = result.changes;
    }
  } else {
    const key = opts.section;
    const liveValue = article[key];
    const liveEmpty = deepChars(liveValue) === 0;
    if (opts.mode === "replace" || (opts.mode === "auto" && liveEmpty)) {
      if (!liveEmpty && opts.mode === "replace") {
        console.error(`${opts.slug}/${key}: live section has content; refuse --mode=replace (use --mode=auto for fill-only merge)`);
        process.exit(1);
      }
      updatedFields = { [key]: doc[key] };
      changes = [`${key}: full replace (live section empty)`];
    } else if (opts.mode === "auto" || opts.mode === "merge") {
      const result = deepFillMerge(liveValue, doc[key], key);
      updatedFields = { [key]: result.merged };
      changes = result.changes;
    } else {
      console.error(`Unsupported section/mode combination: ${opts.section} / ${opts.mode}`);
      process.exit(1);
    }
  }

  if (skipped.length > 0) {
    console.log(`${opts.slug}/${opts.section}: ${skipped.length} contentless route(s) withheld`);
    for (const s of skipped) console.log(`  ! ${s}`);
  }

  if (changes.length === 0) {
    console.log(`${opts.slug}/${opts.section}: no-op (nothing to fill; live data already complete)`);
    return;
  }

  console.log(`${opts.slug}/${opts.section} (${opts.mode}): ${changes.length} change(s)`);
  for (const c of changes) console.log(`  - ${c}`);

  if (opts.dryRun) {
    console.log(`[DRY RUN] would ${opts.write ? "write" : "apply"} the above to ${postgresFingerprintFromUrl(targetUrl)}`);
    return;
  }

  assertDataOpsWriteAllowed(runContext);
  const apiKey = requireAdminIntentToken("editorArticleWrite").token;
  const updatedArticle = { ...article, ...updatedFields };
  let lastError;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const result = await client.mutation(api.substanceIndex.saveSubstance, {
        apiKey,
        article: stripDataMetadata(updatedArticle),
      });
      console.log(`${opts.slug}/${opts.section}: applied (${result?.affectedPaths?.length ?? "?"} paths affected)`);
      return;
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (attempt < 4 && /fetch failed|ECONNRESET|ETIMEDOUT|socket hang up|network|503|502|429/i.test(message)) {
        await new Promise((r) => setTimeout(r, 1500 * attempt));
        continue;
      }
      console.error(`${opts.slug}/${opts.section}: FAILED to save: ${message}`);
      process.exit(1);
    }
  }
  console.error(`${opts.slug}/${opts.section}: FAILED after retries: ${lastError}`);
  process.exit(1);
}

import { pathToFileURL } from "node:url";
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack : error);
    process.exit(1);
  });
}
