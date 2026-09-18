#!/usr/bin/env node

// Conservative sentence-level recovery for markers a rebase dropped.
//
// A rebase drops a whole field's markers when the field's live text no longer
// matches the draft's marked text byte-for-byte. Often only some sentences in
// that field actually changed. This script looks for individual marked
// sentences from the ORIGINAL draft whose exact text still appears, unchanged,
// in the current live field — and only recovers those. It refuses anything
// that could silently corrupt an article:
//
//   - the host sentence must be a real sentence (>= MIN_HOST_LENGTH chars,
//     ending in terminal punctuation), never a bare fragment
//   - the host sentence must occur exactly once in the current live text
//     (an ambiguous match could insert a marker at the wrong occurrence)
//   - a `supported` evidence row referencing the marker id(s) must still
//     exist in the original draft
//
// Default mode is report-only. --write applies recovered markers to the
// workbench's citation-draft.rebased.json (creating the section/field if the
// whole-field/section was dropped) and restores the evidence/reference/source
// rows those markers need — nothing else in the draft is touched.

import { join, resolve } from "node:path";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createDataClient, resolvePostgresSource } from "../lib/data-client.ts";
import { api } from "../../lib/postgres/runtime/api.ts"
import { getFlagValue } from "../lib/data-ops-run-context.mjs";
import { parsePath, normalizeFieldPath, sanitizeReference } from "./rebase-workbench-draft.mjs";
import { resolveCitationWorkbenchRoot } from "./citation-workbench-root.mjs";

const MIN_HOST_LENGTH = 25;
const SENTENCE_WITH_MARKERS = /([^.!?]*[.!?])((?:\s*\[cite:[^\]]+\])+)/g;
const MARKER_PATTERN = /\[cite:([^\]\s]+)\]/g;

const clone = (value) => JSON.parse(JSON.stringify(value));

function getAtPath(value, segments) {
  let current = value;
  for (const segment of segments) {
    if (current == null) return undefined;
    current = current[segment];
  }
  return current;
}

function setAtPath(target, segments, value) {
  let current = target;
  for (let i = 0; i < segments.length - 1; i += 1) {
    const segment = segments[i];
    const next = segments[i + 1];
    if (current[segment] == null) current[segment] = typeof next === "number" ? [] : {};
    current = current[segment];
  }
  current[segments.at(-1)] = value;
}

function fieldPathToSectionAndRelative(fieldPath) {
  const sectionKey = fieldPath.split(".")[0];
  const relative = fieldPath === sectionKey ? "" : fieldPath.slice(sectionKey.length + 1);
  return { sectionKey, relative };
}

export function extractMarkedSentences(text) {
  const sentences = [];
  for (const match of text.matchAll(SENTENCE_WITH_MARKERS)) {
    const host = match[1].trim();
    const ids = [...match[2].matchAll(MARKER_PATTERN)].map((m) => m[1]);
    sentences.push({ host, ids, endsWithPunctuation: /[.!?]$/.test(host) });
  }
  return sentences;
}

export function findRecoverableSentences({ originalText, currentText, fieldPath, evidence }) {
  const candidates = [];
  for (const { host, ids, endsWithPunctuation } of extractMarkedSentences(originalText)) {
    if (!host || host.length < MIN_HOST_LENGTH || !endsWithPunctuation) {
      candidates.push({ host, ids, status: "rejected", reason: "fragment_too_short_or_no_terminal_punctuation" });
      continue;
    }
    const occurrences = currentText.split(host).length - 1;
    if (occurrences !== 1) {
      candidates.push({ host, ids, status: "rejected", reason: occurrences === 0 ? "not_found_in_live_text" : "ambiguous_multiple_occurrences" });
      continue;
    }
    // An evidence row counts as covering this sentence only when its own
    // claim text is actually contained in the sentence we are about to mark —
    // matching by field path and reference id alone would also match rows for
    // sibling claims in the same field whose sentences were not recovered.
    const normalizedFieldPath = normalizeFieldPath(fieldPath);
    const hasEvidence = ids.every((id) =>
      (evidence ?? []).some((row) => {
        if (row.status !== "supported") return false;
        if (normalizeFieldPath(row.fieldPath ?? "") !== normalizedFieldPath) return false;
        if (!(row.referenceIds ?? []).includes(id)) return false;
        const claimText = (row.claimText ?? "").trim();
        return claimText.length > 0 && (host.includes(claimText) || claimText.includes(host));
      }));
    if (!hasEvidence) {
      candidates.push({ host, ids, status: "rejected", reason: "no_matching_evidence_row_for_sentence" });
      continue;
    }
    candidates.push({ host, ids, status: "recoverable" });
  }
  return candidates;
}

async function loadLiveArticle(slug, sourceUrl) {
  const client = createDataClient({ target: sourceUrl }).client;
  const article = await client.query(api.substanceIndex.getBySlug, { slug });
  if (!article) throw new Error(`No article found for slug: ${slug}`);
  return article;
}

async function main() {
  const argv = process.argv.slice(2);
  const slug = getFlagValue(argv, "--slug");
  if (!slug) {
    console.error("Usage: node scripts/citations/recover-dropped-sentences.mjs --slug=<slug> [--write]");
    process.exit(1);
  }
  const write = argv.includes("--write");
  const workbenchRunDir = join(resolveCitationWorkbenchRoot(), "runs", slug);
  const originalPath = resolve(getFlagValue(argv, "--draft") ?? join(workbenchRunDir, "citation-draft.json"));
  const rebasedPath = resolve(getFlagValue(argv, "--rebased") ?? join(workbenchRunDir, "citation-draft.rebased.json"));

  const original = JSON.parse(readFileSync(originalPath, "utf8"));
  if (!existsSync(rebasedPath)) {
    console.error(`No rebased draft at ${rebasedPath}. Run rebase-workbench-draft.mjs first.`);
    process.exit(1);
  }
  const rebased = JSON.parse(readFileSync(rebasedPath, "utf8"));
  if (write && rebased.rebase?.sentenceRecovery) {
    console.error(
      `${slug}: this rebased draft already has a sentenceRecovery record ` +
      `(${rebased.rebase.sentenceRecovery.recoveredMarkerCount} markers). ` +
      `Recovery is not idempotent — re-running --write would double-insert markers. ` +
      `Re-run rebase-workbench first if you need to start over.`,
    );
    process.exit(1);
  }
  const dropped = rebased.rebase?.report?.dropped ?? [];
  const textChangedDrops = dropped.filter((entry) => entry.reason === "live_text_changed");
  if (textChangedDrops.length === 0) {
    console.log(`${slug}: no live_text_changed drops to recover.`);
    return;
  }

  const { url } = resolvePostgresSource({ argv });
  if (!url) {
    console.error("Select the live Postgres source with --source-url / SOURCE_POSTGRES_URL or the canonical target.");
    process.exit(1);
  }
  const liveArticle = await loadLiveArticle(slug, url);

  const results = [];
  for (const drop of textChangedDrops) {
    const { sectionKey, relative } = fieldPathToSectionAndRelative(drop.fieldPath);
    const segments = parsePath(relative);
    const originalText = relative === "" ? original.markedSections[sectionKey] : getAtPath(original.markedSections[sectionKey], segments);
    const currentSectionInRebased = rebased.markedSections[sectionKey];
    const currentText = currentSectionInRebased !== undefined
      ? (relative === "" ? currentSectionInRebased : getAtPath(currentSectionInRebased, segments))
      : (relative === "" ? liveArticle[sectionKey] : getAtPath(liveArticle[sectionKey], segments));

    if (typeof originalText !== "string" || typeof currentText !== "string") {
      results.push({ fieldPath: drop.fieldPath, sentences: [], skipped: "non_string_field" });
      continue;
    }

    const sentences = findRecoverableSentences({
      originalText,
      currentText,
      fieldPath: drop.fieldPath,
      evidence: original.evidence,
    });
    results.push({ fieldPath: drop.fieldPath, sectionKey, relative, sentences, originalText, currentText });
  }

  console.log(`\n${slug}: sentence-level recovery report`);
  let totalRecoverable = 0;
  let totalRejected = 0;
  for (const result of results) {
    console.log(`\n  ${result.fieldPath}`);
    if (result.skipped) {
      console.log(`    skipped: ${result.skipped}`);
      continue;
    }
    for (const s of result.sentences) {
      const idStr = s.ids.join(", ");
      if (s.status === "recoverable") {
        totalRecoverable += s.ids.length;
        console.log(`    RECOVER  [${idStr}]  "${s.host}"`);
      } else {
        totalRejected += s.ids.length;
        console.log(`    reject   [${idStr}]  (${s.reason})  "${s.host}"`);
      }
    }
  }
  console.log(`\n  Totals: ${totalRecoverable} markers recoverable, ${totalRejected} rejected.\n`);

  const jsonPath = getFlagValue(argv, "--json");
  if (jsonPath) {
    const payload = {
      slug,
      totalRecoverable,
      totalRejected,
      fields: results.map((result) => ({
        fieldPath: result.fieldPath,
        skipped: result.skipped ?? null,
        currentText: result.currentText ?? null,
        sentences: (result.sentences ?? []).map((s) => ({
          host: s.host,
          ids: s.ids,
          status: s.status,
          reason: s.reason ?? null,
        })),
      })),
    };
    writeFileSync(resolve(jsonPath), `${JSON.stringify(payload, null, 2)}\n`);
    console.log(`Wrote recovery JSON to ${resolve(jsonPath)}`);
  }

  if (!write) {
    console.log("Report-only run (pass --write to apply). No files changed.");
    return;
  }

  if (totalRecoverable === 0) {
    console.log("Nothing recoverable; leaving rebased draft unchanged.");
    return;
  }

  const updated = clone(rebased);
  const recoveredFieldPaths = new Set();
  for (const result of results) {
    if (result.skipped) continue;
    const recoverable = result.sentences.filter((s) => s.status === "recoverable");
    if (recoverable.length === 0) continue;

    let sectionValue = updated.markedSections[result.sectionKey];
    if (sectionValue === undefined) {
      sectionValue = result.relative === "" ? liveArticle[result.sectionKey] : clone(liveArticle[result.sectionKey]);
    }
    let fieldText = result.relative === "" ? sectionValue : getAtPath(sectionValue, parsePath(result.relative));
    for (const s of recoverable) {
      const markerSuffix = s.ids.map((id) => `[cite:${id}]`).join("");
      fieldText = fieldText.replace(s.host, s.host + markerSuffix);
    }
    if (result.relative === "") {
      sectionValue = fieldText;
    } else {
      setAtPath(sectionValue, parsePath(result.relative), fieldText);
    }
    updated.markedSections[result.sectionKey] = sectionValue;
    recoveredFieldPaths.add(normalizeFieldPath(result.fieldPath));
  }

  const recoveredIds = new Set(
    results.flatMap((r) => (r.skipped ? [] : r.sentences.filter((s) => s.status === "recoverable").flatMap((s) => s.ids))),
  );
  // Restore only evidence rows whose claim text is actually contained in a
  // recovered host sentence for the same field path — matching by field path
  // alone would also restore rows for sentences we deliberately rejected
  // (same field, different claim, changed or unmatched text).
  const recoveredHostsByFieldPath = new Map();
  for (const result of results) {
    if (result.skipped) continue;
    const hosts = result.sentences.filter((s) => s.status === "recoverable").map((s) => s.host);
    if (hosts.length > 0) recoveredHostsByFieldPath.set(normalizeFieldPath(result.fieldPath), hosts);
  }
  const restoredEvidence = (original.evidence ?? []).filter((row) => {
    if (row.status !== "supported") return false;
    const hosts = recoveredHostsByFieldPath.get(normalizeFieldPath(row.fieldPath ?? ""));
    if (!hosts) return false;
    const claimText = (row.claimText ?? "").trim();
    if (!claimText) return false;
    return hosts.some((host) => host.includes(claimText) || claimText.includes(host));
  });
  const existingEvidenceKeys = new Set(updated.evidence.map((row) => `${row.fieldPath}::${row.claimKey}`));
  for (const row of restoredEvidence) {
    const key = `${row.fieldPath}::${row.claimKey}`;
    if (!existingEvidenceKeys.has(key)) updated.evidence.push(row);
  }

  const existingReferenceIds = new Set(updated.references.map((r) => r.id));
  for (const id of recoveredIds) {
    if (existingReferenceIds.has(id)) continue;
    const reference = (original.references ?? []).find((r) => r.id === id);
    if (reference) {
      updated.references.push(sanitizeReference(reference));
      existingReferenceIds.add(id);
    }
  }
  const existingSourceIds = new Set(updated.sources.map((s) => s.id));
  for (const source of original.sources ?? []) {
    const ids = [source.referenceId, ...(source.referenceIds ?? [])].filter(Boolean);
    if (ids.some((id) => recoveredIds.has(id)) && !existingSourceIds.has(source.id)) {
      updated.sources.push(source);
      existingSourceIds.add(source.id);
    }
  }

  updated.rebase.sentenceRecovery = {
    recoveredAt: new Date().toISOString(),
    recoveredMarkerCount: totalRecoverable,
    recoveredFieldPaths: [...recoveredFieldPaths],
  };

  writeFileSync(rebasedPath, `${JSON.stringify(updated, null, 2)}\n`);
  console.log(`Wrote ${totalRecoverable} recovered markers into ${rebasedPath}`);
}

const isDirectRun = process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").at(-1));
if (isDirectRun) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
