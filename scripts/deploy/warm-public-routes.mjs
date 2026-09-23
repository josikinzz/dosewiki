#!/usr/bin/env node
/**
 * Post-deploy warmer: request every substance article URL listed in the
 * public sitemap, on every public host named, so readers do not pay a cold
 * render after a deployment.
 *
 * Which substance articles a build prerenders is decided per locale and
 * artifact by lib/next/prerenderPolicy.ts; every article outside that list
 * renders on its first request and starts cold again after each deploy, since
 * the ISR page cache does not survive one. This script fills and verifies the
 * deployed HTML and App Router navigation caches after the deployment becomes
 * reachable. It walks the sitemap with bounded concurrency and reports each
 * representation independently, per host.
 *
 * Usage:
 *   node scripts/deploy/warm-public-routes.mjs --base-url https://dose.wiki
 *   node scripts/deploy/warm-public-routes.mjs --base-url https://dose.wiki,https://ru.dose.wiki,https://zh.dose.wiki
 *   npm run warm:public-routes -- --base-url https://dose.wiki --base-url https://effectindex.com --all
 *
 * Flags:
 *   --base-url <url>            Host to warm; repeat the flag or separate hosts with
 *                               commas (or set WARM_BASE_URL). Each host gets its own
 *                               summary and its own failure threshold.
 *   --all                       Warm every sitemap URL, not just substance articles.
 *   --concurrency <n>           Requests in flight per host (default 4).
 *   --timeout <ms>              Per-request timeout (default 20000).
 *   --max-failure-percent <n>   Exit non-zero when any host exceeds this failure rate (default 10).
 *   --slowest <n>               How many slow URLs to print per host (default 10).
 *
 * A locale mirror publishes no sitemap of its own: its /sitemap.xml is the
 * English list, so each location is moved onto the host being warmed before
 * the article filter runs. A host whose sitemap lists nothing warmable is
 * reported by name and fails the run only when every host is empty; a host
 * whose sitemap is missing or unreachable is reported by name and fails the
 * run after the other hosts have been warmed.
 *
 * Always point this at public hosts (dose.wiki, its mirrors, effectindex.com),
 * never an editor host: the editor hosts publish an empty sitemap by design.
 *
 * The scheduled route at src/app/api/warm/route.ts only warms a bounded
 * high-priority set. This CLI remains deliberate post-deployment sitemap warming.
 */

import {
  collectSitemapUrls,
  formatWarmSummary,
  parseWarmArgs,
  rehostUrls,
  selectWarmUrls,
  summarizeWarmResults,
  warmUrls,
} from "./warm-public-routes.lib.mjs";

const USAGE = `Usage: node scripts/deploy/warm-public-routes.mjs --base-url <url>[,<url>...] [--base-url <url>] [--all] [--concurrency 4] [--timeout 20000] [--max-failure-percent 10]`;

/** Warm one host end to end. Returns the summary, or null when the sitemap listed nothing warmable. */
async function warmHost(baseUrl, options) {
  const startedAt = Date.now();
  const { sitemapUrl, urls } = await collectSitemapUrls(baseUrl, {
    timeoutMs: options.timeoutMs,
  });
  const targets = selectWarmUrls(rehostUrls(urls, baseUrl), {
    baseUrl,
    all: options.all,
  });
  console.log(
    `[warm] ${baseUrl}: ${sitemapUrl} lists ${urls.length} URL(s); warming ${targets.length} ` +
      `${options.all ? "URL(s)" : "substance article(s)"} with concurrency ${options.concurrency}`,
  );
  if (targets.length === 0) return null;

  const { results } = await warmUrls(targets, {
    concurrency: options.concurrency,
    timeoutMs: options.timeoutMs,
    retries: 1,
    headers: {
      "user-agent":
        "dosewiki-warm/1.0 (+scripts/deploy/warm-public-routes.mjs)",
    },
  });
  const summary = summarizeWarmResults(results, {
    slowest: options.slowest,
    totalMs: Date.now() - startedAt,
  });
  console.log(`[warm] ${baseUrl}`);
  console.log(formatWarmSummary(summary));
  return { listed: urls.length, summary };
}

async function main() {
  let options;
  try {
    options = parseWarmArgs(process.argv.slice(2), process.env);
  } catch (error) {
    console.error(error.message);
    console.error(USAGE);
    return 2;
  }
  if (options.help) {
    console.log(USAGE);
    return 0;
  }
  if (options.baseUrls.length === 0) {
    console.error("Missing --base-url (or WARM_BASE_URL).");
    console.error(USAGE);
    return 2;
  }

  const empty = [];
  const unreachable = [];
  const overThreshold = [];
  const rows = [];
  for (const baseUrl of options.baseUrls) {
    let outcome;
    try {
      outcome = await warmHost(baseUrl, options);
    } catch (error) {
      // A missing or unreachable sitemap on one host must not hide the others.
      console.error(`[warm] ${baseUrl}: ${error && error.message ? error.message : error}`);
      unreachable.push(baseUrl);
      continue;
    }
    if (!outcome) {
      empty.push(baseUrl);
      continue;
    }
    const { listed, summary } = outcome;
    const failurePercent = summary.failureRate * 100;
    rows.push(
      `  ${baseUrl}: listed ${listed}, warmed ${summary.ok}, failed ${summary.failed} ` +
        `(${failurePercent.toFixed(1)}%)${summary.remaining > 0 ? `, not attempted ${summary.remaining}` : ""}`,
    );
    if (failurePercent > options.maxFailurePercent) overThreshold.push(baseUrl);
  }

  if (options.baseUrls.length > 1 || empty.length > 0) {
    console.log("[warm] Per host:");
    for (const row of rows) console.log(row);
  }
  for (const baseUrl of empty) {
    console.error(
      `[warm] Warning: ${baseUrl} listed nothing to warm. Is this a public host? ` +
        "Editor hosts publish an empty sitemap.",
    );
  }
  if (unreachable.length > 0) {
    console.error(`[warm] Sitemap missing or unreachable on: ${unreachable.join(", ")}`);
  }
  if (empty.length + unreachable.length === options.baseUrls.length) {
    console.error("[warm] Nothing was warmed on any host.");
    return 1;
  }
  if (unreachable.length > 0) return 1;
  if (overThreshold.length > 0) {
    console.error(
      `[warm] Failure rate exceeds ${options.maxFailurePercent}% on: ${overThreshold.join(", ")}`,
    );
    return 1;
  }
  return 0;
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error(`[warm] ${error && error.stack ? error.stack : error}`);
    process.exit(1);
  },
);
