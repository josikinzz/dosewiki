#!/usr/bin/env node
import { createDataClient } from "../lib/data-client.ts";
import { api } from "../../lib/postgres/runtime/api.ts"
import {
  assertProductionWriteAllowed,
  createProductionWriteCommand,
  printProductionWriteCommand,
  requireProductionWriteCredential,
} from "../lib/production-write-command.mjs";

const operation = "align-embed-artist-credits";
const command = createProductionWriteCommand({ operation });
if (!command.targetUrl) throw new Error("Pass an explicit --target for dry runs and writes.");
printProductionWriteCommand(command);

const mediaFields = [
  "description_raw", "description_ast", "long_summary_raw", "long_summary_ast",
  "analysis_raw", "analysis_ast", "style_variations_raw", "style_variations_ast",
  "personal_commentary_raw", "personal_commentary_ast",
];

const CREDIT_ALIASES = {
  josikinz: "Josie Kins",
  stingrayz: "Symmetric Vision",
};

const looseKey = (value) => (value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const exactKey = (value) => (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");

const client = createDataClient({ target: command.targetUrl }).client;
const [effects, replications] = await Promise.all([
  client.query(api.subjectiveEffects.getAll, {}),
  client.query(api.replications.getAll, {}),
]);

const spellingCounts = new Map();
for (const row of replications) {
  const artist = row.artist?.trim();
  if (!artist) continue;
  const key = looseKey(artist);
  if (!key) continue;
  const counts = spellingCounts.get(key) ?? new Map();
  counts.set(artist, (counts.get(artist) ?? 0) + 1);
  spellingCounts.set(key, counts);
}
const canonicalByLooseKey = new Map();
for (const [key, counts] of spellingCounts) {
  const [canonical] = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  canonicalByLooseKey.set(key, canonical[0]);
}
const corpusExactKeys = new Set(
  replications.flatMap((row) => (row.artist?.trim() ? [exactKey(row.artist)] : [])),
);

function canonicalCredit(artist) {
  const credit = artist?.trim();
  if (!credit) return null;
  if (corpusExactKeys.has(exactKey(credit))) return null;
  const aliased = CREDIT_ALIASES[looseKey(credit)];
  const canonical = aliased ?? canonicalByLooseKey.get(looseKey(credit));
  return canonical && canonical !== credit ? canonical : null;
}

const creditPattern = /(\[captioned-image\b[^\]]*?\bartist=")([^"]*)(")/g;

function rewriteCredits(value, rewrites) {
  if (typeof value === "string") {
    return value.replace(creditPattern, (match, head, artist, tail) => {
      const canonical = rewrites.get(exactKey(artist));
      return canonical ? `${head}${canonical}${tail}` : match;
    });
  }
  if (Array.isArray(value)) return value.map((item) => rewriteCredits(item, rewrites));
  if (value && typeof value === "object") {
    const next = Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, rewriteCredits(item, rewrites)]),
    );
    if (value.name === "captioned-image" && typeof value.properties?.artist === "string") {
      const canonical = rewrites.get(exactKey(value.properties.artist));
      if (canonical) next.properties = { ...next.properties, artist: canonical };
    }
    return next;
  }
  return value;
}

function collectCredits(value, out = []) {
  if (typeof value === "string") {
    for (const [, , artist] of value.matchAll(creditPattern)) out.push(artist);
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectCredits(item, out);
    return out;
  }
  if (value && typeof value === "object") {
    if (value.name === "captioned-image" && typeof value.properties?.artist === "string") {
      out.push(value.properties.artist);
    }
    for (const item of Object.values(value)) collectCredits(item, out);
  }
  return out;
}

const plans = [];
const unresolved = new Map();
for (const effect of effects) {
  const rewrites = new Map();
  for (const field of mediaFields) {
    const value = effect[field];
    if (value === undefined || value === null) continue;
    for (const artist of collectCredits(value)) {
      const credit = artist.trim();
      if (!credit || corpusExactKeys.has(exactKey(credit))) continue;
      const canonical = canonicalCredit(credit);
      if (canonical) {
        rewrites.set(exactKey(credit), canonical);
        continue;
      }
      const seen = unresolved.get(credit) ?? new Set();
      seen.add(effect.slug);
      unresolved.set(credit, seen);
    }
  }
  if (rewrites.size === 0) continue;

  const changes = mediaFields.flatMap((field) => {
    if (effect[field] === undefined || effect[field] === null) return [];
    const value = rewriteCredits(effect[field], rewrites);
    return JSON.stringify(value) === JSON.stringify(effect[field])
      ? []
      : [{ field, expected: effect[field], value }];
  });
  if (changes.length > 0) plans.push({ slug: effect.slug, rewrites, changes });
}

console.log(`Articles scanned: ${effects.length}`);
console.log(`Articles to align: ${plans.length}`);
for (const plan of plans) {
  for (const [from, to] of plan.rewrites) {
    console.log(`  ${plan.slug}: "${from}" -> "${to}" (${plan.changes.map(({ field }) => field).join(", ")})`);
  }
}
console.log(`Credits with no corpus counterpart (left as written): ${unresolved.size}`);
for (const [artist, slugs] of unresolved) {
  console.log(`  "${artist}" in ${[...slugs].join(", ")}`);
}

if (command.dryRun) {
  console.log("\nDry run complete. Re-run with the write and confirmation flags to apply.");
  process.exit(0);
}

assertProductionWriteAllowed(command);
const credential = requireProductionWriteCredential("replicationMaintenance");

for (const plan of plans) {
  await client.mutation(api.subjectiveEffects.repairLegacyMedia, {
    apiKey: credential.token,
    slug: plan.slug,
    changes: plan.changes,
    clearSocialMediaImage: false,
  });
  console.log(`ALIGNED ${plan.slug} (${plan.changes.map(({ field }) => field).join(", ")})`);
}

let failures = 0;
for (const plan of plans) {
  const effect = await client.query(api.subjectiveEffects.getBySlug, { slug: plan.slug });
  for (const [from, to] of plan.rewrites) {
    const serialized = JSON.stringify(
      mediaFields.map((field) => effect?.[field] ?? null),
    );
    const stale = serialized.includes(`artist=\\"${from}\\"`)
      || serialized.includes(`"artist":"${from}"`);
    const present = serialized.includes(`artist=\\"${to}\\"`)
      || serialized.includes(`"artist":"${to}"`);
    if (stale || !present) {
      failures += 1;
      console.error(`VERIFY FAILED ${plan.slug}: staleCreditGone=${!stale} canonicalPresent=${present}`);
    } else {
      console.log(`VERIFIED ${plan.slug}: "${from}" now reads "${to}"`);
    }
  }
}
if (failures > 0) throw new Error(`${failures} post-write verification(s) failed.`);
