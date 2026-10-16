import { parseArgs } from "node:util";

import {
  collectSitemapUrls,
  warmUrls,
  type WarmResult,
} from "../deploy/warm-public-routes.lib.mjs";

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    host: { type: "string", default: "zh.dose.wiki" },
    base: { type: "string" },
    sitemap: { type: "string", default: "https://dose.wiki" },
    paths: { type: "string" },
    skip: { type: "string" },
    limit: { type: "string" },
    concurrency: { type: "string", default: "8" },
    timeout: { type: "string", default: "20000" },
    slowest: { type: "string", default: "10" },
  },
});

const host = values.host;
const base = (values.base ?? `https://${host}`).replace(/\/$/, "");
const concurrency = Number(values.concurrency);
const timeoutMs = Number(values.timeout);
const slowest = Number(values.slowest);
const limit = values.limit ? Number(values.limit) : Infinity;
const skipPrefixes = values.skip ? values.skip.split(",").map((entry) => entry.trim()).filter(Boolean) : [];
const PROGRESS_EVERY = 100;

function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.max(0, Math.min(sorted.length, rank) - 1)];
}

async function sitemapPaths(): Promise<string[]> {
  const { sitemapUrl, urls } = await collectSitemapUrls(values.sitemap, { timeoutMs });
  const paths = urls.map((url) => {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}`;
  });
  const kept = paths.filter((pagePath) => !skipPrefixes.some((prefix) => pagePath.startsWith(prefix)));
  console.log(`[warm-mirror] ${sitemapUrl} lists ${paths.length} path(s); ${paths.length - kept.length} skipped`);
  return kept;
}

async function main(): Promise<number> {
  const listed = values.paths
    ? values.paths.split(",").map((entry) => entry.trim()).filter(Boolean)
    : await sitemapPaths();
  const paths = listed.slice(0, Number.isFinite(limit) ? limit : listed.length);
  if (paths.length === 0) {
    console.error("[warm-mirror] Nothing to warm.");
    return 2;
  }
  console.log(`[warm-mirror] warming ${paths.length} path(s) on ${base} (Host: ${host}) with concurrency ${concurrency}`);

  const startedAt = Date.now();
  let responded = 0;
  const fetchImpl: typeof fetch = Object.assign(
    async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      const response = await fetch(input, init);
      responded += 1;
      if (responded % PROGRESS_EVERY === 0) {
        console.log(`[warm-mirror] ${responded}/${paths.length} after ${((Date.now() - startedAt) / 1000).toFixed(0)}s`);
      }
      return response;
    },
    { preconnect: fetch.preconnect },
  );
  const { results } = await warmUrls(paths.map((pagePath) => `${base}${pagePath}`), {
    fetchImpl,
    concurrency,
    timeoutMs,
    retries: 1,
    headers: { host, "user-agent": "dosewiki-warm-mirror/1.0 (+scripts/translation/warm-mirror.ts)" },
  });
  const totalMs = Date.now() - startedAt;

  const byStatus: Record<string, number> = {};
  const byCache: Record<string, number> = {};
  const failures: WarmResult[] = [];
  const unserved: WarmResult[] = [];
  for (const result of results) {
    const status = result.status === null ? (result.error ?? "error") : String(result.status);
    byStatus[status] = (byStatus[status] ?? 0) + 1;
    byCache[result.cache] = (byCache[result.cache] ?? 0) + 1;
    if (result.status === null || result.status >= 500) failures.push(result);
    else if (result.status >= 400) unserved.push(result);
  }
  const counts = (table: Record<string, number>) =>
    Object.keys(table).sort().map((key) => `${key} x${table[key]}`).join(", ");
  const durations = results.map((result) => result.durationMs).sort((a, b) => a - b);
  const lines = [
    `Warmed ${results.length} path(s) in ${(totalMs / 1000).toFixed(1)}s`,
    `Status: ${counts(byStatus)}`,
    `Cache: ${counts(byCache)}`,
    `Latency: p50 ${percentile(durations, 50)}ms, p95 ${percentile(durations, 95)}ms, max ${percentile(durations, 100)}ms`,
  ];
  const slow = [...results].sort((a, b) => b.durationMs - a.durationMs).slice(0, slowest);
  if (slow.length > 0) {
    lines.push(`Slowest ${slow.length}:`);
    for (const entry of slow) {
      lines.push(`  ${String(entry.durationMs).padStart(6)}ms  ${entry.cache.padEnd(7)} ${entry.status ?? "ERR"}  ${entry.url.slice(base.length)}`);
    }
  }
  if (unserved.length > 0) {
    lines.push("Not served (4xx):");
    for (const entry of unserved) {
      lines.push(`  ${entry.status}  ${entry.url.slice(base.length)}`);
    }
  }
  if (failures.length > 0) {
    lines.push("Failed:");
    for (const failure of failures) {
      lines.push(`  ${failure.url.slice(base.length)}  ${failure.error ?? failure.status}`);
    }
  }
  console.log(lines.join("\n"));
  return failures.length > 0 ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(2);
  },
);
