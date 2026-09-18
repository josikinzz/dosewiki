#!/usr/bin/env node

// Folds voice-fixer proposals into per-slug repair drafts that `legality:apply`
// can ship. Every proposal is gated here before it reaches a draft: `expected`
// must equal the audited live value byte-for-byte, citation markers must survive
// in order, and the new text must pass the voice check. Rejections are written
// beside the drafts so the responsible fixer batch can be re-run.
//
//   npm run legality:build-repair-drafts -- \
//     --voice-audit=tmp/legality-voice-audit-<date>.json \
//     --proposals=tmp/legality-voice-fix-<date>/proposals \
//     --campaign=voice-scrub-<date>

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { getFlagValue } from "../lib/data-ops-run-context.mjs";
import { READER_FIELDS, voiceMatch } from "./voice.mjs";

const argv = process.argv.slice(2);
const voiceAuditPath = getFlagValue(argv, "--voice-audit");
const proposalsDir = getFlagValue(argv, "--proposals");
const campaign = getFlagValue(argv, "--campaign");
const runsRoot = getFlagValue(argv, "--runs-root") ?? "runs/legality";
for (const [flag, value] of [["--voice-audit", voiceAuditPath], ["--proposals", proposalsDir], ["--campaign", campaign]]) {
  if (!value) throw new Error(`${flag} is required.`);
}

const CITE_MARKER = /\[cite:[^\]]+\]/g;
const REPAIR_SECTION = {
  notes: ["notesRepairs", "expectedNotes", "newNotes"],
  status: ["statusRepairs", "expectedStatus", "newStatus"],
  designation: ["designationRepairs", "expectedDesignation", "newDesignation"],
  instrument: ["instrumentRepairs", "expectedInstrument", "newInstrument"],
};

const voiceAudit = JSON.parse(readFileSync(voiceAuditPath, "utf8"));
const auditedById = new Map(voiceAudit.rows.map((row) => [row.id, row]));

function markers(text) {
  return typeof text === "string" ? (text.match(CITE_MARKER) ?? []) : [];
}

/** Returns a rejection reason, or null when the field repair is shippable. */
function gate(row, field, repair) {
  if (!READER_FIELDS.includes(field)) return `unknown field ${field}`;
  const current = row.current[field];
  if (repair.expected !== current) return `${field}.expected differs from the audited live value`;
  if (repair.new === repair.expected) return `${field}.new is identical to expected`;
  if (field === "designation" && repair.new === null) {
    return null;
  }
  if (typeof repair.new !== "string" || repair.new.trim().length === 0) return `${field}.new is empty`;
  if (/\u2014/.test(repair.new)) return `${field}.new contains an em dash`;
  const before = markers(repair.expected);
  const after = markers(repair.new);
  if (before.length !== after.length || before.some((marker, index) => marker !== after[index])) {
    return `${field}.new drops or reorders citation markers`;
  }
  const leak = voiceMatch(field, repair.new);
  if (leak) return `${field}.new still carries process language: "${leak}"`;
  return null;
}

const drafts = new Map();
const rejections = [];
const seen = new Set();
let proposals = 0;
let noChange = 0;

for (const file of readdirSync(proposalsDir).filter((name) => name.endsWith(".json")).sort()) {
  const parsed = JSON.parse(readFileSync(join(proposalsDir, file), "utf8"));
  const items = Array.isArray(parsed) ? parsed : [parsed];
  for (const item of items) {
    proposals += 1;
    const row = auditedById.get(item?.id);
    if (!row) {
      rejections.push({ file, id: item?.id ?? null, reason: "id is not in the voice audit" });
      continue;
    }
    if (seen.has(item.id)) {
      rejections.push({ file, id: item.id, reason: "duplicate proposal for id" });
      continue;
    }
    seen.add(item.id);
    if (item.noChange) {
      noChange += 1;
      continue;
    }
    const repairs = Object.entries(item.repairs ?? {});
    if (repairs.length === 0) {
      rejections.push({ file, id: item.id, reason: "neither repairs nor noChange" });
      continue;
    }
    const accepted = [];
    let rejected = false;
    for (const [field, repair] of repairs) {
      const reason = gate(row, field, repair ?? {});
      if (reason) {
        rejections.push({ file, id: item.id, reason });
        rejected = true;
        break;
      }
      accepted.push([field, repair]);
    }
    if (rejected) continue;
    if (!drafts.has(row.slug)) {
      drafts.set(row.slug, {
        slug: row.slug,
        generatedAt: new Date().toISOString(),
        international: [],
        internationalSources: [],
        entries: {},
        corrections: {},
        gaps: [],
        refuted: [],
      });
    }
    const draft = drafts.get(row.slug);
    for (const [field, repair] of accepted) {
      const [section, expectedKey, newKey] = REPAIR_SECTION[field];
      draft[section] ??= {};
      draft[section][row.jurisdiction] = { [expectedKey]: repair.expected, [newKey]: repair.new };
    }
  }
}

const unproposed = voiceAudit.rows.filter((row) => !seen.has(row.id)).map((row) => row.id);

const written = [];
for (const [slug, draft] of drafts) {
  const dir = resolve(runsRoot, slug, campaign);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "legality-draft.json");
  writeFileSync(path, `${JSON.stringify(draft, null, 2)}\n`);
  written.push(path);
}

const manifest = {
  generatedAt: new Date().toISOString(),
  voiceAudit: voiceAuditPath,
  proposalsDir,
  campaign,
  totals: {
    auditedRows: voiceAudit.rows.length,
    proposals,
    noChange,
    accepted: seen.size - noChange - new Set(rejections.filter((r) => r.id).map((r) => r.id)).size,
    rejected: rejections.length,
    unproposed: unproposed.length,
    drafts: written.length,
  },
  drafts: written,
  rejections,
  unproposed,
};
const manifestDir = resolve(runsRoot, "_manifests");
mkdirSync(manifestDir, { recursive: true });
const manifestPath = join(manifestDir, `${campaign}.json`);
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
if (!existsSync(manifestPath)) throw new Error("manifest write failed");
console.log(`Repair drafts manifest: ${manifestPath}`);
console.log(JSON.stringify(manifest.totals, null, 2));
for (const rejection of rejections) console.log(`REJECT ${rejection.id ?? "?"} (${rejection.file}): ${rejection.reason}`);
