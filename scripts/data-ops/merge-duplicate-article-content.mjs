#!/usr/bin/env node

/**
 * Rescue unique content from a demoted duplicate article into its surviving
 * counterpart, so demoting the duplicate does not hide information. Additive and
 * fill-only: adds legality countries the survivor lacks and cross-tolerance
 * entries it lacks, never overwriting existing survivor values.
 *
 * Conflicting values are reported rather than merged, except with
 * `--dose-policy=lower`, which reconciles differing dose ranges by taking the
 * lower value for every tier bound across the two articles. Lower is the
 * conservative reading when two sources disagree on how much of a drug is a
 * given tier, so the published range never advises more than the most cautious
 * source. An absent upper bound reads as unbounded, so a defined number always
 * wins over it. Ranges are only reconciled when both articles use the same
 * route and unit.
 *
 * Usage:
 *   node scripts/data-ops/merge-duplicate-article-content.mjs --target=<url> --dry-run
 *   node scripts/data-ops/merge-duplicate-article-content.mjs --target=<url> --write \
 *     --confirm-write=merge-duplicate-article-content --expected-deployment=<name>
 */
import process from "node:process";

import {
  assertProductionWriteAllowed,
  createProductionWriteCommand,
  printProductionWriteCommand,
  requireProductionWriteCredential,
} from "../lib/production-write-command.mjs";
import { createDataClient, postgresFingerprintFromUrl } from "../lib/data-client.ts";

const REPO = new URL("../..", import.meta.url).pathname;
const { api } = await import(REPO + "lib/postgres/runtime/api.ts");
const { sanitizeObjectKeys, stripDataMetadata } = await import(REPO + "scripts/batch/summary/articles.mjs");

/** duplicate slug -> surviving slug */
const MERGES = [{ from: "fluorophenibut", into: "f-phenibut" }];

const argv = process.argv.slice(2);
const getFlag = (name) => argv.find((arg) => arg.startsWith(`${name}=`))?.split("=")[1];
const command = createProductionWriteCommand({
  operation: "merge-duplicate-article-content",
  argv,
});
const targetUrl = command.targetUrl;
const dosePolicy = getFlag("--dose-policy");
if (dosePolicy && dosePolicy !== "lower") {
  console.error(`Unknown --dose-policy=${dosePolicy}; the only supported policy is "lower".`);
  process.exit(1);
}
const write = command.writeRequested;
if (!targetUrl) { console.error("--target=<url> or TARGET_POSTGRES_URL is required"); process.exit(1); }
printProductionWriteCommand(command);

const client = createDataClient({ target: targetUrl }).client;
const clean = (a) => sanitizeObjectKeys(stripDataMetadata(a));

/** The lower of two tier bounds; null (unbounded) loses to any defined number. */
const lowerBound = (a, b) => {
  if (typeof a !== "number") return typeof b === "number" ? b : null;
  if (typeof b !== "number") return a;
  return Math.min(a, b);
};

/**
 * Rebuild a route's dose_ranges taking the lower value for every tier bound.
 * Returns null when nothing changes or the two routes are not comparable.
 */
const reconcileRouteDoses = (keepRoute, dupRoute) => {
  if (!keepRoute?.dose_ranges || !dupRoute?.dose_ranges) return null;
  if (keepRoute.route !== dupRoute.route) return null;
  const next = {};
  const changes = [];
  for (const [tier, keepRange] of Object.entries(keepRoute.dose_ranges)) {
    const dupRange = dupRoute.dose_ranges[tier];
    if (!dupRange || !keepRange) { next[tier] = keepRange; continue; }
    if (keepRange.unit !== dupRange.unit) { next[tier] = keepRange; continue; }
    const merged = { ...keepRange, min: lowerBound(keepRange.min, dupRange.min), max: lowerBound(keepRange.max, dupRange.max) };
    next[tier] = merged;
    if (merged.min !== keepRange.min || merged.max !== keepRange.max) {
      const fmt = (r) => `${r.min ?? "-"}-${r.max ?? "+"}${r.unit ?? ""}`;
      changes.push(`${tier} ${fmt(keepRange)} -> ${fmt(merged)}`);
    }
  }
  return changes.length ? { doseRanges: next, changes } : null;
};

const plan = [];
for (const { from, into } of MERGES) {
  const dup = await client.query(api.substanceIndex.getBySlug, { slug: from });
  const keep = await client.query(api.substanceIndex.getBySlug, { slug: into });
  if (!dup || !keep) { console.log(`SKIP ${from} -> ${into}: article missing`); continue; }

  const added = { countries: [], crossTolerance: [], doses: [] };
  const next = structuredClone(keep);

  const keepCountries = next.legality?.countries ?? {};
  for (const [country, entry] of Object.entries(dup.legality?.countries ?? {})) {
    if (!keepCountries[country]) { keepCountries[country] = entry; added.countries.push(country); }
  }
  if (added.countries.length) next.legality = { ...(next.legality ?? {}), countries: keepCountries };

  const keepCross = next.tolerance?.cross_tolerance ?? [];
  const merged = [...keepCross];
  for (const item of dup.tolerance?.cross_tolerance ?? []) {
    if (!merged.includes(item)) { merged.push(item); added.crossTolerance.push(item); }
  }
  if (added.crossTolerance.length) next.tolerance = { ...(next.tolerance ?? {}), cross_tolerance: merged };

  const conflicts = [];
  const doseOf = (a) => JSON.stringify(a.dosage?.routes?.[0]?.dose_ranges ?? null);
  if (doseOf(dup) !== doseOf(keep)) {
    const keepRoutes = next.dosage?.routes ?? [];
    const reconciled = dosePolicy === "lower"
      ? keepRoutes.map((route) => {
          const dupRoute = (dup.dosage?.routes ?? []).find((r) => r.route === route.route);
          const result = reconcileRouteDoses(route, dupRoute);
          if (result) added.doses.push(`${route.route}: ${result.changes.join("; ")}`);
          return result ? { ...route, dose_ranges: result.doseRanges } : route;
        })
      : null;
    if (reconciled && added.doses.length) next.dosage = { ...(next.dosage ?? {}), routes: reconciled };
    else conflicts.push("dose_ranges differ between the two articles (kept the survivor's; re-run with --dose-policy=lower to reconcile)");
  }
  const dupFull = dup.tolerance?.full_tolerance ?? "";
  if (dupFull && next.tolerance?.full_tolerance && dupFull !== next.tolerance.full_tolerance) {
    conflicts.push("full_tolerance prose differs (kept the survivor's)");
  }

  if (!added.countries.length && !added.crossTolerance.length && !added.doses.length) { console.log(`noop ${from} -> ${into}: nothing unique to merge`); }
  else plan.push({ from, into, added, conflicts, article: next });
}

console.log(`\nPlan (${write ? "WRITE" : "dry-run"}) against ${postgresFingerprintFromUrl(targetUrl)}:`);
for (const p of plan) {
  console.log(`  ${p.from} -> ${p.into}`);
  if (p.added.countries.length) console.log(`    + legality countries: ${p.added.countries.join(", ")}`);
  if (p.added.crossTolerance.length) console.log(`    + cross_tolerance: ${p.added.crossTolerance.join(", ")}`);
  for (const d of p.added.doses) console.log(`    ~ dose_ranges lowered: ${d}`);
  for (const c of p.conflicts) console.log(`    ! not merged: ${c}`);
}
if (!write) { console.log("\nDry-run only. Add the explicit production write flags to apply."); process.exit(0); }

assertProductionWriteAllowed(command);
const apiKey = requireProductionWriteCredential("editorArticleWrite").token;
for (const p of plan) {
  const result = await client.mutation(api.substanceIndex.saveSubstance, { apiKey, article: clean(p.article) });
  console.log(`  wrote ${p.into}: updated=${result.updated}`);
}
