/**
 * Pure helpers shared by the post-deploy warmer CLI
 * (scripts/deploy/warm-public-routes.mjs) and the cron-driven route handler
 * (src/app/api/warm/route.ts). No Node-only imports: the route handler bundles
 * this module into a serverless function.
 */
import { prepareFlightRouterStateForRequest } from "next/dist/client/flight-data-helpers.js";
import { computeCacheBustingSearchParam } from "next/dist/shared/lib/router/utils/cache-busting-search-param.js";

/**
 * Root path segments that are pages of their own rather than substance
 * articles. `/[slug]` is the single-segment catch-all, so a sitemap URL with one
 * path segment is a substance article unless it is one of these.
 */
export const NON_SUBSTANCE_ROOT_SEGMENTS = new Set([
  "about",
  "articles",
  "blog",
  "contact",
  "copyright-disclaimer",
  "discord",
  "docs",
  "documentation-style-guide",
  "donate",
  "effects",
  "replications",
  "reports",
  "search",
  "substances",
]);

const LOC_PATTERN = /<loc>\s*([^<]+?)\s*<\/loc>/gi;

function decodeXmlEntities(value) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/**
 * Every `<loc>` in a sitemap document. Works for both a `<urlset>` and a
 * `<sitemapindex>`; the caller decides whether a location is a page or a
 * nested sitemap (see {@link isSitemapIndex}).
 */
export function parseSitemapLocations(xml) {
  const locations = [];
  for (const match of String(xml).matchAll(LOC_PATTERN)) {
    const location = decodeXmlEntities(match[1]).trim();
    if (location) locations.push(location);
  }
  return Array.from(new Set(locations));
}

export function isSitemapIndex(xml) {
  return /<sitemapindex[\s>]/i.test(String(xml));
}

/** `true` when the URL is a single-segment substance article path on the site. */
export function isSubstanceArticleUrl(url, baseUrl) {
  let parsed;
  try {
    // Sitemap locations are absolute; a relative or malformed value is not a page.
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (baseUrl) {
    try {
      if (parsed.origin !== new URL(baseUrl).origin) return false;
    } catch {
      return false;
    }
  }
  const segments = parsed.pathname.split("/").filter(Boolean);
  if (segments.length !== 1) return false;
  return !NON_SUBSTANCE_ROOT_SEGMENTS.has(segments[0].toLowerCase());
}

/**
 * Classify a response by its edge/ISR cache headers.
 *
 * Vercel reports `x-vercel-cache` (HIT, STALE, PRERENDER, REVALIDATED, MISS,
 * BYPASS); a self-hosted Next server reports `x-nextjs-cache` (HIT, STALE,
 * MISS). STALE and REVALIDATED both mean a reader got a cached body, so they
 * count as hits; PRERENDER means the build's static output served. A missing
 * header is `unknown` rather than a miss so a non-Vercel target does not read
 * as a 100% miss rate.
 */
export function classifyCacheHeaders(headers) {
  const read = (name) => {
    if (!headers) return null;
    if (typeof headers.get === "function") return headers.get(name);
    const key = Object.keys(headers).find((k) => k.toLowerCase() === name);
    return key ? headers[key] : null;
  };
  const raw = read("x-vercel-cache") ?? read("x-nextjs-cache");
  if (!raw) return { status: "unknown", raw: null };
  const value = String(raw).trim().toUpperCase();
  if (["HIT", "STALE", "PRERENDER", "REVALIDATED"].includes(value)) {
    return { status: "hit", raw: value };
  }
  if (["MISS", "BYPASS"].includes(value)) {
    return { status: "miss", raw: value };
  }
  return { status: "unknown", raw: value };
}

/**
 * Run `worker` over `items` with at most `limit` in flight. Results keep the
 * input order. A worker that throws yields its rejection as the result entry
 * (`{ error }`) rather than aborting the pool.
 */
export async function runWithConcurrency(items, limit, worker) {
  const list = Array.from(items);
  const results = new Array(list.length);
  const parallelism = Math.max(
    1,
    Math.min(Number(limit) || 1, list.length || 1),
  );
  let next = 0;

  async function lane() {
    while (next < list.length) {
      const index = next;
      next += 1;
      try {
        results[index] = await worker(list[index], index);
      } catch (error) {
        results[index] = { error };
      }
    }
  }

  await Promise.all(Array.from({ length: parallelism }, () => lane()));
  return results;
}

async function fetchWithTimeout(fetchImpl, url, timeoutMs, headers) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      cache: "no-store",
      headers,
    });
    const body = await response.arrayBuffer();
    return { response, bytes: body.byteLength };
  } finally {
    clearTimeout(timer);
  }
}

async function navigationRequest(url, headers = {}) {
  // This is the smallest valid current router state: a client at the app root
  // with no materialized parallel routes. Next owns both serialization and the
  // cache-key digest, so upgrades cannot leave a copied tree shape or hash stale.
  const state = prepareFlightRouterStateForRequest(["", {}]);
  const requestHeaders = {
    ...headers,
    rsc: "1",
    "next-router-state-tree": state,
    "next-url": new URL(url).pathname,
  };
  const hash = await computeCacheBustingSearchParam(
    requestHeaders["next-router-prefetch"],
    requestHeaders["next-router-segment-prefetch"],
    requestHeaders["next-router-state-tree"],
    requestHeaders["next-url"],
  );
  const requestUrl = new URL(url);
  requestUrl.searchParams.set("_rsc", hash);
  return { url: requestUrl.toString(), headers: requestHeaders };
}

async function warmRepresentation(
  url,
  representation,
  { fetchImpl, timeoutMs, retries, headers, now },
) {
  const started = now();
  let attempts = 0;
  let lastError = null;
  while (attempts <= retries) {
    attempts += 1;
    try {
      const request =
        representation === "navigation"
          ? await navigationRequest(url, headers)
          : { url, headers };
      const { response, bytes } = await fetchWithTimeout(
        fetchImpl,
        request.url,
        timeoutMs,
        request.headers,
      );
      const cache = classifyCacheHeaders(response.headers);
      const contentType =
        response.headers
          .get("content-type")
          ?.split(";", 1)[0]
          .trim()
          .toLowerCase() ?? "";
      const expectedContentType =
        representation === "navigation" ? "text/x-component" : "text/html";
      const statusOk = response.status >= 200 && response.status < 300;
      const ok = statusOk && contentType === expectedContentType && bytes > 0;
      const retryable = response.status >= 500;
      if (ok || !retryable || attempts > retries) {
        return {
          representation,
          ok,
          status: response.status,
          contentType,
          bytes,
          cache: cache.status,
          cacheHeader: cache.raw,
          attempts,
          durationMs: now() - started,
          error: ok
            ? null
            : !statusOk
              ? `HTTP ${response.status}`
              : contentType !== expectedContentType
                ? `expected ${expectedContentType}, received ${contentType || "no content type"}`
                : "empty response body",
        };
      }
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError =
        error && error.name === "AbortError"
          ? `timeout after ${timeoutMs}ms`
          : String((error && error.message) || error);
    }
  }
  return {
    representation,
    ok: false,
    status: null,
    contentType: null,
    bytes: 0,
    cache: "unknown",
    cacheHeader: null,
    attempts,
    durationMs: now() - started,
    error: lastError,
  };
}

/**
 * Warm and validate both representations used by a real App Router visit.
 * The two receipts remain separate so an HTML hit cannot conceal a broken
 * navigation response.
 */
export async function warmUrl(
  url,
  {
    fetchImpl = globalThis.fetch,
    timeoutMs = 20000,
    retries = 1,
    headers = {},
    now = () => Date.now(),
  } = {},
) {
  const started = now();
  const html = await warmRepresentation(url, "html", {
    fetchImpl,
    timeoutMs,
    retries,
    headers,
    now,
  });
  const navigation = await warmRepresentation(url, "navigation", {
    fetchImpl,
    timeoutMs,
    retries,
    headers,
    now,
  });
  return {
    url,
    ok: html.ok && navigation.ok,
    durationMs: now() - started,
    representations: { html, navigation },
    error:
      [html, navigation]
        .filter((receipt) => !receipt.ok)
        .map((receipt) => `${receipt.representation}: ${receipt.error}`)
        .join("; ") || null,
  };
}

/**
 * Warm a list of URLs with bounded concurrency. `deadlineAt` (epoch ms) stops
 * dispatching new requests once passed, so a time-boxed caller (the cron
 * handler) returns a partial summary instead of timing out; the skipped URLs
 * are reported as `remaining`.
 */
export async function warmUrls(urls, options = {}) {
  const {
    concurrency = 4,
    deadlineAt = null,
    now = () => Date.now(),
  } = options;
  const list = Array.from(urls);
  const skipped = [];
  const results = await runWithConcurrency(list, concurrency, async (url) => {
    if (deadlineAt !== null && now() >= deadlineAt) {
      skipped.push(url);
      return null;
    }
    return warmUrl(url, { ...options, now });
  });
  // Skipped lanes return null; `warmUrl` never throws, so a `{ error }` pool
  // wrapper has no `url`. A failed request is a result with `error` set and
  // must stay in the list, or the summary can never report a failure.
  return {
    results: results.filter(
      (entry) => entry !== null && typeof entry.url === "string",
    ),
    remaining: skipped,
  };
}

/**
 * Aggregate warm results into the printed / returned summary.
 */
export function summarizeWarmResults(
  results,
  { slowest = 10, totalMs = null, remaining = [] } = {},
) {
  const list = Array.from(results);
  const receipts = list.flatMap((result) =>
    Object.values(result.representations).map((receipt) => ({
      ...receipt,
      url: result.url,
    })),
  );
  const counts = { hit: 0, miss: 0, unknown: 0 };
  const failures = [];
  const byRepresentation = {
    html: { ok: 0, failed: 0, meanMs: 0, maxMs: 0 },
    navigation: { ok: 0, failed: 0, meanMs: 0, maxMs: 0 },
  };
  for (const receipt of receipts) {
    counts[receipt.cache in counts ? receipt.cache : "unknown"] += 1;
    const bucket = byRepresentation[receipt.representation];
    bucket[receipt.ok ? "ok" : "failed"] += 1;
    if (!receipt.ok)
      failures.push({
        url: receipt.url,
        representation: receipt.representation,
        status: receipt.status,
        error: receipt.error,
      });
  }
  for (const [representation, bucket] of Object.entries(byRepresentation)) {
    const durations = receipts
      .filter((receipt) => receipt.representation === representation)
      .map((receipt) => receipt.durationMs);
    bucket.meanMs =
      durations.length === 0
        ? 0
        : Math.round(
            durations.reduce((sum, ms) => sum + ms, 0) / durations.length,
          );
    bucket.maxMs = durations.length === 0 ? 0 : Math.max(...durations);
  }
  const slowestUrls = [...receipts]
    .sort((left, right) => right.durationMs - left.durationMs)
    .slice(0, slowest)
    .map(({ url, representation, durationMs, cache, status }) => ({
      url,
      representation,
      durationMs,
      cache,
      status,
    }));
  const durations = receipts.map((receipt) => receipt.durationMs);
  const total = list.length;
  const failedUrls = list.filter((result) => !result.ok).length;
  return {
    count: total,
    ok: total - failedUrls,
    failed: failedUrls,
    failureRate: total === 0 ? 0 : failedUrls / total,
    representations: byRepresentation,
    hits: counts.hit,
    misses: counts.miss,
    unknown: counts.unknown,
    slowest: slowestUrls,
    failures,
    remaining: remaining.length,
    meanMs:
      total === 0
        ? 0
        : Math.round(
            list.reduce((sum, result) => sum + result.durationMs, 0) / total,
          ),
    maxMs:
      total === 0 ? 0 : Math.max(...list.map((result) => result.durationMs)),
    totalMs: totalMs ?? durations.reduce((sum, ms) => sum + ms, 0),
  };
}

/** Render the summary as the lines the CLI prints. */
export function formatWarmSummary(summary) {
  const lines = [
    `Warmed ${summary.count} URL(s) in ${(summary.totalMs / 1000).toFixed(1)}s ` +
      `(mean ${summary.meanMs}ms, max ${summary.maxMs}ms)`,
    `Cache: ${summary.hits} hit, ${summary.misses} miss, ${summary.unknown} unknown`,
    `Failures: ${summary.failed} (${(summary.failureRate * 100).toFixed(1)}%)`,
    `HTML: ${summary.representations.html.ok} ok, ${summary.representations.html.failed} failed ` +
      `(mean ${summary.representations.html.meanMs}ms, max ${summary.representations.html.maxMs}ms)`,
    `Navigation: ${summary.representations.navigation.ok} ok, ${summary.representations.navigation.failed} failed ` +
      `(mean ${summary.representations.navigation.meanMs}ms, max ${summary.representations.navigation.maxMs}ms)`,
  ];
  if (summary.remaining > 0) {
    lines.push(`Not attempted (time budget): ${summary.remaining}`);
  }
  if (summary.slowest.length > 0) {
    lines.push(`Slowest ${summary.slowest.length}:`);
    for (const entry of summary.slowest) {
      lines.push(
        `  ${String(entry.durationMs).padStart(6)}ms  ${entry.representation.padEnd(10)} ${entry.cache.padEnd(7)} ${entry.status ?? "ERR"}  ${entry.url}`,
      );
    }
  }
  if (summary.failures.length > 0) {
    lines.push("Failed:");
    for (const failure of summary.failures) {
      lines.push(
        `  ${failure.url} [${failure.representation}]  ${failure.error ?? failure.status}`,
      );
    }
  }
  return lines.join("\n");
}

/** Parse `--flag=value`, `--flag value`, and boolean `--flag` CLI arguments. */
export function parseWarmArgs(argv, env = {}) {
  const options = {
    baseUrl: env.WARM_BASE_URL || env.PUBLIC_SITE_URL || null,
    all: false,
    concurrency: 4,
    timeoutMs: 20000,
    maxFailurePercent: 10,
    slowest: 10,
    help: false,
  };
  const args = Array.from(argv);
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("--")) continue;
    const eq = arg.indexOf("=");
    const name = eq === -1 ? arg.slice(2) : arg.slice(2, eq);
    const takeValue = () => {
      if (eq !== -1) return arg.slice(eq + 1);
      index += 1;
      return args[index];
    };
    switch (name) {
      case "base-url":
        options.baseUrl = takeValue();
        break;
      case "all":
        options.all = true;
        break;
      case "concurrency":
        options.concurrency = Number(takeValue());
        break;
      case "timeout":
        options.timeoutMs = Number(takeValue());
        break;
      case "max-failure-percent":
        options.maxFailurePercent = Number(takeValue());
        break;
      case "slowest":
        options.slowest = Number(takeValue());
        break;
      case "help":
        options.help = true;
        break;
      default:
        throw new Error(`Unknown flag --${name}`);
    }
  }
  for (const key of [
    "concurrency",
    "timeoutMs",
    "maxFailurePercent",
    "slowest",
  ]) {
    if (!Number.isFinite(options[key]) || options[key] < 0) {
      throw new Error(`--${key} must be a non-negative number`);
    }
  }
  if (options.concurrency < 1) options.concurrency = 1;
  return options;
}

/**
 * Resolve the sitemap URL for a base URL and pick the URLs to warm from it.
 * Nested sitemaps (a `<sitemapindex>`) are followed one level deep.
 */
export async function collectSitemapUrls(
  baseUrl,
  { fetchImpl = globalThis.fetch, timeoutMs = 20000 } = {},
) {
  const origin = new URL(baseUrl).origin;
  const sitemapUrl = new URL("/sitemap.xml", origin).toString();
  const load = async (url) => {
    const response = await fetchWithTimeoutText(fetchImpl, url, timeoutMs);
    if (!response.ok)
      throw new Error(`Sitemap ${url} returned HTTP ${response.status}`);
    return response.text;
  };
  const rootXml = await load(sitemapUrl);
  if (!isSitemapIndex(rootXml)) {
    return { sitemapUrl, urls: parseSitemapLocations(rootXml) };
  }
  const nested = parseSitemapLocations(rootXml);
  const urls = [];
  for (const nestedUrl of nested) {
    urls.push(...parseSitemapLocations(await load(nestedUrl)));
  }
  return { sitemapUrl, urls: Array.from(new Set(urls)) };
}

async function fetchWithTimeoutText(fetchImpl, url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      cache: "no-store",
      redirect: "follow",
    });
    return {
      ok: response.ok,
      status: response.status,
      text: await response.text(),
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Choose the warm set: substance articles only, or everything with `all`. */
export function selectWarmUrls(urls, { baseUrl, all = false }) {
  const unique = Array.from(new Set(urls));
  if (all) return unique;
  return unique.filter((url) => isSubstanceArticleUrl(url, baseUrl));
}
