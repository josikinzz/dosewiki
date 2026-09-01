/**
 * The warmer's parsing and summary logic, exercised without a network. The
 * route handler at src/app/api/warm/route.ts shares this module, so these
 * assertions cover both the CLI and the cron path.
 */

import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyCacheHeaders,
  formatWarmSummary,
  isSitemapIndex,
  isSubstanceArticleUrl,
  parseSitemapLocations,
  parseWarmArgs,
  runWithConcurrency,
  selectWarmUrls,
  summarizeWarmResults,
  warmUrl,
  warmUrls,
  collectSitemapUrls,
} from "./warm-public-routes.lib.mjs";

const URLSET = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<url><loc>https://dose.wiki</loc><lastmod>2026-09-01</lastmod></url>
<url><loc>https://dose.wiki/substances</loc></url>
<url><loc>https://dose.wiki/lsd</loc></url>
<url><loc> https://dose.wiki/2c-b </loc></url>
<url><loc>https://dose.wiki/effects/visual-acuity-enhancement</loc></url>
<url><loc>https://dose.wiki/lsd</loc></url>
<url><loc>https://dose.wiki/blog</loc></url>
<url><loc>https://dose.wiki/search?q=a&amp;b=c</loc></url>
</urlset>`;

test("parseSitemapLocations reads, trims, decodes, and dedupes <loc> entries", () => {
  assert.deepEqual(parseSitemapLocations(URLSET), [
    "https://dose.wiki",
    "https://dose.wiki/substances",
    "https://dose.wiki/lsd",
    "https://dose.wiki/2c-b",
    "https://dose.wiki/effects/visual-acuity-enhancement",
    "https://dose.wiki/blog",
    "https://dose.wiki/search?q=a&b=c",
  ]);
  assert.equal(isSitemapIndex(URLSET), false);
  assert.equal(isSitemapIndex(`<sitemapindex><sitemap><loc>x</loc></sitemap></sitemapindex>`), true);
});

test("isSubstanceArticleUrl keeps single-segment article paths on the same origin", () => {
  const base = "https://dose.wiki";
  assert.equal(isSubstanceArticleUrl("https://dose.wiki/lsd", base), true);
  assert.equal(isSubstanceArticleUrl("https://dose.wiki/2c-b/", base), true);
  assert.equal(isSubstanceArticleUrl("https://dose.wiki/", base), false);
  assert.equal(isSubstanceArticleUrl("https://dose.wiki/substances", base), false);
  assert.equal(isSubstanceArticleUrl("https://dose.wiki/Blog", base), false);
  assert.equal(isSubstanceArticleUrl("https://dose.wiki/effects/x", base), false);
  assert.equal(isSubstanceArticleUrl("https://dev.dose.wiki/lsd", base), false);
  assert.equal(isSubstanceArticleUrl("not a url", base), false);
});

test("selectWarmUrls picks articles by default and everything with --all", () => {
  const urls = parseSitemapLocations(URLSET);
  assert.deepEqual(selectWarmUrls(urls, { baseUrl: "https://dose.wiki" }), [
    "https://dose.wiki/lsd",
    "https://dose.wiki/2c-b",
  ]);
  assert.equal(selectWarmUrls(urls, { baseUrl: "https://dose.wiki", all: true }).length, 7);
});

test("classifyCacheHeaders maps Vercel and Next cache headers", () => {
  const expect = (headers, status, raw) => {
    assert.deepEqual(classifyCacheHeaders(headers), { status, raw });
  };
  expect(new Headers({ "x-vercel-cache": "HIT" }), "hit", "HIT");
  expect(new Headers({ "x-vercel-cache": "stale" }), "hit", "STALE");
  expect(new Headers({ "x-vercel-cache": "PRERENDER" }), "hit", "PRERENDER");
  expect(new Headers({ "x-vercel-cache": "REVALIDATED" }), "hit", "REVALIDATED");
  expect(new Headers({ "x-vercel-cache": "MISS" }), "miss", "MISS");
  expect(new Headers({ "x-vercel-cache": "BYPASS" }), "miss", "BYPASS");
  expect({ "X-Nextjs-Cache": "MISS" }, "miss", "MISS");
  expect(new Headers({ "x-vercel-cache": "WEIRD" }), "unknown", "WEIRD");
  expect(new Headers(), "unknown", null);
  expect(null, "unknown", null);
  // Vercel's header wins when both are present.
  expect(new Headers({ "x-vercel-cache": "HIT", "x-nextjs-cache": "MISS" }), "hit", "HIT");
});

test("runWithConcurrency bounds in-flight work and keeps order", async () => {
  let inFlight = 0;
  let peak = 0;
  const results = await runWithConcurrency([1, 2, 3, 4, 5, 6], 2, async (n) => {
    inFlight += 1;
    peak = Math.max(peak, inFlight);
    await new Promise((resolve) => setTimeout(resolve, 5));
    inFlight -= 1;
    if (n === 4) throw new Error("boom");
    return n * 10;
  });
  assert.equal(peak, 2);
  assert.deepEqual(results.slice(0, 3), [10, 20, 30]);
  assert.equal(results[3].error.message, "boom");
  assert.deepEqual(results.slice(4), [50, 60]);
});

function fakeResponse(status, headers = {}) {
  return {
    status,
    ok: status < 400,
    headers: new Headers(headers),
    arrayBuffer: async () => new ArrayBuffer(0),
    text: async () => "",
  };
}

test("warmUrl retries once on a 5xx and reports the cache header", async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    return calls.length === 1
      ? fakeResponse(503)
      : fakeResponse(200, { "x-vercel-cache": "MISS" });
  };
  const result = await warmUrl("https://dose.wiki/lsd", { fetchImpl, retries: 1 });
  assert.equal(calls.length, 2);
  assert.equal(result.ok, true);
  assert.equal(result.status, 200);
  assert.equal(result.cache, "miss");
  assert.equal(result.attempts, 2);
});

test("warmUrl does not retry a 404 and records it as a failure", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return fakeResponse(404, { "x-vercel-cache": "MISS" });
  };
  const result = await warmUrl("https://dose.wiki/nope", { fetchImpl });
  assert.equal(calls, 1);
  assert.equal(result.ok, false);
  assert.equal(result.status, 404);
  assert.equal(result.error, "HTTP 404");
});

test("warmUrl gives up after the retry on a network error", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    throw new Error("ECONNRESET");
  };
  const result = await warmUrl("https://dose.wiki/lsd", { fetchImpl, retries: 1 });
  assert.equal(calls, 2);
  assert.equal(result.ok, false);
  assert.equal(result.status, null);
  assert.equal(result.error, "ECONNRESET");
});

test("warmUrl reports a timeout when the request aborts", async () => {
  const fetchImpl = (_url, { signal }) =>
    new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => {
        const error = new Error("aborted");
        error.name = "AbortError";
        reject(error);
      });
    });
  const result = await warmUrl("https://dose.wiki/lsd", { fetchImpl, timeoutMs: 5, retries: 0 });
  assert.equal(result.ok, false);
  assert.match(result.error, /timeout after 5ms/);
});

test("warmUrls stops dispatching after the deadline and reports the rest as remaining", async () => {
  let clock = 0;
  const fetchImpl = async () => {
    clock += 10;
    return fakeResponse(200, { "x-vercel-cache": "HIT" });
  };
  const urls = ["https://a/1", "https://a/2", "https://a/3", "https://a/4"];
  const { results, remaining } = await warmUrls(urls, {
    fetchImpl,
    concurrency: 1,
    deadlineAt: 25,
    now: () => clock,
  });
  assert.equal(results.length, 3);
  assert.deepEqual(remaining, ["https://a/4"]);
});

test("summarizeWarmResults counts hits, misses, failures, and the slowest URLs", () => {
  const results = [
    { url: "https://a/1", ok: true, status: 200, cache: "hit", durationMs: 50, error: null },
    { url: "https://a/2", ok: true, status: 200, cache: "miss", durationMs: 900, error: null },
    { url: "https://a/3", ok: false, status: 500, cache: "unknown", durationMs: 300, error: "HTTP 500" },
    { url: "https://a/4", ok: true, status: 200, cache: "hit", durationMs: 120, error: null },
  ];
  const summary = summarizeWarmResults(results, { slowest: 2, totalMs: 1000, remaining: ["https://a/5"] });
  assert.equal(summary.count, 4);
  assert.equal(summary.ok, 3);
  assert.equal(summary.failed, 1);
  assert.equal(summary.failureRate, 0.25);
  assert.equal(summary.hits, 2);
  assert.equal(summary.misses, 1);
  assert.equal(summary.unknown, 1);
  assert.deepEqual(
    summary.slowest.map((entry) => entry.url),
    ["https://a/2", "https://a/3"],
  );
  assert.equal(summary.remaining, 1);
  assert.equal(summary.totalMs, 1000);
  assert.equal(summary.maxMs, 900);
  assert.equal(summary.meanMs, 343);

  const text = formatWarmSummary(summary);
  assert.match(text, /Warmed 4 URL\(s\) in 1\.0s/);
  assert.match(text, /Cache: 2 hit, 1 miss, 1 unknown/);
  assert.match(text, /Failures: 1 \(25\.0%\)/);
  assert.match(text, /Not attempted \(time budget\): 1/);
  assert.match(text, /https:\/\/a\/3\s{2}HTTP 500/);
});

test("summarizeWarmResults handles an empty run", () => {
  const summary = summarizeWarmResults([]);
  assert.equal(summary.count, 0);
  assert.equal(summary.failureRate, 0);
  assert.equal(summary.maxMs, 0);
  assert.deepEqual(summary.slowest, []);
});

test("parseWarmArgs reads flags in both forms and falls back to the env", () => {
  assert.deepEqual(parseWarmArgs([], { WARM_BASE_URL: "https://dose.wiki" }), {
    baseUrl: "https://dose.wiki",
    all: false,
    concurrency: 4,
    timeoutMs: 20000,
    maxFailurePercent: 10,
    slowest: 10,
    help: false,
  });
  const parsed = parseWarmArgs([
    "--base-url=https://example.test",
    "--all",
    "--concurrency",
    "8",
    "--timeout=500",
    "--max-failure-percent",
    "0",
  ]);
  assert.equal(parsed.baseUrl, "https://example.test");
  assert.equal(parsed.all, true);
  assert.equal(parsed.concurrency, 8);
  assert.equal(parsed.timeoutMs, 500);
  assert.equal(parsed.maxFailurePercent, 0);
  assert.throws(() => parseWarmArgs(["--bogus"]), /Unknown flag --bogus/);
  assert.throws(() => parseWarmArgs(["--concurrency=abc"]), /--concurrency must be/);
});

test("collectSitemapUrls follows a sitemap index one level deep", async () => {
  const documents = {
    "https://dose.wiki/sitemap.xml": `<sitemapindex><sitemap><loc>https://dose.wiki/sitemap/0.xml</loc></sitemap></sitemapindex>`,
    "https://dose.wiki/sitemap/0.xml": URLSET,
  };
  const fetchImpl = async (url) => ({
    ok: true,
    status: 200,
    text: async () => documents[url],
  });
  const { sitemapUrl, urls } = await collectSitemapUrls("https://dose.wiki/lsd", { fetchImpl });
  assert.equal(sitemapUrl, "https://dose.wiki/sitemap.xml");
  assert.equal(urls.length, 7);
});
