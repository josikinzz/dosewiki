#!/usr/bin/env node
/**
 * Post-deploy warmer: request every substance article URL listed in the
 * public sitemap so readers do not pay a cold render after a deployment.
 *
 * Every directly reachable substance article is prerendered at build time
 * (lib/next/staticParams.ts). This script still fills and verifies the deployed
 * HTML and App Router navigation caches after the deployment becomes reachable.
 * It walks the sitemap with bounded concurrency and reports each representation
 * independently.
 *
 * Usage:
 *   node scripts/deploy/warm-public-routes.mjs --base-url https://dose.wiki
 *   npm run warm:public-routes -- --base-url https://dose.wiki --all
 *
 * Flags:
 *   --base-url <url>            Site origin to warm (or WARM_BASE_URL env var).
 *   --all                       Warm every sitemap URL, not just substance articles.
 *   --concurrency <n>           Requests in flight (default 4).
 *   --timeout <ms>              Per-request timeout (default 20000).
 *   --max-failure-percent <n>   Exit non-zero above this failure rate (default 10).
 *   --slowest <n>               How many slow URLs to print (default 10).
 *
 * Always point this at the public host (dose.wiki), never the editor host:
 * the editor hosts publish an empty sitemap by design.
 *
 * The scheduled route at src/app/api/warm/route.ts only warms a bounded
 * high-priority set. This CLI remains deliberate post-deployment sitemap warming.
 */

import {
  collectSitemapUrls,
  formatWarmSummary,
  parseWarmArgs,
  selectWarmUrls,
  summarizeWarmResults,
  warmUrls,
} from "./warm-public-routes.lib.mjs";

const USAGE = `Usage: node scripts/deploy/warm-public-routes.mjs --base-url <url> [--all] [--concurrency 4] [--timeout 20000] [--max-failure-percent 10]`;

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
  if (!options.baseUrl) {
    console.error("Missing --base-url (or WARM_BASE_URL).");
    console.error(USAGE);
    return 2;
  }

  const startedAt = Date.now();
  const { sitemapUrl, urls } = await collectSitemapUrls(options.baseUrl, {
    timeoutMs: options.timeoutMs,
  });
  const targets = selectWarmUrls(urls, {
    baseUrl: options.baseUrl,
    all: options.all,
  });
  console.log(
    `[warm] ${sitemapUrl} lists ${urls.length} URL(s); warming ${targets.length} ` +
      `${options.all ? "URL(s)" : "substance article(s)"} with concurrency ${options.concurrency}`,
  );
  if (targets.length === 0) {
    console.error(
      "[warm] Nothing to warm. Is this the public host? Editor hosts publish an empty sitemap.",
    );
    return 1;
  }

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
  console.log(formatWarmSummary(summary));

  if (summary.failureRate * 100 > options.maxFailurePercent) {
    console.error(
      `[warm] Failure rate ${(summary.failureRate * 100).toFixed(1)}% exceeds ${options.maxFailurePercent}%`,
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
