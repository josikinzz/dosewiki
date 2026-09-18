#!/usr/bin/env node

/** Full-byte and range verification of R2 objects against a retained migration ledger. */

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { getFlagValue } from "../lib/data-ops-run-context.mjs";

const DEFAULT_CONCURRENCY = 4;

function readJsonLines(filename) {
  if (!fs.existsSync(filename)) return [];
  return fs.readFileSync(filename, "utf8").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

async function mapConcurrent(items, concurrency, worker) {
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      await worker(items[index]);
    }
  }));
}
async function withRetries(label, operation, attempts = 5) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt === attempts) break;
      const delay = Math.min(8000, 500 * (2 ** (attempt - 1)));
      console.warn(`${label}: attempt ${attempt}/${attempts} failed (${error.message}); retrying in ${delay}ms`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}


async function hashBody(response) {
  if (!response.body) throw new Error("Response has no body");
  const hash = createHash("sha256");
  let size = 0;
  for await (const chunk of Readable.fromWeb(response.body)) {
    hash.update(chunk);
    size += chunk.length;
  }
  return { sha256: hash.digest("hex"), size };
}

export function validateDeliveryHeaders(headers, object, label) {
  const contentType = headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  if (!object.contentType || contentType !== object.contentType.toLowerCase()) {
    throw new Error(`${label} content type mismatch for ${object.key}: expected ${object.contentType}, got ${contentType}`);
  }
  const cacheControl = headers.get("cache-control") ?? "";
  if (!/(?:^|,)\s*no-store\s*(?:,|$)/i.test(cacheControl)) {
    throw new Error(`${label} cache policy mismatch for ${object.key}`);
  }
  const contentDisposition = headers.get("content-disposition") ?? "";
  if (!/^inline(?:;|$)/i.test(contentDisposition.trim())) {
    throw new Error(`${label} is not inline for ${object.key}`);
  }
  const acceptRanges = headers.get("accept-ranges");
  if (acceptRanges !== "bytes") throw new Error(`${label} lacks byte ranges for ${object.key}`);
  if (headers.get("access-control-allow-origin") !== "*") {
    throw new Error(`${label} lacks public cross-origin delivery for ${object.key}`);
  }
  return {
    content_type: contentType,
    cache_control: cacheControl,
    content_disposition: contentDisposition,
    accept_ranges: acceptRanges,
  };
}

async function verifyObject(baseUrl, object) {
  const url = `${baseUrl.replace(/\/+$/, "")}/${object.key}`;
  const [head, full] = await Promise.all([
    fetch(`${url}?integrity=head-${object.sha256}`, { method: "HEAD", cache: "no-store" }),
    fetch(`${url}?integrity=full-${object.sha256}`, { cache: "no-store" }),
  ]);
  if (head.status !== 200) throw new Error(`HEAD ${object.key}: ${head.status}`);
  if (Number(head.headers.get("content-length")) !== object.size) {
    throw new Error(`HEAD size mismatch for ${object.key}`);
  }
  const deliveryHeaders = validateDeliveryHeaders(head.headers, object, "HEAD");
  if (full.status !== 200 && full.status !== 206) {
    throw new Error(`GET ${object.key}: ${full.status}`);
  }
  validateDeliveryHeaders(full.headers, object, "Full GET");
  if (full.status === 206 && full.headers.get("content-range") !== `bytes 0-${object.size - 1}/${object.size}`) {
    throw new Error(`Unexpected full GET Content-Range for ${object.key}`);
  }
  const actual = await hashBody(full);
  if (actual.size !== object.size || actual.sha256 !== object.sha256) {
    throw new Error(`Full-byte mismatch for ${object.key}: ${actual.size}/${actual.sha256}`);
  }

  const rangeLength = Math.min(32, object.size);
  const range = await fetch(`${url}?integrity=range-${object.sha256}`, {
    headers: { range: `bytes=0-${rangeLength - 1}` },
    cache: "no-store",
  });
  if (range.status !== 206) throw new Error(`Range GET ${object.key}: ${range.status}`);
  validateDeliveryHeaders(range.headers, object, "Range GET");
  if (range.headers.get("content-range") !== `bytes 0-${rangeLength - 1}/${object.size}`) {
    throw new Error(`Range Content-Range mismatch for ${object.key}`);
  }
  const rangeBytes = Buffer.from(await range.arrayBuffer());
  if (rangeBytes.length !== rangeLength) throw new Error(`Range length mismatch for ${object.key}`);
  return { full_status: full.status, range_status: range.status, delivery_headers: deliveryHeaders };
}

async function main() {
  const argv = process.argv.slice(2);
  const resultsPath = getFlagValue(argv, "--copy-results");
  const baseUrl = getFlagValue(argv, "--delivery-base");
  if (!resultsPath || !baseUrl) {
    throw new Error("Usage: --copy-results=<results.jsonl> --delivery-base=<https://worker>");
  }
  const copied = new Map(readJsonLines(resultsPath).map((record) => [record.key, record]));
  const objects = [...copied.values()].sort((left, right) => left.key.localeCompare(right.key));
  if (!objects.length) throw new Error("Copy results contain no objects to verify");
  const concurrency = Number(getFlagValue(argv, "--concurrency") ?? DEFAULT_CONCURRENCY);
  const outputPath = path.resolve(getFlagValue(argv, "--output") ?? path.join(path.dirname(resultsPath), "r2-copy-verification.jsonl"));
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const prior = new Map(readJsonLines(outputPath).map((record) => [record.key, record]));
  const pending = objects.filter((object) => !prior.has(object.key));
  let finished = objects.length - pending.length;
  console.log(`Objects: ${objects.length}; previously verified: ${finished}; pending: ${pending.length}`);
  await mapConcurrent(pending, concurrency, async (object) => {
    const result = await withRetries(object.key, () => verifyObject(baseUrl, object), 8);
    const record = { ...object, ...result, verified_at: new Date().toISOString() };
    fs.appendFileSync(outputPath, `${JSON.stringify(record)}\n`);
    finished += 1;
    console.log(`${finished}/${objects.length} sha256+range ${object.key}`);
  });
  const complete = new Map(readJsonLines(outputPath).map((record) => [record.key, record]));
  const failures = objects.filter((object) => !complete.has(object.key));
  if (failures.length) throw new Error(`${failures.length} object(s) lack verification records`);
  const full206 = objects.filter((object) => complete.get(object.key)?.full_status === 206).length;
  console.log(`Verified ${objects.length}/${objects.length} complete hashes and byte ranges; full GET 206 responses: ${full206}`);
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
