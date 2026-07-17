#!/usr/bin/env node

// Rebase a marker-only workbench citation draft onto the current live article.
//
// For every marked string field in the draft, if stripping `[cite:...]` markers
// reproduces the live article text exactly, the markers are transplanted onto a
// clone of the live section. Fields whose live prose has changed drop their
// markers (recorded in the rebase report), and evidence/references/sources that
// only backed dropped markers are pruned so the rebased draft stays coherent.
// The strict byte-equality apply validation is unchanged; a rebased draft
// matches live text by construction for every field it still marks.

import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { readFileSync, writeFileSync } from "node:fs";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api.js";
import { stripCitationMarkers } from "./citation-only-validator.mjs";
import { getFlagValue } from "../lib/data-ops-run-context.mjs";

const CITABLE_SECTIONS = [
  "summary",
  "pharmacology",
  "tolerance",
  "harm_potential",
  "history_culture",
  "legality",
];

const MARKER_PATTERN = /\[cite:([^\]\s]+)\]/g;

export function parsePath(path) {
  if (!path) return [];
  const segments = [];
  for (const part of path.split(".")) {
    const match = part.match(/^([^[\]]*)((?:\[\d+\])*)$/);
    if (!match) throw new Error(`Unparseable field path segment: ${part}`);
    if (match[1]) segments.push(match[1]);
    for (const index of match[2].matchAll(/\[(\d+)\]/g)) {
      segments.push(Number(index[1]));
    }
  }
  return segments;
}

export function normalizeFieldPath(path) {
  return path.replace(/\.(\d+)(?=\.|$)/g, "[$1]");
}

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
  for (const segment of segments.slice(0, -1)) {
    current = current[segment];
    if (current == null) throw new Error(`Cannot set path through missing segment: ${segment}`);
  }
  current[segments.at(-1)] = value;
}

function collectMarkedStrings(value, path = "") {
  if (typeof value === "string") {
    return value.includes("[cite:") ? [{ path, text: value }] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => collectMarkedStrings(entry, `${path}[${index}]`));
  }
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, entry]) =>
      collectMarkedStrings(entry, path ? `${path}.${key}` : key));
  }
  return [];
}

function markerIds(text) {
  return [...text.matchAll(MARKER_PATTERN)].map((match) => match[1]);
}

const clone = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

// Reference fields the Convex article contract rejects if left in their raw
// workbench form: a `template` outside the allowed set, or numeric
// volume/issue/pages. Any code path that writes references into a draft the
// apply step will consume must run them through this first.
const ALLOWED_TEMPLATES = new Set(["cite_journal", "cite_book", "cite_web", "cite_report", "cite_database", "unknown"]);
export function sanitizeReference(reference) {
  const sanitized = { ...reference };
  if (sanitized.template != null && !ALLOWED_TEMPLATES.has(sanitized.template)) {
    sanitized.template = "unknown";
  }
  for (const field of ["volume", "issue", "pages"]) {
    if (typeof sanitized[field] === "number") sanitized[field] = String(sanitized[field]);
  }
  return sanitized;
}

export function rebaseWorkbenchDraft({ draft, article }) {
  if (draft?.citationMode !== "marker_only" || !draft.markedSections) {
    throw new Error("Rebase supports marker_only drafts with markedSections only.");
  }

  const rebasedSections = {};
  const transplanted = [];
  const dropped = [];
  const skippedSections = [];

  for (const [sectionKey, draftSection] of Object.entries(draft.markedSections)) {
    if (!CITABLE_SECTIONS.includes(sectionKey)) {
      skippedSections.push({ sectionKey, reason: "non_citable" });
      continue;
    }
    const liveSection = article?.[sectionKey];
    if (liveSection == null) {
      skippedSections.push({ sectionKey, reason: "missing_live_section" });
      continue;
    }

    const candidates = collectMarkedStrings(draftSection);
    if (candidates.length === 0) {
      skippedSections.push({ sectionKey, reason: "no_markers_in_draft" });
      continue;
    }

    let rebased = clone(liveSection);
    let kept = 0;
    for (const { path, text } of candidates) {
      const liveValue = path === "" ? liveSection : getAtPath(liveSection, parsePath(path));
      if (typeof liveValue === "string" && stripCitationMarkers(text) === liveValue) {
        if (path === "") {
          rebased = text;
        } else {
          setAtPath(rebased, parsePath(path), text);
        }
        kept += 1;
        transplanted.push({
          section: sectionKey,
          fieldPath: path ? `${sectionKey}.${path}` : sectionKey,
          markerCount: markerIds(text).length,
        });
      } else {
        dropped.push({
          section: sectionKey,
          fieldPath: path ? `${sectionKey}.${path}` : sectionKey,
          markerIds: markerIds(text),
          reason: typeof liveValue === "string" ? "live_text_changed" : "live_field_missing",
        });
      }
    }

    if (kept > 0) {
      rebasedSections[sectionKey] = rebased;
    } else {
      skippedSections.push({ sectionKey, reason: "all_markers_dropped" });
    }
  }

  const keptFieldPaths = new Set(transplanted.map((entry) => normalizeFieldPath(entry.fieldPath)));
  const evidence = (draft.evidence ?? []).filter((row) => {
    if (row.status !== "supported") return true;
    return keptFieldPaths.has(normalizeFieldPath(row.fieldPath ?? ""));
  });

  const usedReferenceIds = new Set();
  for (const section of Object.values(rebasedSections)) {
    for (const { text } of collectMarkedStrings(section)) {
      for (const id of markerIds(text)) usedReferenceIds.add(id);
    }
  }
  for (const row of evidence) {
    if (row.status !== "supported") continue;
    for (const id of row.referenceIds ?? []) usedReferenceIds.add(id);
  }

  const references = (draft.references ?? [])
    .filter((reference) => usedReferenceIds.has(reference.id))
    .map(sanitizeReference);
  const sources = (draft.sources ?? []).filter((source) => {
    const ids = [source.referenceId, ...(source.referenceIds ?? [])].filter(Boolean);
    return ids.length === 0 || ids.some((id) => usedReferenceIds.has(id));
  });

  const report = {
    transplantedFieldCount: transplanted.length,
    transplantedMarkerCount: transplanted.reduce((sum, entry) => sum + entry.markerCount, 0),
    droppedFieldCount: dropped.length,
    droppedMarkerCount: dropped.reduce((sum, entry) => sum + entry.markerIds.length, 0),
    dropped,
    skippedSections,
    sections: Object.keys(rebasedSections),
  };

  const rebasedDraft = {
    ...draft,
    markedSections: rebasedSections,
    evidence,
    references,
    sources,
    articlePatches: [],
    rebase: {
      rebasedAt: new Date().toISOString(),
      report,
    },
  };

  return { rebasedDraft, report };
}

async function main() {
  const argv = process.argv.slice(2);
  const slug = getFlagValue(argv, "--slug");
  if (!slug) {
    console.error("Usage: node scripts/citations/rebase-workbench-draft.mjs --slug=<slug> [--draft=<path>] [--out=<path>]");
    process.exit(1);
  }
  const workbenchRunDir = join(homedir(), ".codex", "dosewiki-citation-workbench", "runs", slug);
  const draftPath = resolve(getFlagValue(argv, "--draft") ?? join(workbenchRunDir, "citation-draft.json"));
  const outPath = resolve(getFlagValue(argv, "--out") ?? join(dirname(draftPath), "citation-draft.rebased.json"));
  const url = process.env.TARGET_CONVEX_URL ?? process.env.CONVEX_PUBLIC_READ_URL ?? process.env.VITE_CONVEX_URL;
  if (!url) {
    console.error("Set TARGET_CONVEX_URL (or CONVEX_PUBLIC_READ_URL/VITE_CONVEX_URL) to the deployment holding the live article.");
    process.exit(1);
  }

  const draft = JSON.parse(readFileSync(draftPath, "utf8"));
  const client = new ConvexHttpClient(url);
  const article = await client.query(api.substanceIndex.getBySlug, { slug });
  if (!article) throw new Error(`No article found for slug: ${slug}`);

  const { rebasedDraft, report } = rebaseWorkbenchDraft({ draft, article });
  rebasedDraft.rebase.sourceDraftPath = draftPath;
  rebasedDraft.rebase.articleSource = url;
  writeFileSync(outPath, `${JSON.stringify(rebasedDraft, null, 2)}\n`);

  console.log(`Rebased ${slug}: ${report.transplantedMarkerCount} markers kept across ${report.transplantedFieldCount} fields; ` +
    `${report.droppedMarkerCount} markers dropped across ${report.droppedFieldCount} fields.`);
  for (const entry of report.dropped) {
    console.log(`  dropped ${entry.fieldPath} (${entry.reason}): ${entry.markerIds.join(", ")}`);
  }
  console.log(`Wrote ${outPath}`);
  console.log(JSON.stringify({ slug, ...report, outPath }, null, 0));
}

const isDirectRun = process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").at(-1));
if (isDirectRun) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
