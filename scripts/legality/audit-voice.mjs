#!/usr/bin/env node

// Scans a legality subsection audit (`legality:audit-subsections` output) for
// process language in reader-facing fields and writes one row per offending
// subsection. Pure function of the audit file: no Postgres access.
//
//   npm run legality:audit-voice -- --audit=tmp/legality-subsection-audit-<date>.json \
//     --out=tmp/legality-voice-audit-<date>.json [--slug=<slug>]

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { getFlagValue } from "../lib/data-ops-run-context.mjs";
import { voiceHits, voiceMatch } from "./voice.mjs";

const argv = process.argv.slice(2);
const auditPath = getFlagValue(argv, "--audit");
const output = getFlagValue(argv, "--out") ?? "tmp/legality-voice-audit.json";
const onlySlug = getFlagValue(argv, "--slug") ?? null;

if (!auditPath) throw new Error("--audit=<subsection audit json> is required.");
if (!existsSync(auditPath)) throw new Error(`Audit file not found: ${auditPath}`);

const audit = JSON.parse(readFileSync(auditPath, "utf8"));
const rows = [];
for (const row of audit.rows ?? []) {
  if (row.kind !== "country") continue;
  if (onlySlug && row.slug !== onlySlug) continue;
  const hits = voiceHits(row.value, "audit").map((hit) => ({
    ...hit,
    blocking: voiceMatch(hit.field, row.value?.[hit.field]) !== null,
  }));
  if (hits.length === 0) continue;
  rows.push({
    id: `${row.slug}|${row.jurisdiction}`,
    slug: row.slug,
    jurisdiction: row.jurisdiction,
    visibility: row.visibility,
    contentHash: row.contentHash,
    hits,
    current: {
      status: row.value?.status ?? null,
      notes: row.value?.notes ?? null,
      designation: row.value?.designation ?? null,
      instrument: row.value?.instrument ?? null,
      canonicalStatus: row.value?.canonicalStatus ?? null,
    },
  });
}

const byField = {};
let blockingRows = 0;
for (const row of rows) {
  if (row.hits.some((hit) => hit.blocking)) blockingRows += 1;
  for (const hit of row.hits) byField[hit.field] = (byField[hit.field] ?? 0) + 1;
}

const result = {
  schemaVersion: "dosewiki_legality_voice_audit_v1",
  generatedAt: new Date().toISOString(),
  auditSource: auditPath,
  totals: {
    subsectionsScanned: (audit.rows ?? []).filter((row) => row.kind === "country" && (!onlySlug || row.slug === onlySlug)).length,
    flagged: rows.length,
    blocking: blockingRows,
    advisoryOnly: rows.length - blockingRows,
    articles: new Set(rows.map((row) => row.slug)).size,
    hitsByField: byField,
  },
  rows,
};

const path = resolve(output);
mkdirSync(dirname(path), { recursive: true });
writeFileSync(path, `${JSON.stringify(result, null, 2)}\n`);
console.log(`Legality voice audit: ${path}`);
console.log(JSON.stringify(result.totals, null, 2));
