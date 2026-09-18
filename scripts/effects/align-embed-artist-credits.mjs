#!/usr/bin/env node
/**
 * Align the artist credit on every effect-article image embed with the
 * canonical spelling that artist carries in the replication corpus.
 *
 * Why this matters beyond tidiness: an article byline links to the artist's
 * Artist Page by matching its credit line against the gallery corpus
 * (`src/features/effects/vcode/artistCreditLinks.ts`). A credit that spells
 * the same artist differently than their works do resolves to nothing, so the
 * reader gets plain text where a link belongs.
 *
 * Two classes of rewrite, both evidence-gated:
 *
 *  1. Spacing/casing variants. `artist="StasConstantine"` versus the corpus's
 *     "Stas Constantine" (32 works). Matched on the alphanumeric-only key, and
 *     only when that key names exactly one corpus artist.
 *  2. Explicit aliases below. A typo cannot be derived from the corpus, so
 *     each one is listed with the evidence that identifies the artist.
 *
 * Credits with no corpus counterpart are left exactly as written: an unlinked
 * credit is correct when the artist genuinely holds nothing on the site.
 *
 *   node scripts/effects/align-embed-artist-credits.mjs --target=<url>
 *   node scripts/effects/align-embed-artist-credits.mjs --target=<url> \
 *     --write --confirm-write=align-embed-artist-credits \
 *     --expected-deployment=<host>/<database>
 */
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

/**
 * Credits the corpus cannot match on spelling alone. Each entry names the
 * corpus rows that identify the artist.
 */
const CREDIT_ALIASES = {
  // "Josikinz" appears once, on symmetrical-texture-repetition. The corpus
  // spells the site owner's replication credit "Josie Kins" (13 works),
  // "Josikins" and "josikins" (21) — never with a trailing z.
  josikinz: "Josie Kins",
  // "StingrayZ" is Symmetric Vision's retired handle (owner-confirmed rename);
  // the corpus carries 520 works under "Symmetric Vision" and none under the
  // old handle, so the article credits are the only place it survives.
  stingrayz: "Symmetric Vision",
};

const looseKey = (value) => (value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const exactKey = (value) => (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");

const client = createDataClient({ target: command.targetUrl }).client;
const [effects, replications] = await Promise.all([
  client.query(api.subjectiveEffects.getAll, {}),
  client.query(api.replications.getAll, {}),
]);

// Canonical spelling per loose key: the corpus spelling carried by the most
// works, so a one-off misspelling among an artist's rows cannot win.
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

/** The canonical credit for one article byline, or null to leave it alone. */
function canonicalCredit(artist) {
  const credit = artist?.trim();
  if (!credit) return null;
  if (corpusExactKeys.has(exactKey(credit))) return null;
  const aliased = CREDIT_ALIASES[looseKey(credit)];
  const canonical = aliased ?? canonicalByLooseKey.get(looseKey(credit));
  return canonical && canonical !== credit ? canonical : null;
}

const creditPattern = /(\[captioned-image\b[^\]]*?\bartist=")([^"]*)(")/g;

/** Rewrite raw markup credits and AST `properties.artist` alike. */
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

/** Every artist credit an embed carries, from raw markup and AST alike. */
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

// Post-write verification: every aligned credit now reads the canonical
// spelling, and no field still carries the old one.
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
