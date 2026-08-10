#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const DEFAULT_TRACKER_DATA = path.join(ROOT, "scripts/data/tracked/citation-metadata-repair-tracker-residuals.json");
export const DEFAULT_TRACKER_HTML = path.join(ROOT, "html-docs/citation-metadata-repair-tracker.html");
const ROWS_PREFIX = "const ROWS=";
const ROWS_SUFFIX = ";const KEY=";
const STORAGE_KEY = "dosewiki-citation-repair-decisions-v1";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256Json(value) {
  return crypto.createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export function extractTrackerRows(html) {
  const start = html.indexOf(ROWS_PREFIX);
  const end = html.indexOf(ROWS_SUFFIX, start + ROWS_PREFIX.length);
  assert(start >= 0 && end > start, "Tracker HTML does not contain the expected embedded ROWS payload");
  return JSON.parse(html.slice(start + ROWS_PREFIX.length, end));
}

export function validateTrackerData(data) {
  assert(data?.artifactType === "citation_metadata_repair_tracker_residuals" && data?.artifactVersion === 1, "Tracker data type/version is invalid");
  const { datasetDigest, ...payload } = data;
  assert(datasetDigest === sha256Json(payload), "Tracker dataset digest mismatch");
  assert(Array.isArray(data.rows) && data.rows.length === 187, "Tracker data must contain exactly 187 rows");
  const keys = new Set();
  const slugs = new Set();
  for (const row of data.rows) {
    assert(row?.key === `${row.slug}::${row.id}` && !keys.has(row.key), `Tracker row key is invalid or duplicated: ${row?.key ?? "(missing)"}`);
    keys.add(row.key);
    slugs.add(row.slug);
    assert(typeof row.title === "string" && row.title.trim(), `${row.key} title is missing`);
    assert(typeof row.rendered === "string" && row.rendered.startsWith(row.title), `${row.key} rendered preview is not title-first`);
  }
  assert(slugs.size === 97, "Tracker data must cover exactly 97 articles");
  assert(data.summary?.rows === 187 && data.summary?.articles === 97, "Tracker summary is stale");
  return { valid: true, rows: keys.size, articles: slugs.size, datasetDigest };
}

function safeInlineJson(value) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

export function buildTrackerHtml({ data, currentHtml }) {
  validateTrackerData(data);
  assert(currentHtml.includes(`const KEY='${STORAGE_KEY}'`), "Tracker localStorage decision key changed or is missing");
  const start = currentHtml.indexOf(ROWS_PREFIX);
  const end = currentHtml.indexOf(ROWS_SUFFIX, start + ROWS_PREFIX.length);
  assert(start >= 0 && end > start, "Tracker HTML does not contain the expected embedded ROWS payload");
  return `${currentHtml.slice(0, start)}${ROWS_PREFIX}${safeInlineJson(data.rows)}${currentHtml.slice(end)}`;
}

export function validateTrackerFiles({ dataPath = DEFAULT_TRACKER_DATA, htmlPath = DEFAULT_TRACKER_HTML } = {}) {
  const data = readJson(dataPath);
  const summary = validateTrackerData(data);
  const html = fs.readFileSync(htmlPath, "utf8");
  assert(JSON.stringify(extractTrackerRows(html)) === JSON.stringify(data.rows), "Tracker HTML rows differ from tracked residual data");
  assert(html.includes(`const KEY='${STORAGE_KEY}'`), "Tracker localStorage decision key changed or is missing");
  return summary;
}

export function writeTrackerFiles({ dataPath = DEFAULT_TRACKER_DATA, htmlPath = DEFAULT_TRACKER_HTML } = {}) {
  const data = readJson(dataPath);
  const currentHtml = fs.readFileSync(htmlPath, "utf8");
  const nextHtml = buildTrackerHtml({ data, currentHtml });
  fs.writeFileSync(htmlPath, nextHtml);
  return validateTrackerFiles({ dataPath, htmlPath });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const write = process.argv.includes("--write");
    if (process.argv.some((value) => value === "--execute" || value.startsWith("--source-url"))) {
      throw new Error("Tracker generation is local-only and rejects network/write-like source flags");
    }
    const result = write ? writeTrackerFiles() : validateTrackerFiles();
    console.log(JSON.stringify({ mode: write ? "write" : "validate", ...result }, null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
