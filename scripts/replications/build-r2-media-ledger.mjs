#!/usr/bin/env node

/**
 * Build the read-only reconciliation ledger for the Convex -> R2 media
 * migration (docs/agents/convex-to-cloudflare-r2-media-handoff.md).
 *
 * For every production replication row and each of its five media variants
 * (main, thumbnail, preview, motion, motion_poster), the ledger records the
 * Convex storage ID, the SHA-256 and byte size Convex reports for that stored
 * object, and the R2 manifest object that matches it byte-for-byte. Identity
 * is the SHA-256 digest alone — never filename, slug, dimensions, or
 * approximate size. Rows whose digest is absent from the manifest stay on
 * Convex and are reported visibly as `missing`.
 *
 * Inputs (both are read-only; the script performs no Convex write):
 *
 *   --storage-dump <path>   JSONL dump of the production `_storage` system
 *                           table. Produce it with:
 *                           npx convex data _storage --limit 10000 --format jsonl > storage.jsonl
 *                           (3,256 objects at the time of writing; the command
 *                           fails loudly past 10,000 — page by recreating the
 *                           dump rather than trusting a truncated one.)
 *   --manifest <path>       The verified R2 upload manifest JSONL
 *                           (r2-unified-media-only-2026-08-27.jsonl from the
 *                           archive workflow). Each record must name its
 *                           object key; size is compared when present.
 *
 * Output:
 *   scripts/replications/data/r2-ledger/r2-media-ledger.json  (atomic write)
 *   plus a per-role match summary on stdout.
 *
 * Read target: CONVEX_PUBLIC_READ_URL (public getAll query; no write occurs).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDataClient } from "../lib/data-client.ts";
import { api } from "../../convex/_generated/api.js";
import { findRepoRoot, getFlagValue, loadEnvFiles } from "../lib/data-ops-run-context.mjs";

const OUT_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "data",
  "r2-ledger",
);
const DEFAULT_OUTPUT = path.join(OUT_DIR, "r2-media-ledger.json");

/** Variant roles in ledger order; field names match the replication schema. */
export const VARIANT_ROLES = [
  { role: "main", storageField: "storage_id", keyField: "r2_key" },
  { role: "thumbnail", storageField: "thumbnail_storage_id", keyField: "thumbnail_r2_key" },
  { role: "preview", storageField: "preview_storage_id", keyField: "preview_r2_key" },
  { role: "motion", storageField: "motion_storage_id", keyField: "motion_r2_key" },
  { role: "motion_poster", storageField: "motion_poster_storage_id", keyField: "motion_poster_r2_key" },
];

const R2_KEY_PATTERN = /^media\/sha256\/([0-9a-f]{2})\/([0-9a-f]{64})\.([a-z0-9]{2,5})$/;

/** Extensions each Convex content type may legitimately carry in the archive. */
const EXTENSIONS_BY_CONTENT_TYPE = {
  "video/mp4": ["mp4"],
  "video/quicktime": ["mov"],
  "image/webp": ["webp"],
  "image/png": ["png"],
  "image/jpeg": ["jpg", "jpeg"],
  "image/gif": ["gif"],
  "audio/ogg": ["ogg"],
};

function readJsonl(filename) {
  return fs
    .readFileSync(filename, "utf8")
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
}

function writeJsonAtomic(filename, value) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const tmp = `${filename}.part`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 1));
  fs.renameSync(tmp, filename);
}

/** Pull the object key out of one manifest record, whatever its field name. */
export function manifestRecordKey(record) {
  for (const field of ["key", "Key", "object_key", "name", "path"]) {
    if (typeof record[field] === "string" && record[field]) return record[field];
  }
  return null;
}

/** Pull the byte size out of one manifest record when it names one. */
export function manifestRecordSize(record) {
  for (const field of ["size", "Size", "bytes", "content_length", "length"]) {
    if (Number.isFinite(record[field])) return record[field];
  }
  return null;
}

/**
 * Index manifest records by the SHA-256 hex digest their key encodes.
 * Non-media keys (outside media/sha256/) are counted but never matched.
 */
export function indexManifestBySha(records) {
  const bySha = new Map();
  let skipped = 0;
  for (const record of records) {
    const key = manifestRecordKey(record);
    if (!key) {
      throw new Error(
        `Manifest record has no recognizable key field: ${JSON.stringify(record).slice(0, 200)}`,
      );
    }
    const match = R2_KEY_PATTERN.exec(key);
    if (!match || !match[2].startsWith(match[1])) {
      skipped += 1;
      continue;
    }
    const sha = match[2];
    const entry = { key, ext: match[3], size: manifestRecordSize(record) };
    const hit = bySha.get(sha);
    if (hit) hit.push(entry);
    else bySha.set(sha, [entry]);
  }
  return { bySha, skipped };
}

/**
 * Join one Convex-side field entry against the manifest index.
 * Returns { status, r2_key?, manifest?, reason? } with the handoff's four
 * statuses: exact | missing | ambiguous | error.
 */
export function matchLedgerEntry(entry, bySha) {
  const candidates = bySha.get(entry.sha256) ?? [];
  if (candidates.length === 0) {
    return { status: "missing", reason: "sha256 not present in the R2 manifest" };
  }
  const sized = candidates.filter(
    (candidate) => candidate.size === null || candidate.size === entry.size,
  );
  if (sized.length === 0) {
    return {
      status: "error",
      reason: `manifest size mismatch for sha256 ${entry.sha256}: convex=${entry.size}, manifest=${candidates.map((c) => c.size).join(",")}`,
    };
  }
  if (sized.length === 1) {
    return { status: "exact", r2_key: sized[0].key, manifest: sized[0] };
  }
  // Same bytes under more than one key (e.g. jpg and jpeg twins). Prefer the
  // single key whose extension matches the Convex content type; anything else
  // is ambiguous and stays on Convex.
  const allowedExts = EXTENSIONS_BY_CONTENT_TYPE[entry.contentType] ?? [];
  const byExt = sized.filter((candidate) => allowedExts.includes(candidate.ext));
  if (byExt.length === 1) {
    return { status: "exact", r2_key: byExt[0].key, manifest: byExt[0] };
  }
  return {
    status: "ambiguous",
    reason: `sha256 ${entry.sha256} matches ${sized.length} manifest keys: ${sized.map((c) => c.key).join(", ")}`,
  };
}

/**
 * Build field-level ledger entries from replication rows and the `_storage`
 * metadata dump. Placeholder and absent storage IDs produce no entry; a
 * referenced storage ID missing from the dump is an `error` entry.
 */
export function buildLedgerEntries(rows, storageDump) {
  const storageById = new Map(
    storageDump.map((record) => [
      record._id,
      {
        sha256: Buffer.from(record.sha256, "base64").toString("hex"),
        size: record.size,
        contentType: record.contentType ?? null,
      },
    ]),
  );
  const entries = [];
  for (const row of rows) {
    for (const { role, storageField, keyField } of VARIANT_ROLES) {
      const storageId = row[storageField];
      if (!storageId || storageId.startsWith("placeholder-")) continue;
      const base = {
        id: row._id,
        slug: row.slug,
        role,
        keyField,
        storage_id: storageId,
        expectedStorageId: row.storage_id,
      };
      const meta = storageById.get(storageId);
      if (!meta) {
        entries.push({ ...base, status: "error", reason: "storage ID absent from _storage dump" });
        continue;
      }
      entries.push({ ...base, ...meta, status: "pending" });
    }
  }
  return entries;
}

async function main() {
  const argv = process.argv.slice(2);
  const repoRoot = findRepoRoot(process.cwd());
  loadEnvFiles({ rootDir: repoRoot, env: process.env });

  const storageDumpPath = getFlagValue(argv, "--storage-dump");
  const manifestPath = getFlagValue(argv, "--manifest");
  const outputPath = getFlagValue(argv, "--output") ?? DEFAULT_OUTPUT;
  if (!storageDumpPath || !manifestPath) {
    console.error(
      "Usage: node scripts/replications/build-r2-media-ledger.mjs --storage-dump <storage.jsonl> --manifest <r2-manifest.jsonl> [--output <ledger.json>]",
    );
    process.exit(1);
  }

  const readUrl = process.env.CONVEX_PUBLIC_READ_URL;
  if (!readUrl) {
    throw new Error("CONVEX_PUBLIC_READ_URL must name the read deployment.");
  }

  const storageDump = readJsonl(storageDumpPath);
  const manifestRecords = readJsonl(manifestPath);
  const { bySha, skipped } = indexManifestBySha(manifestRecords);

  const client = createDataClient({ target: readUrl }).client;
  const rows = await client.query(api.replications.getAll, {});

  const entries = buildLedgerEntries(rows, storageDump);
  for (const entry of entries) {
    if (entry.status !== "pending") continue;
    Object.assign(entry, matchLedgerEntry(entry, bySha));
  }

  const summary = {};
  for (const entry of entries) {
    summary[entry.role] ??= { exact: 0, missing: 0, ambiguous: 0, error: 0 };
    summary[entry.role][entry.status] += 1;
  }

  writeJsonAtomic(outputPath, {
    generated_at: new Date().toISOString(),
    read_url: readUrl,
    storage_dump: path.resolve(storageDumpPath),
    manifest: path.resolve(manifestPath),
    manifest_objects: manifestRecords.length,
    manifest_non_media_keys_skipped: skipped,
    replication_rows: rows.length,
    summary,
    entries,
  });

  console.log(`Rows: ${rows.length}  Field entries: ${entries.length}`);
  console.log(`Manifest objects: ${manifestRecords.length} (${skipped} non-media keys skipped)`);
  for (const [role, counts] of Object.entries(summary)) {
    console.log(
      `  ${role.padEnd(14)} exact=${counts.exact}  missing=${counts.missing}  ambiguous=${counts.ambiguous}  error=${counts.error}`,
    );
  }
  console.log(`Ledger written: ${outputPath}`);
  const unmatched = entries.filter((entry) => entry.status !== "exact");
  if (unmatched.length > 0) {
    console.log(
      `\n${unmatched.length} field(s) stay on Convex Storage until resolved (missing/ambiguous/error above).`,
    );
  }
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
