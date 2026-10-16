#!/usr/bin/env node

import {
  collectSitemapUrls,
  formatWarmSummary,
  parseWarmArgs,
  rehostUrls,
  selectWarmUrls,
  summarizeWarmResults,
  warmUrls,
} from "./warm-public-routes.lib.mjs";

const USAGE = `Usage: node scripts/deploy/warm-public-routes.mjs --base-url <url>[,<url>...] [--base-url <url>] [--all] [--concurrency 4] [--timeout 20000] [--max-failure-percent 10] [--slowest 10]`;

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
