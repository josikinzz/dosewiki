/**
 * Post-deploy warmer for a locale mirror: request every public path on the
 * mirror host so the long tail is rendered and edge-cached before a reader
 * arrives.
 *
 * The mirror prerenders the same tiers as English (`src/app/zh/[slug]` and
 * `src/app/zh/reports/[slug]`); everything else renders on first request and
 * starts cold again after every deploy because the ISR page cache does not
 * survive one. This walks the English sitemap exactly as `mirror-coverage.ts
 * render` does (the mirror publishes no sitemap of its own), fetches each path
 * on the mirror with bounded concurrency through the shared warm helpers, and
 * prints status counts, cache hit/miss counts, and latency percentiles.
 *
 * No database access: sitemap in, HTTP out.
 *
 * Usage:
 *   bun scripts/translation/warm-mirror.ts --skip=/replications/                 # every page but the gallery tail, a few minutes
 *   bun scripts/translation/warm-mirror.ts                                       # the whole sitemap, gallery permalinks included (about an hour cold)
 *   bun scripts/translation/warm-mirror.ts --paths=/,/substances,/2c-b
 *   bun scripts/translation/warm-mirror.ts --base=http://localhost:3100 --paths=/reports   # local next start, Host: zh.dose.wiki
 *
 * Options:
 *   --host=<h>        Mirror host (default zh.dose.wiki); sent as the Host header.
 *   --base=<url>      Origin to fetch from (default https://<host>).
 *   --sitemap=<url>   English origin whose sitemap lists the paths (default https://dose.wiki).
 *   --paths=<a,b>     Warm these paths instead of the sitemap.
 *   --skip=<a,b>      Drop sitemap paths starting with any of these prefixes (the gallery is 90% of the sitemap).
 *   --limit=<n>       Warm at most this many paths, in sitemap order.
 *   --concurrency=<n> In-flight requests (default 8).
 *   --timeout=<ms>    Per-request timeout (default 20000).
 *   --slowest=<n>     How many slow paths to print (default 10).
 *
 * Progress is printed every 100 responses so a long run is never silent.
 *
 * Exit status is 1 when any request failed (network error, timeout, or 5xx
 * after one retry); a 404 counts as served, since a sitemap path the mirror
 * does not carry is a coverage finding, not a warm failure.
 */
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

/** Nearest-rank percentile of a sorted ascending list. */
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
