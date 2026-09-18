#!/usr/bin/env node

/**
 * Replication Index transport/query budget harness.
 *
 * Run against a production build (`next build && next start`) or a deployed
 * canary. It never writes data. The continuation walk validates cursor
 * progress and duplicate-free traversal while measuring the exact HTML and
 * JSON payloads the browser receives.
 *
 *   npm run perf:replications -- --url=http://localhost:3000
 *   node --expose-gc scripts/perf/replications.mjs --url=http://localhost:3000
 */

import { performance } from "node:perf_hooks";

const BUDGETS = {
  initialHtmlBytes: 256 * 1024,
  pageJsonBytes: 128 * 1024,
  galleryPageP95Ms: 500,
  retainedHeapBytes: 64 * 1024 * 1024,
};

function arg(name, fallback) {
  const hit = process.argv.find((entry) => entry.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

const baseUrl = arg("url", "http://localhost:3000").replace(/\/$/, "");
const enforce = !process.argv.includes("--report-only");

function percentile(values, fraction) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)] ?? 0;
}

async function measuredFetch(url) {
  const startedAt = performance.now();
  const response = await fetch(url, {
    cache: "no-store",
    headers: { accept: "text/html,application/json" },
  });
  const firstByteMs = performance.now() - startedAt;
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}: ${body.slice(0, 200)}`);
  }
  return {
    body,
    bytes: Buffer.byteLength(body),
    firstByteMs,
  };
}

function assertBudget(name, actual, budget) {
  if (enforce && actual > budget) {
    throw new Error(`${name} ${actual} exceeded budget ${budget}`);
  }
}

async function main() {
  global.gc?.();
  const heapBefore = process.memoryUsage().heapUsed;
  const html = await measuredFetch(`${baseUrl}/replications`);
  assertBudget("initial HTML bytes", html.bytes, BUDGETS.initialHtmlBytes);

  const rowsById = new Map();
  const visitedCursors = new Set();
  const pageBytes = [];
  const pageTimes = [];
  let cursor = null;
  let expectedTotal = null;

  do {
    if (cursor && visitedCursors.has(cursor)) {
      throw new Error(`gallery traversal repeated cursor ${cursor}`);
    }
    if (cursor) visitedCursors.add(cursor);
    const query = new URLSearchParams({ limit: "64" });
    if (cursor) query.set("cursor", cursor);
    const page = await measuredFetch(
      `${baseUrl}/api/replications/gallery?${query.toString()}`,
    );
    pageBytes.push(page.bytes);
    pageTimes.push(page.firstByteMs);
    assertBudget("gallery page JSON bytes", page.bytes, BUDGETS.pageJsonBytes);

    const payload = JSON.parse(page.body);
    if (!Array.isArray(payload.data) || !Number.isSafeInteger(payload.total) ||
        (payload.nextCursor !== null && typeof payload.nextCursor !== "string")) {
      throw new Error("gallery page returned an invalid payload");
    }
    expectedTotal ??= payload.total;
    if (expectedTotal !== payload.total) throw new Error("gallery membership changed during traversal");
    for (const row of payload.data) {
      if (!row || typeof row._id !== "string") {
        throw new Error("gallery page returned a row without a stable _id");
      }
      if (rowsById.has(row._id)) throw new Error(`gallery traversal repeated identity ${row._id}`);
      rowsById.set(row._id, row);
    }
    cursor = payload.nextCursor;
    if (cursor !== null && (typeof cursor !== "string" || cursor.length === 0)) {
      throw new Error("gallery page returned an invalid continuation cursor");
    }
  } while (cursor);
  if (rowsById.size !== expectedTotal) {
    throw new Error(`gallery traversal reached ${rowsById.size} of ${expectedTotal} matching works`);
  }

  global.gc?.();
  const retainedHeapBytes = Math.max(0, process.memoryUsage().heapUsed - heapBefore);
  const p95 = percentile(pageTimes, 0.95);
  assertBudget("gallery page p95 ms", p95, BUDGETS.galleryPageP95Ms);
  if (global.gc) {
    assertBudget("retained gallery heap bytes", retainedHeapBytes, BUDGETS.retainedHeapBytes);
  }

  console.log(JSON.stringify({
    url: baseUrl,
    budgets: BUDGETS,
    measurements: {
      initialHtmlBytes: html.bytes,
      initialHtmlTtfbMs: Math.round(html.firstByteMs * 10) / 10,
      pages: pageBytes.length,
      rows: rowsById.size,
      maxPageJsonBytes: Math.max(...pageBytes),
      galleryPageP95Ms: Math.round(p95 * 10) / 10,
      retainedHeapBytes: global.gc ? retainedHeapBytes : null,
    },
    heapBudgetEnforced: Boolean(global.gc) && enforce,
    passed: true,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
