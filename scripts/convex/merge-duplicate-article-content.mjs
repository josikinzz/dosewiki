#!/usr/bin/env node

/**
 * Rescue unique content from a demoted duplicate article into its surviving
 * counterpart, so demoting the duplicate does not hide information. Additive and
 * fill-only: adds legality countries the survivor lacks and cross-tolerance
 * entries it lacks, never overwriting existing survivor values. Conflicting
 * numeric data (dose ranges) is deliberately NOT merged — see the report output.
 *
 * Usage:
 *   node scripts/convex/merge-duplicate-article-content.mjs --target-url=<url> --dry-run
 *   node scripts/convex/merge-duplicate-article-content.mjs --target-url=<url> --write
 */
import process from "node:process";

const REPO = new URL("../..", import.meta.url).pathname;
const { ConvexHttpClient } = await import(REPO + "node_modules/convex/dist/esm/browser/index.js");
const { api } = await import(REPO + "convex/_generated/api.js");
const { sanitizeObjectKeys, stripConvexMetadata } = await import(REPO + "scripts/batch/summary/articles.mjs");

/** duplicate slug -> surviving slug */
const MERGES = [{ from: "fluorophenibut", into: "f-phenibut" }];

const getFlag = (name) => process.argv.find((a) => a.startsWith(`${name}=`))?.split("=")[1];
const targetUrl = getFlag("--target-url");
const write = process.argv.includes("--write");
const apiKey = process.env.CONVEX_ADMIN_KEY;
if (!targetUrl) { console.error("--target-url=<url> is required"); process.exit(1); }
if (write && !apiKey) { console.error("CONVEX_ADMIN_KEY is required with --write"); process.exit(1); }

const client = new ConvexHttpClient(targetUrl);
const clean = (a) => sanitizeObjectKeys(stripConvexMetadata(a));

const plan = [];
for (const { from, into } of MERGES) {
  const dup = await client.query(api.substanceIndex.getBySlug, { slug: from });
  const keep = await client.query(api.substanceIndex.getBySlug, { slug: into });
  if (!dup || !keep) { console.log(`SKIP ${from} -> ${into}: article missing`); continue; }

  const added = { countries: [], crossTolerance: [] };
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
  if (doseOf(dup) !== doseOf(keep)) conflicts.push("dose_ranges differ between the two articles (kept the survivor's; review manually)");
  const dupFull = dup.tolerance?.full_tolerance ?? "";
  if (dupFull && next.tolerance?.full_tolerance && dupFull !== next.tolerance.full_tolerance) {
    conflicts.push("full_tolerance prose differs (kept the survivor's)");
  }

  if (!added.countries.length && !added.crossTolerance.length) { console.log(`noop ${from} -> ${into}: nothing unique to merge`); }
  else plan.push({ from, into, added, conflicts, article: next });
}

console.log(`\nPlan (${write ? "WRITE" : "dry-run"}) against ${targetUrl}:`);
for (const p of plan) {
  console.log(`  ${p.from} -> ${p.into}`);
  if (p.added.countries.length) console.log(`    + legality countries: ${p.added.countries.join(", ")}`);
  if (p.added.crossTolerance.length) console.log(`    + cross_tolerance: ${p.added.crossTolerance.join(", ")}`);
  for (const c of p.conflicts) console.log(`    ! not merged: ${c}`);
}
if (!write) { console.log("\nDry-run only. Add --write to apply."); process.exit(0); }

for (const p of plan) {
  const result = await client.mutation(api.substanceIndex.saveSubstance, { apiKey, article: clean(p.article) });
  console.log(`  wrote ${p.into}: updated=${result.updated}`);
}
