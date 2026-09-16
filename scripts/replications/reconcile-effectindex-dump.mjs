#!/usr/bin/env node
/**
 * Effect Index dump ↔ live Postgres replication reconciliation report tool.
 *
 * This is read-only: it only queries `replications.getAll` and writes a local
 * Markdown/JSON report. It never calls a Postgres mutation or imports media.
 *
 * Usage:
 *   node scripts/replications/reconcile-effectindex-dump.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDataClient, resolvePostgresSource, postgresFingerprintFromUrl } from "../lib/data-client.ts";
import { api } from "../../lib/postgres/runtime/api.ts"
import { loadEnvFiles } from "../lib/data-ops-run-context.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "../..");
const EFFECT_INDEX_DUMP = "/Users/josie/Documents/Utilities/EffectIndex-master/effectindex_dump";
const REPORT_BASENAME = "replications-reconciliation-2026-07-27";
const REPORT_DIRECTORY = path.join(REPO_ROOT, "notes-and-plans/reports");
const REPORT_MARKDOWN_PATH = path.join(REPORT_DIRECTORY, `${REPORT_BASENAME}.md`);
const REPORT_JSON_PATH = path.join(REPORT_DIRECTORY, `${REPORT_BASENAME}.json`);

const KNOWN_EXTENSIONS = /\.(?:avif|gif|jpe?g|m4v|mov|mp3|mp4|ogg|png|webm|webp)$/giu;
const TYPE_ORDER = ["image", "video", "audio"];
const CLASSIFICATION_ORDER = ["matched", "missing", "ambiguous", "unavailable"];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function objectId(value) {
  if (typeof value === "string") {
    return value;
  }

  return value?.$oid ?? null;
}

function displayType(replication) {
  return replication.type === "gfycat" ? "video" : replication.type;
}

function titleCaseType(type) {
  return type[0].toUpperCase() + type.slice(1);
}

function errorMessage(error) {
  if (!(error instanceof Error)) {
    return String(error);
  }

  const cause = error.cause instanceof Error ? error.cause.message : "";
  return cause ? `${error.message} (${cause})` : error.message;
}

/**
 * Normalizes both human titles and generated slugs. "color" is intentionally
 * canonicalized to British spelling so Color/Colour and colorful/colourful
 * compare identically, while punctuation, underscores, and extensions vanish.
 */
function normalize(value) {
  let text = String(value ?? "").trim();
  try {
    text = decodeURIComponent(text);
  } catch {
    // A malformed percent sequence is still useful as plain text.
  }

  return text
    .toLowerCase()
    .replace(KNOWN_EXTENSIONS, "")
    .replace(/color/giu, "colour")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/gu, " ");
}

function filenameStem(resource) {
  const raw = String(resource ?? "").split(/[?#]/u, 1)[0];
  return normalize(raw.split("/").at(-1));
}

function isKnownArtist(artist) {
  const normalized = normalize(artist);
  return normalized.length > 0 && !["anonymous", "unknown"].includes(normalized);
}

function candidateMetadata(replication) {
  const title = normalize(replication.title);
  const artist = normalize(replication.artist);
  const slug = normalize(replication.slug);
  const resourceStem = filenameStem(replication.url);
  return {
    id: replication._id,
    slug: replication.slug,
    title: replication.title,
    artist: replication.artist,
    type: replication.type,
    effect_slug: replication.effect_slug,
    normalized: { title, artist, slug, resourceStem },
  };
}

function describeCandidate(candidate) {
  return {
    id: candidate.id,
    slug: candidate.slug,
    title: candidate.title,
    artist: candidate.artist,
    type: candidate.type,
    effect_slug: candidate.effect_slug,
  };
}

function uniqueCandidates(candidates) {
  return [...new Map(candidates.map((candidate) => [candidate.id, candidate])).values()];
}

function matchReplication(effectIndexReplication, liveCandidates) {
  const title = normalize(effectIndexReplication.title);
  const artist = normalize(effectIndexReplication.artist);
  const resourceStem = filenameStem(effectIndexReplication.resource);

  const titleMatches = liveCandidates.filter((candidate) => candidate.normalized.title === title);
  if (titleMatches.length > 0) {
    return classifyCandidates(titleMatches, "normalized-title", "high");
  }

  if (title && isKnownArtist(effectIndexReplication.artist)) {
    const titleArtist = `${title} ${artist}`;
    const titleArtistMatches = liveCandidates.filter((candidate) => {
      const candidateTitleArtist = `${candidate.normalized.title} ${candidate.normalized.artist}`.trim();
      return candidateTitleArtist === titleArtist || candidate.normalized.slug === titleArtist;
    });
    if (titleArtistMatches.length > 0) {
      return classifyCandidates(titleArtistMatches, "normalized-title-artist", "high");
    }
  }

  if (resourceStem) {
    const containmentMatches = liveCandidates.filter((candidate) => {
      const candidateStems = [
        candidate.normalized.title,
        candidate.normalized.slug,
        candidate.normalized.resourceStem,
      ].filter(Boolean);
      return candidateStems.some((stem) => stem.includes(resourceStem) || resourceStem.includes(stem));
    });
    if (containmentMatches.length > 0) {
      return classifyCandidates(containmentMatches, "filename-stem-containment", "medium");
    }
  }

  return { classification: "missing", match_key: null, confidence: null, candidates: [] };
}

function classifyCandidates(candidates, matchKey, confidence) {
  const unique = uniqueCandidates(candidates);
  return {
    classification: unique.length === 1 ? "matched" : "ambiguous",
    match_key: matchKey,
    confidence,
    candidates: unique.map(describeCandidate),
  };
}

function markdownCell(value) {
  return String(value ?? "").replaceAll("|", "\\|").replaceAll("\n", " ");
}

function countByTypeAndClassification(records) {
  return Object.fromEntries(TYPE_ORDER.map((type) => [
    type,
    Object.fromEntries(CLASSIFICATION_ORDER.map((classification) => [
      classification,
      records.filter((record) => record.type === type && record.classification === classification).length,
    ])),
  ]));
}

function markdownCountTable(counts) {
  const rows = TYPE_ORDER.map((type) => {
    const row = counts[type];
    return `| ${titleCaseType(type)} | ${row.matched} | ${row.missing} | ${row.ambiguous} | ${row.unavailable} | ${Object.values(row).reduce((sum, value) => sum + value, 0)} |`;
  });
  const totals = CLASSIFICATION_ORDER.map((classification) => TYPE_ORDER
    .reduce((sum, type) => sum + counts[type][classification], 0));
  return [
    "| Type | Matched | Missing | Ambiguous | Unavailable | Total |",
    "| --- | ---: | ---: | ---: | ---: | ---: |",
    ...rows,
    `| **Total** | **${totals[0]}** | **${totals[1]}** | **${totals[2]}** | **${totals[3]}** | **${totals.reduce((sum, value) => sum + value, 0)}** |`,
  ].join("\n");
}

function missingTable(records) {
  if (records.length === 0) {
    return "_None._";
  }

  return [
    "| EI id | Title | Type | Media URL / gfycat id | Artist | Associated effect slug(s) |",
    "| --- | --- | --- | --- | --- | --- |",
    ...records.map((record) => [
      record.ei_id,
      record.title,
      record.type,
      record.media,
      record.artist,
      record.effect_slugs.join(", "),
    ].map(markdownCell).join(" | ").replace(/^/u, "| ").concat(" |")),
  ].join("\n");
}

function ambiguousTable(records) {
  if (records.length === 0) {
    return "_None._";
  }

  return [
    "| EI id | Title | Match key | Candidate live records |",
    "| --- | --- | --- | --- |",
    ...records.map((record) => [
      record.ei_id,
      record.title,
      record.match_key,
      record.candidates.map((candidate) => `${candidate.slug} (${candidate.title} — ${candidate.artist})`).join("; "),
    ].map(markdownCell).join(" | ").replace(/^/u, "| ").concat(" |")),
  ].join("\n");
}

async function queryLiveReplications() {
  loadEnvFiles({ rootDir: REPO_ROOT });
  const source = resolvePostgresSource();
  if (!source.url) throw new Error("Set --source-url or SOURCE_POSTGRES_URL.");
  const replications = await createDataClient({ target: source.url }).client.query(api.replications.getAll, {});
  return { replications, endpoint: postgresFingerprintFromUrl(source.url), failures: [] };
}

function buildRecords(effectIndexReplications, effectsById, liveReplications) {
  const liveCandidates = liveReplications.map(candidateMetadata);
  return effectIndexReplications.map((replication) => {
    const sourceType = replication.type;
    const type = displayType(replication);
    const effectSlugs = (replication.associated_effects ?? [])
      .map(objectId)
      .map((id) => effectsById.get(id)?.url ?? `unmapped:${id}`);
    const match = sourceType === "audio"
      ? { classification: "missing", match_key: "schema-audio-unsupported", confidence: "certain", candidates: [] }
      : matchReplication(replication, liveCandidates);
    return {
      ei_id: objectId(replication._id),
      title: replication.title,
      type,
      source_type: sourceType,
      media: replication.resource,
      artist: replication.artist,
      artist_url: replication.artist_url,
      effect_slugs: effectSlugs,
      ...match,
    };
  });
}

function buildUnavailableRecords(effectIndexReplications, effectsById) {
  return effectIndexReplications.map((replication) => {
    const type = displayType(replication);
    const isAudio = replication.type === "audio";
    return {
      ei_id: objectId(replication._id),
      title: replication.title,
      type,
      source_type: replication.type,
      media: replication.resource,
      artist: replication.artist,
      artist_url: replication.artist_url,
      effect_slugs: (replication.associated_effects ?? [])
        .map(objectId)
        .map((id) => effectsById.get(id)?.url ?? `unmapped:${id}`),
      classification: isAudio ? "missing" : "unavailable",
      match_key: isAudio ? "schema-audio-unsupported" : null,
      confidence: isAudio ? "certain" : null,
      candidates: [],
    };
  });
}

function writeReport(report) {
  fs.mkdirSync(REPORT_DIRECTORY, { recursive: true });
  fs.writeFileSync(REPORT_JSON_PATH, `${JSON.stringify(report, null, 2)}\n`);

  const missing = report.records.filter((record) => record.classification === "missing");
  const ambiguous = report.records.filter((record) => record.classification === "ambiguous");
  const unavailable = report.records.filter((record) => record.classification === "unavailable");
  const liveNote = report.status === "complete"
    ? `Live records queried: **${report.live_replications_count}** via \`${report.live_endpoint}\`.`
    : "**Blocked:** no live records were available, so this is not an authoritative full missing list.";
  const failureSection = report.status === "complete" ? "" : [
    "## Live query failure",
    "",
    report.live_query_failures.map((failure) => `- \`${failure.env_key}\` (${failure.hostname}): ${failure.error}`).join("\n"),
    "",
    "The local dump and the Postgres schema were inspected instead. The schema only permits `image` and `video` rows, so all eight EI audio entries are certainly absent; every image/video entry remains `unavailable` until a live query succeeds.",
    "",
  ].join("\n");
  const unavailableSection = unavailable.length === 0 ? "" : [
    "## Entries unavailable for reconciliation",
    "",
    `There are **${unavailable.length}** image/video entries whose status was deliberately not inferred from the stale manifest. Re-run this script when a configured live Postgres endpoint is reachable.`,
    "",
  ].join("\n");

  const markdown = [
    "# Effect Index replication reconciliation — 2026-07-27",
    "",
    liveNote,
    "",
    "## Classification counts",
    "",
    markdownCountTable(report.counts),
    "",
    failureSection,
    "## Matching policy",
    "",
    "For each non-audio EI entry, the tool compares against `replications.getAll` in this order: normalized title, normalized title plus artist, then filename-stem containment in either direction. Normalization lowercases, decodes URL escapes, strips extensions/punctuation/underscores, collapses whitespace, and canonicalizes `color` to `colour`. Multiple candidates are always marked ambiguous. EI `gfycat` entries are reported as video. Audio is certain-missing because the Postgres `replications` schema permits only image/video.",
    "",
    "## Missing from live Postgres",
    "",
    missingTable(missing),
    "",
    "## Ambiguous",
    "",
    ambiguousTable(ambiguous),
    "",
    unavailableSection,
    "## Source and limits",
    "",
    `EI source: \`${EFFECT_INDEX_DUMP}/replications.json\` (${report.effectindex_replications_count} entries). Effect IDs were mapped through \`effects.json\` to their EI \`url\` slugs. This tool is read-only against Postgres and did not use \`notes-and-plans/exports/replications/replications-import.jsonl\` for matching.`,
    "",
  ].filter(Boolean).join("\n");
  fs.writeFileSync(REPORT_MARKDOWN_PATH, markdown);
}

async function main() {
  const effectIndexReplications = readJson(path.join(EFFECT_INDEX_DUMP, "replications.json"));
  const effects = readJson(path.join(EFFECT_INDEX_DUMP, "effects.json"));
  const effectsById = new Map(effects.map((effect) => [objectId(effect._id), effect]));

  let report;
  try {
    const live = await queryLiveReplications();
    const records = buildRecords(effectIndexReplications, effectsById, live.replications);
    report = {
      generated_at: new Date().toISOString(),
      status: "complete",
      source: "live-data",
      live_endpoint: live.endpoint,
      live_query_failures_before_success: live.failures,
      live_replications_count: live.replications.length,
      effectindex_replications_count: effectIndexReplications.length,
      counts: countByTypeAndClassification(records),
      records,
    };
  } catch (error) {
    const records = buildUnavailableRecords(effectIndexReplications, effectsById);
    report = {
      generated_at: new Date().toISOString(),
      status: "blocked-live-query-failed",
      source: "effectindex-dump-and-data-schema-only",
      live_query_failures: error.failures ?? [{ error: errorMessage(error) }],
      effectindex_replications_count: effectIndexReplications.length,
      counts: countByTypeAndClassification(records),
      records,
    };
  }

  writeReport(report);
  console.log(`Wrote ${REPORT_MARKDOWN_PATH}`);
  console.log(`Wrote ${REPORT_JSON_PATH}`);
  console.log(`Status: ${report.status}`);
}

await main();
