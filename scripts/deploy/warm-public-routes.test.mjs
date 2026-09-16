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
  assert.equal(
    isSitemapIndex(
      `<sitemapindex><sitemap><loc>x</loc></sitemap></sitemapindex>`,
    ),
    true,
  );
});

test("isSubstanceArticleUrl keeps single-segment article paths on the same origin", () => {
  const base = "https://dose.wiki";
  assert.equal(isSubstanceArticleUrl("https://dose.wiki/lsd", base), true);
  assert.equal(isSubstanceArticleUrl("https://dose.wiki/2c-b/", base), true);
  assert.equal(isSubstanceArticleUrl("https://dose.wiki/", base), false);
  assert.equal(
    isSubstanceArticleUrl("https://dose.wiki/substances", base),
    false,
  );
  assert.equal(isSubstanceArticleUrl("https://dose.wiki/Blog", base), false);
  assert.equal(
    isSubstanceArticleUrl("https://dose.wiki/effects/x", base),
    false,
  );
  assert.equal(isSubstanceArticleUrl("https://dev.dose.wiki/lsd", base), false);
  assert.equal(isSubstanceArticleUrl("not a url", base), false);
});

test("selectWarmUrls picks articles by default and everything with --all", () => {
  const urls = parseSitemapLocations(URLSET);
  assert.deepEqual(selectWarmUrls(urls, { baseUrl: "https://dose.wiki" }), [
    "https://dose.wiki/lsd",
    "https://dose.wiki/2c-b",
  ]);
  assert.equal(
    selectWarmUrls(urls, { baseUrl: "https://dose.wiki", all: true }).length,
    7,
  );
});

test("classifyCacheHeaders maps Vercel and Next cache headers", () => {
  const expect = (headers, status, raw) => {
    assert.deepEqual(classifyCacheHeaders(headers), { status, raw });
  };
  expect(new Headers({ "x-vercel-cache": "HIT" }), "hit", "HIT");
  expect(new Headers({ "x-vercel-cache": "stale" }), "hit", "STALE");
  expect(new Headers({ "x-vercel-cache": "PRERENDER" }), "hit", "PRERENDER");
  expect(
    new Headers({ "x-vercel-cache": "REVALIDATED" }),
    "hit",
    "REVALIDATED",
  );
  expect(new Headers({ "x-vercel-cache": "MISS" }), "miss", "MISS");
  expect(new Headers({ "x-vercel-cache": "BYPASS" }), "miss", "BYPASS");
  expect({ "X-Nextjs-Cache": "MISS" }, "miss", "MISS");
  expect(new Headers({ "x-vercel-cache": "WEIRD" }), "unknown", "WEIRD");
  expect(new Headers(), "unknown", null);
  expect(null, "unknown", null);
  // Vercel's header wins when both are present.
  expect(
    new Headers({ "x-vercel-cache": "HIT", "x-nextjs-cache": "MISS" }),
    "hit",
    "HIT",
  );
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

function fakeResponse(status, headers = {}, bytes = 1) {
  return {
    status,
    ok: status < 400,
    headers: new Headers(headers),
    arrayBuffer: async () => new ArrayBuffer(bytes),
    text: async () => "",
  };
}

function validResponse(init, status = 200, cache = "MISS") {
  const navigation = new Headers(init?.headers).get("rsc") === "1";
  return fakeResponse(status, {
    "content-type": navigation
      ? "text/x-component"
      : "text/html; charset=utf-8",
    "x-vercel-cache": cache,
  });
}

test("warmUrl validates complete HTML and genuine Next navigation responses", async () => {
  const requests = [];
  const result = await warmUrl("https://dose.wiki/lsd", {
    fetchImpl: async (url, init) => {
      requests.push({ url: String(url), headers: new Headers(init.headers) });
      return validResponse(init);
    },
    retries: 0,
  });

  assert.equal(result.ok, true);
  assert.equal(requests.length, 2);
  assert.equal(requests[0].headers.get("rsc"), null);
  assert.equal(requests[1].headers.get("rsc"), "1");
  assert.ok(requests[1].headers.get("next-router-state-tree"));
  assert.ok(new URL(requests[1].url).searchParams.get("_rsc"));
  assert.equal(result.representations.html.contentType, "text/html");
  assert.equal(
    result.representations.navigation.contentType,
    "text/x-component",
  );
});

test("warmUrl rejects an HTML fallback returned to a navigation request", async () => {
  const result = await warmUrl("https://dose.wiki/lsd", {
    fetchImpl: async (_url, init) => {
      const navigation = new Headers(init.headers).get("rsc") === "1";
      return fakeResponse(200, {
        "content-type": navigation ? "text/html" : "text/html; charset=utf-8",
      });
    },
    retries: 0,
  });
  assert.equal(result.ok, false);
  assert.equal(result.representations.html.ok, true);
  assert.equal(result.representations.navigation.ok, false);
  assert.match(
    result.representations.navigation.error,
    /expected text\/x-component/,
  );
});

test("warmUrl retries a 5xx independently and does not retry a 404", async () => {
  let calls = 0;
  const recovered = await warmUrl("https://dose.wiki/lsd", {
    fetchImpl: async (_url, init) => {
      calls += 1;
      return calls === 1 ? validResponse(init, 503) : validResponse(init);
    },
    retries: 1,
  });
  assert.equal(recovered.ok, true);
  assert.equal(recovered.representations.html.attempts, 2);

  calls = 0;
  const missing = await warmUrl("https://dose.wiki/nope", {
    fetchImpl: async (_url, init) => {
      calls += 1;
      return validResponse(init, 404);
    },
  });
  assert.equal(calls, 2);
  assert.equal(missing.ok, false);
  assert.equal(missing.representations.html.attempts, 1);
  assert.equal(missing.representations.navigation.attempts, 1);
});

test("warmUrl reports bounded timeouts for both representations", async () => {
  const fetchImpl = (_url, { signal }) =>
    new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => {
        const error = new Error("aborted");
        error.name = "AbortError";
        reject(error);
      });
    });
  const result = await warmUrl("https://dose.wiki/lsd", {
    fetchImpl,
    timeoutMs: 5,
    retries: 0,
  });
  assert.equal(result.ok, false);
  assert.match(result.representations.html.error, /timeout after 5ms/);
  assert.match(result.representations.navigation.error, /timeout after 5ms/);
});

test("warmUrls stops dispatching after the deadline and reports the rest", async () => {
  let clock = 0;
  const urls = ["https://a/1", "https://a/2", "https://a/3"];
  const { results, remaining } = await warmUrls(urls, {
    fetchImpl: async (_url, init) => {
      clock += 10;
      return validResponse(init, 200, "HIT");
    },
    concurrency: 1,
    deadlineAt: 25,
    now: () => clock,
  });
  assert.equal(results.length, 2);
  assert.deepEqual(remaining, ["https://a/3"]);
});

test("summarizeWarmResults exposes failures and timing by representation", async () => {
  const { results } = await warmUrls(["https://a/ok", "https://a/bad"], {
    fetchImpl: async (url, init) =>
      validResponse(init, String(url).includes("/bad") ? 404 : 200),
    retries: 0,
  });
  const summary = summarizeWarmResults(results, { slowest: 2, totalMs: 1000 });
  assert.equal(summary.count, 2);
  assert.equal(summary.ok, 1);
  assert.equal(summary.failed, 1);
  assert.equal(summary.representations.html.ok, 1);
  assert.equal(summary.representations.navigation.failed, 1);
  assert.equal(summary.failures.length, 2);
  assert.match(formatWarmSummary(summary), /Navigation: 1 ok, 1 failed/);
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
  assert.throws(
    () => parseWarmArgs(["--concurrency=abc"]),
    /--concurrency must be/,
  );
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
  const { sitemapUrl, urls } = await collectSitemapUrls(
    "https://dose.wiki/lsd",
    { fetchImpl },
  );
  assert.equal(sitemapUrl, "https://dose.wiki/sitemap.xml");
  assert.equal(urls.length, 7);
});
