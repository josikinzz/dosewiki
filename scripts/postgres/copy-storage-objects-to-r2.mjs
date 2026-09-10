#!/usr/bin/env node

/**
 * Ticket 11 apply: move the media bytes that only Convex Storage serves into
 * the content-addressed R2 archive and write the matching `storageObjects`
 * identity rows, which is what `ctx.storage.getUrl` reads on the Postgres
 * runtime (`lib/postgres/runtime/client.ts`).
 *
 * Input is a manifest from `scripts/postgres/build-storage-manifest.ts`. Only
 * entries whose every direct reference lacks an R2 key and a non-Convex direct
 * URL are candidates (`already_delivered_elsewhere === false`); everything else
 * already resolves without Convex and is left alone.
 *
 * Dry run (no network writes, no SQL writes):
 *   bun scripts/postgres/copy-storage-objects-to-r2.mjs --manifest <manifest.json>
 *
 * Copy the bytes:
 *   bun scripts/postgres/copy-storage-objects-to-r2.mjs --manifest <manifest.json> \
 *     --write --confirm-write=copy-storage-objects
 *
 * Write the identity rows (after a copy run, reading its objects.json):
 *   bun scripts/postgres/copy-storage-objects-to-r2.mjs --objects <objects.json> \
 *     --insert-target <postgres url> --write --confirm-insert=<host>
 *
 * Byte handling: every object is downloaded in full and hashed; the digest and
 * length must match the source's `content-length` (and, with `--export <dir>`,
 * the sha256 and size Convex itself recorded in `_storage/documents.jsonl`).
 * The destination key is the archive convention `media/sha256/<xx>/<digest>.<ext>`
 * (`contentAddressedKey`, shared with `scripts/replications/copy-missing-r2-media.mjs`),
 * so an existing digest is a hit: the key is verified by re-reading it and is
 * never overwritten. After an upload the object is read back and re-hashed.
 * SQL writes are INSERT ... ON CONFLICT DO NOTHING; nothing here updates or
 * deletes a row, and a conflicting row is compared, not replaced.
 */

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ConvexHttpClient } from "convex/browser";
import pg from "pg";
import {
  contentAddressedKey,
  signR2Request,
} from "../replications/copy-missing-r2-media.mjs";
import {
  findRepoRoot,
  getFlagValue,
  hasFlag,
  loadEnvFiles,
} from "../lib/data-ops-run-context.mjs";

const OPERATION = "copy-storage-objects";
const EMPTY_SHA256 = createHash("sha256").update("").digest("hex");
/** Legacy Convex storage ids are UUIDs; `/api/storage/<id>` serves them directly. */
const LEGACY_STORAGE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function r2Config() {
  const config = {
    accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
    endpoint: process.env.CLOUDFLARE_R2_S3_ENDPOINT,
    bucket: process.env.CLOUDFLARE_R2_BUCKET,
  };
  for (const [name, value] of Object.entries(config)) {
    if (!value) throw new Error(`Missing R2 configuration: ${name}`);
  }
  config.endpoint = config.endpoint.replace(/\/+$/, "");
  return config;
}

function objectUrl(config, key) {
  return `${config.endpoint}/${encodeURIComponent(config.bucket)}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

/** Every network failure names the request that produced it; a bare fetch error carries no stack. */
async function labelled(label, operation) {
  try {
    return await operation();
  } catch (error) {
    throw new Error(`${label}: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }
}

async function signedFetch(config, method, key, { headers = {}, body = null, payloadHash = EMPTY_SHA256 } = {}) {
  const url = objectUrl(config, key);
  const signed = signR2Request({
    method,
    url,
    headers,
    payloadHash,
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
  });
  return labelled(`R2 ${method} ${key}`, () => fetch(url, { method, headers: signed, body }));
}

/** `_storage/documents.jsonl` of a `--include-file-storage` export; its sha256 is base64. */
function readExportMetadata(exportDir) {
  const file = path.join(exportDir, "_storage", "documents.jsonl");
  if (!fs.existsSync(file)) throw new Error(`${file} not found; unzip an export taken with --include-file-storage`);
  const metadata = new Map();
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    if (!line) continue;
    const row = JSON.parse(line);
    metadata.set(row._id, {
      contentType: row.contentType ?? null,
      size: typeof row.size === "number" ? row.size : Number(row.size ?? 0),
      sha256: row.sha256 ? Buffer.from(row.sha256, "base64").toString("hex") : null,
    });
  }
  return metadata;
}

/**
 * Where the bytes of one storage id can be read today. Convex still resolves
 * every id in scope through the public `replications:resolveStorageUrls`
 * query, which is `ctx.storage.getUrl` per id; legacy UUID ids also answer on
 * `/api/storage/<id>` directly, and that is the fallback when the query
 * returns null.
 */
async function resolveSources(entries, convexUrl) {
  const sources = new Map();
  const ids = entries.map((entry) => entry.storage_id);
  const client = new ConvexHttpClient(convexUrl);
  const resolved = await client.query("replications:resolveStorageUrls", { storageIds: ids });
  for (let index = 0; index < ids.length; index += 1) {
    const storageId = ids[index];
    const url = resolved[index];
    if (url) {
      sources.set(storageId, { url, via: "replications:resolveStorageUrls" });
      continue;
    }
    if (LEGACY_STORAGE_ID.test(storageId)) {
      sources.set(storageId, { url: `${convexUrl}/api/storage/${storageId}`, via: "legacy storage id path" });
      continue;
    }
    const entry = entries[index];
    throw new Error(`Convex resolves no URL for ${storageId} (references ${entry.references.map((ref) => `${ref.table}.${ref.field}:${ref.row_id}`).join(", ")})`);
  }
  return sources;
}

function assertConvexStorageUrl(url) {
  const parsed = new URL(url);
  if (!parsed.hostname.endsWith(".convex.cloud") || !parsed.pathname.startsWith("/api/storage/")) {
    throw new Error(`Unsafe Convex storage URL: ${url}`);
  }
  return parsed;
}

async function hashStream(body, label) {
  const hash = createHash("sha256");
  let size = 0;
  for await (const chunk of body) {
    hash.update(chunk);
    size += chunk.length;
  }
  if (!size) throw new Error(`${label}: empty body`);
  return { sha256: hash.digest("hex"), size };
}

/**
 * Download once, keep the bytes in memory (these objects are small), hash them.
 * Convex serves its own `digest: sha-256=<base64>` per object, so the copy is
 * checked against the source's recorded digest and not only against itself.
 */
async function readSource(source, expected) {
  assertConvexStorageUrl(source.url);
  const response = await labelled(`GET ${source.url}`, () => fetch(source.url));
  if (!response.ok) throw new Error(`GET ${source.url}: ${response.status} ${response.statusText}`);
  const contentType = (response.headers.get("content-type") ?? "").split(";")[0].trim();
  const declared = Number(response.headers.get("content-length"));
  const served = /^sha-256=(.+)$/.exec(response.headers.get("digest") ?? "");
  const servedSha256 = served ? Buffer.from(served[1], "base64").toString("hex") : null;
  const bytes = Buffer.from(await labelled(`body of GET ${source.url}`, () => response.arrayBuffer()));
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (Number.isFinite(declared) && declared > 0 && declared !== bytes.length) {
    throw new Error(`Truncated download for ${source.url}: content-length ${declared}, read ${bytes.length}`);
  }
  if (servedSha256 && servedSha256 !== sha256) {
    throw new Error(`Digest mismatch against the Convex response digest: served ${servedSha256}, downloaded ${sha256}`);
  }
  if (expected?.sha256 && expected.sha256 !== sha256) {
    throw new Error(`Digest mismatch against the Convex export: expected ${expected.sha256}, downloaded ${sha256}`);
  }
  if (expected?.size && expected.size !== bytes.length) {
    throw new Error(`Size mismatch against the Convex export: expected ${expected.size}, downloaded ${bytes.length}`);
  }
  return { bytes, sha256, size: bytes.length, contentType: expected?.contentType ?? contentType, source_digest: servedSha256 };
}

async function headObject(config, key) {
  const response = await signedFetch(config, "HEAD", key);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`R2 HEAD ${key}: ${response.status} ${response.statusText}`);
  return {
    size: Number(response.headers.get("content-length")),
    contentType: response.headers.get("content-type"),
  };
}

async function digestObject(config, key) {
  const response = await signedFetch(config, "GET", key);
  if (!response.ok) throw new Error(`R2 GET ${key}: ${response.status} ${response.statusText}`);
  return hashStream(response.body, `R2 GET ${key}`);
}

async function putObject(config, key, object) {
  const response = await signedFetch(config, "PUT", key, {
    body: object.bytes,
    payloadHash: object.sha256,
    headers: { "content-type": object.contentType, "content-length": String(object.size) },
  });
  if (!response.ok) {
    throw new Error(`R2 PUT ${key}: ${response.status} ${response.statusText} ${(await response.text()).slice(0, 300)}`);
  }
  await response.arrayBuffer();
}

function readJsonLines(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

async function copyPhase(argv, root) {
  const manifestPath = getFlagValue(argv, "--manifest");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (manifest.version !== 1) throw new Error(`unsupported manifest version ${manifest.version}`);
  const convexUrl = (getFlagValue(argv, "--convex-url") ?? process.env.CONVEX_PUBLIC_READ_URL ?? "").replace(/\/+$/, "");
  if (!/^https:\/\/[^/]+\.convex\.cloud$/.test(convexUrl)) throw new Error(`Unsafe Convex read URL: ${convexUrl || "(unset)"}`);
  const baseUrl = (process.env.REPLICATION_MEDIA_BASE_URL ?? "").replace(/\/+$/, "");
  if (!/^https:\/\/[^/]+$/.test(baseUrl)) throw new Error("REPLICATION_MEDIA_BASE_URL must be set to the media delivery origin");
  const exportDir = getFlagValue(argv, "--export");
  const exportMetadata = exportDir ? readExportMetadata(exportDir) : new Map();

  const candidates = manifest.entries.filter((entry) => !entry.already_delivered_elsewhere);
  const outDir = path.resolve(getFlagValue(argv, "--out") ?? path.dirname(manifestPath));
  const resultsPath = path.join(outDir, "r2-copy-results.jsonl");
  const objectsPath = path.join(outDir, "objects.json");

  const sources = await resolveSources(candidates, convexUrl);
  console.log(`Manifest entries      : ${manifest.entries.length}`);
  console.log(`Already delivered     : ${manifest.entries.length - candidates.length}`);
  console.log(`Needing an identity   : ${candidates.length}`);
  for (const entry of candidates) {
    console.log(`  ${entry.storage_id} <- ${sources.get(entry.storage_id).url} (${sources.get(entry.storage_id).via})`);
  }
  const write = hasFlag(argv, "--write");
  if (!write) {
    console.log(`Dry run: no R2 writes. Re-run with --write --confirm-write=${OPERATION}.`);
    return;
  }
  if (getFlagValue(argv, "--confirm-write") !== OPERATION) {
    throw new Error(`Refusing R2 writes without --confirm-write=${OPERATION}`);
  }
  const config = r2Config();
  fs.mkdirSync(outDir, { recursive: true });
  const done = new Map(readJsonLines(resultsPath).map((record) => [record.storage_id, record]));
  const records = [];
  for (const entry of candidates) {
    const prior = done.get(entry.storage_id);
    if (prior) {
      records.push(prior);
      console.log(`${prior.status.padEnd(15)} ${entry.storage_id} -> ${prior.r2_key} (resumed)`);
      continue;
    }
    const source = sources.get(entry.storage_id);
    const object = await readSource(source, exportMetadata.get(entry.storage_id));
    const key = contentAddressedKey({ storage_id: entry.storage_id, sha256: object.sha256, contentType: object.contentType });
    const head = await headObject(config, key);
    let status;
    if (head) {
      const existing = await digestObject(config, key);
      if (existing.sha256 !== object.sha256 || existing.size !== object.size) {
        throw new Error(`Existing R2 object ${key} does not match the source (${existing.sha256}/${existing.size} vs ${object.sha256}/${object.size})`);
      }
      status = "already-present";
    } else {
      await putObject(config, key, object);
      const readBack = await headObject(config, key);
      if (!readBack) throw new Error(`R2 read-back failed for ${key}`);
      if (readBack.size !== object.size) throw new Error(`R2 size mismatch for ${key}: ${readBack.size} vs ${object.size}`);
      const verified = await digestObject(config, key);
      if (verified.sha256 !== object.sha256) throw new Error(`R2 digest mismatch for ${key}: ${verified.sha256} vs ${object.sha256}`);
      status = "uploaded";
    }
    const record = {
      storage_id: entry.storage_id,
      r2_key: key,
      url: `${baseUrl}/${key}`,
      content_type: object.contentType,
      size: object.size,
      sha256: object.sha256,
      source_url: source.url,
      source_via: source.via,
      source_digest_matched: object.source_digest === object.sha256,
      export_verified: exportMetadata.has(entry.storage_id),
      references: entry.references.map((ref) => `${ref.table}.${ref.field}:${ref.row_id}`),
      status,
      verified_at: new Date().toISOString(),
    };
    fs.appendFileSync(resultsPath, `${JSON.stringify(record)}\n`);
    records.push(record);
    console.log(`${status.padEnd(15)} ${entry.storage_id} -> ${key} ${object.size} ${object.contentType}`);
  }
  fs.writeFileSync(objectsPath, JSON.stringify({ generated_at: new Date().toISOString(), bucket: config.bucket, base_url: baseUrl, objects: records }, null, 2));
  console.log(`Objects: ${path.relative(root, objectsPath)}`);
  console.log(JSON.stringify({
    copied: records.filter((r) => r.status === "uploaded").length,
    already_present: records.filter((r) => r.status === "already-present").length,
    bytes: records.reduce((sum, r) => sum + r.size, 0),
  }));
}

async function insertPhase(argv) {
  const objectsPath = getFlagValue(argv, "--objects");
  const target = getFlagValue(argv, "--insert-target");
  const { objects } = JSON.parse(fs.readFileSync(objectsPath, "utf8"));
  const host = new URL(target).hostname;
  const local = host === "localhost" || host === "127.0.0.1" || host === "::1";
  const write = hasFlag(argv, "--write");
  if (write && getFlagValue(argv, "--confirm-insert") !== host) {
    throw new Error(`Refusing SQL writes without --confirm-insert=${host}`);
  }
  if (!local && !hasFlag(argv, "--allow-remote")) throw new Error(`Refusing non-local target ${host}; pass --allow-remote`);
  const pool = new pg.Pool({ connectionString: target, max: 2 });
  try {
    const before = (await pool.query('SELECT count(*)::int AS n FROM "storageObjects"')).rows[0].n;
    console.log(`storageObjects before : ${before}`);
    for (const object of objects) {
      const existing = await pool.query('SELECT * FROM "storageObjects" WHERE "storage_id" = $1', [object.storage_id]);
      if (existing.rows[0]) {
        const row = existing.rows[0];
        const same = row.url === object.url && row.sha256 === object.sha256 && Number(row.size) === object.size && row.r2_key === object.r2_key;
        console.log(`${same ? "present-identical" : "PRESENT-DIFFERENT"} ${object.storage_id}`);
        if (!same) throw new Error(`${object.storage_id} already mapped to something else; refusing to touch it`);
      }
    }
    if (!write) {
      console.log(`Dry run: no SQL writes. Re-run with --write --confirm-insert=${host}.`);
      return;
    }
    let inserted = 0;
    for (const object of objects) {
      const result = await pool.query(
        'INSERT INTO "storageObjects" ("storage_id", "url", "content_type", "size", "sha256", "r2_key") VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT ("storage_id") DO NOTHING',
        [object.storage_id, object.url, object.content_type, object.size, object.sha256, object.r2_key],
      );
      inserted += result.rowCount;
      console.log(`${result.rowCount ? "inserted" : "conflict-skipped"} ${object.storage_id} -> ${object.url}`);
    }
    const after = (await pool.query('SELECT count(*)::int AS n FROM "storageObjects"')).rows[0].n;
    console.log(JSON.stringify({ host, before, inserted, after, objects: objects.length }));
  } finally {
    await pool.end();
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const root = findRepoRoot();
  loadEnvFiles({ rootDir: root, env: process.env });
  if (getFlagValue(argv, "--insert-target")) {
    if (!getFlagValue(argv, "--objects")) throw new Error("--insert-target requires --objects <objects.json>");
    await insertPhase(argv);
    return;
  }
  if (!getFlagValue(argv, "--manifest")) {
    throw new Error("Usage: --manifest <manifest.json> [--export <dir>] [--write --confirm-write=copy-storage-objects] | --objects <objects.json> --insert-target <url>");
  }
  await copyPhase(argv, root);
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((error) => {
    console.error(error instanceof Error ? (error.stack ?? error.message) : error);
    process.exit(1);
  });
}
