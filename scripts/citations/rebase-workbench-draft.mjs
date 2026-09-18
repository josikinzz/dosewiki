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

import { dirname, join, resolve } from "node:path";
import { readFileSync, writeFileSync } from "node:fs";
import { createDataClient } from "../lib/data-client.ts";
import { api } from "../../lib/postgres/runtime/api.ts"
import { stripCitationMarkers } from "./citation-only-validator.mjs";
import { hasUnsafeReferenceMarkup } from "../../lib/citations/referenceIdentity.mjs";
import { mergeReferences, normalizeSelectedSections } from "./workbench-draft-adapter.mjs";
import { resolveCitationWorkbenchRoot } from "./citation-workbench-root.mjs";
import {
  createDataOpsRunContext,
  getFlagValue,
  printDataOpsRunContext,
  requireSourceUrl,
} from "../lib/data-ops-run-context.mjs";

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

function markerPlacements(text) {
  let removedLength = 0;
  return [...text.matchAll(MARKER_PATTERN)].map((match) => {
    const marker = match[0];
    const placement = {
      marker,
      anchorIndex: (match.index ?? 0) - removedLength,
    };
    removedLength += marker.length;
    return placement;
  });
}

function markerPlacementIdentity(placement, referenceAliases = new Map()) {
  const [referenceId] = markerIds(placement.marker);
  return `${placement.anchorIndex}\u0000${referenceAliases.get(referenceId) ?? referenceId}`;
}

export function mergeCitationMarkers(liveText, draftText, referenceAliases = new Map()) {
  const plainText = stripCitationMarkers(liveText);
  if (plainText !== stripCitationMarkers(draftText)) {
    throw new Error("Cannot merge citation markers when live and draft prose differ.");
  }

  const livePlacements = markerPlacements(liveText);
  const mergedPlacements = [...livePlacements];
  const liveCounts = new Map();
  for (const placement of livePlacements) {
    const identity = markerPlacementIdentity(placement, referenceAliases);
    liveCounts.set(identity, (liveCounts.get(identity) ?? 0) + 1);
  }

  const seenDraftCounts = new Map();
  let transplantedMarkerCount = 0;
  for (const placement of markerPlacements(draftText)) {
    const identity = markerPlacementIdentity(placement, referenceAliases);
    const draftCount = (seenDraftCounts.get(identity) ?? 0) + 1;
    seenDraftCounts.set(identity, draftCount);
    if (draftCount <= (liveCounts.get(identity) ?? 0)) continue;
    mergedPlacements.push(placement);
    transplantedMarkerCount += 1;
  }

  const markersByAnchor = new Map();
  for (const placement of mergedPlacements) {
    const markers = markersByAnchor.get(placement.anchorIndex) ?? [];
    markers.push(placement.marker);
    markersByAnchor.set(placement.anchorIndex, markers);
  }

  let mergedText = "";
  let cursor = 0;
  for (const anchorIndex of [...markersByAnchor.keys()].sort((left, right) => left - right)) {
    mergedText += plainText.slice(cursor, anchorIndex);
    mergedText += markersByAnchor.get(anchorIndex).join("");
    cursor = anchorIndex;
  }
  mergedText += plainText.slice(cursor);

  return {
    text: mergedText,
    preservedExistingMarkerCount: livePlacements.length,
    transplantedMarkerCount,
  };
}

const clone = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

// Reference fields the Postgres article contract rejects if left in their raw
// workbench form: a `template` outside the allowed set, or numeric
// volume/issue/pages. Any code path that writes references into a draft the
// apply step will consume must run them through this first.
const ALLOWED_TEMPLATES = new Set(["cite_journal", "cite_book", "cite_web", "cite_report", "cite_database", "unknown"]);
// Canonical status is a schema enum, not reader-facing prose. Citation markers
// would change its stored value and make the entire article fail ingestion.
function isMarkerWritableField(sectionKey, path) {
  return !(sectionKey === "legality" && /(^|\.)countries\.[^.]+\.canonicalStatus$/.test(path));
}

export function sanitizeReference(reference) {
  const sanitized = { ...reference };
  if (
    hasUnsafeReferenceMarkup(sanitized.title)
    || hasUnsafeReferenceMarkup(sanitized.apaText)
  ) {
    throw new Error(
      `Reference ${sanitized.id ?? "(unknown)"} contains raw MediaWiki or <ref> markup.`,
    );
  }
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
  const selected = normalizeSelectedSections(draft);
  const referenceAliases = mergeReferences(article?.references ?? [], draft.references ?? []).remap;

  const rebasedSections = {};
  const transplanted = [];
  const dropped = [];
  const skippedSections = [];

  for (const [sectionKey, draftSection] of Object.entries(draft.markedSections)) {
    if (!CITABLE_SECTIONS.includes(sectionKey)) {
      skippedSections.push({ sectionKey, reason: "non_citable" });
      continue;
    }
    if (selected && !selected.has(sectionKey)) {
      throw new Error(`Scoped draft markedSections includes ${sectionKey}, which is not in selectedSections.`);
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
      const fieldPath = path ? `${sectionKey}.${path}` : sectionKey;
      if (!isMarkerWritableField(sectionKey, path)) {
        dropped.push({
          section: sectionKey,
          fieldPath,
          markerIds: markerIds(text),
          reason: "non_markerable_field",
        });
      } else if (
        typeof liveValue === "string"
        && stripCitationMarkers(text) === stripCitationMarkers(liveValue)
      ) {
        const merged = mergeCitationMarkers(liveValue, text, referenceAliases);
        if (path === "") {
          rebased = merged.text;
        } else {
          setAtPath(rebased, parsePath(path), merged.text);
        }
        kept += 1;
        transplanted.push({
          section: sectionKey,
          fieldPath,
          markerCount: merged.transplantedMarkerCount,
          preservedExistingMarkerCount: merged.preservedExistingMarkerCount,
        });
      } else {
        dropped.push({
          section: sectionKey,
          fieldPath,
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
    preservedExistingMarkerCount: transplanted.reduce(
      (sum, entry) => sum + entry.preservedExistingMarkerCount,
      0,
    ),
    droppedFieldCount: dropped.length,
    droppedMarkerCount: dropped.reduce((sum, entry) => sum + entry.markerIds.length, 0),
    dropped,
    skippedSections,
    sections: Object.keys(rebasedSections),
    selectedSections: selected ? [...selected] : null,
    // Scoped runs: selected sections whose markers all dropped return to
    // "ready" in the subsection rollout tracker.
    droppedSelectedSections: selected
      ? [...new Set(dropped.map((entry) => entry.section))]
      : [],
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
  const workbenchRunDir = join(resolveCitationWorkbenchRoot(), "runs", slug);
  const draftPath = resolve(getFlagValue(argv, "--draft") ?? join(workbenchRunDir, "citation-draft.json"));
  const outPath = resolve(getFlagValue(argv, "--out") ?? join(dirname(draftPath), "citation-draft.rebased.json"));
  const runContext = createDataOpsRunContext({
    operation: "rebase citation workbench draft",
    intent: "citation-pilot",
    argv,
    sourceUrlKeys: ["SOURCE_POSTGRES_URL", "TARGET_POSTGRES_URL", "POSTGRES_POOLED_URL"],
    targetUrlKeys: [],
    dryRunFlag: null,
    executeFlag: null,
    localArtifacts: [draftPath, outPath],
  });
  printDataOpsRunContext(runContext);
  const url = requireSourceUrl(runContext);

  const draft = JSON.parse(readFileSync(draftPath, "utf8"));
  const client = createDataClient({ target: url }).client;
  const article = await client.query(api.substanceIndex.getBySlug, { slug });
  if (!article) throw new Error(`No article found for slug: ${slug}`);

  const { rebasedDraft, report } = rebaseWorkbenchDraft({ draft, article });
  rebasedDraft.rebase.sourceDraftPath = draftPath;
  rebasedDraft.rebase.articleSource = url;
  writeFileSync(outPath, `${JSON.stringify(rebasedDraft, null, 2)}\n`);

  console.log(`Rebased ${slug}: ${report.transplantedMarkerCount} new markers transplanted and ` +
    `${report.preservedExistingMarkerCount} existing markers preserved across ${report.transplantedFieldCount} fields; ` +
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
