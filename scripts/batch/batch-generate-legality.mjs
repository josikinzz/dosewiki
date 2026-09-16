#!/usr/bin/env node
import { postgresFingerprintFromUrl } from "../lib/data-client.ts";

import { createBatchTargetClient, createBatchTargetRunContext, requireBatchArticleWriteToken } from "./lib/batch-targets.mjs";
import { printBatchBanner, printBatchSummary, runBatchGenerator } from "./lib/generator-runner.mjs";
import { CONFIG, parseArgs, printHelp } from "./legality/cli.mjs";
import { getArticleSlug } from "./legality/lib.mjs";
import {
  initPostgresClient,
  loadArticles,
  loadLegalityQuotes,
  loadPromptFromPostgres,
} from "./legality/loader.mjs";
import { applyAndSyncUpdates, createBackup, processAll } from "./legality/persist.mjs";

async function main(options) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey && !options.dryRun) {
    console.error("Error: OPENROUTER_API_KEY environment variable is required");
    process.exit(1);
  }

  const targetContext = createBatchTargetRunContext({
    operation: "batch legality generation",
    argv: process.argv.slice(2),
  });
  const sourceUrl = targetContext.sourceUrl;
  const targetUrl = targetContext.targetUrl;
  if (!sourceUrl && !options.dryRun) {
    console.error("Error: batch source Postgres URL is required");
    process.exit(1);
  }
  if (!targetUrl && !options.dryRun) {
    console.error("Error: batch target Postgres URL is required");
    process.exit(1);
  }
  if (sourceUrl) {
    initPostgresClient(sourceUrl);
  }

  printBatchBanner({
    title: "Batch Legality Section Generation",
    config: CONFIG,
    options,
    details: [
      { label: "Mode", value: options.dryRun ? "Dry run" : "Live run" },
      { label: "Source Postgres", value: postgresFingerprintFromUrl(sourceUrl) },
      { label: "Target Postgres", value: postgresFingerprintFromUrl(targetUrl) },
    ],
  });

  const allArticles = await loadArticles();
  const explicitSelection = options.substance || options.slugs?.length;
  let articles = explicitSelection
    ? [...allArticles]
    : allArticles.filter((article) => article.priority === "high" || article.priority === "normal");
  console.log(`\nPriority articles (high/normal): ${articles.length}`);

  if (options.substance) {
    articles = articles.filter((article) => getArticleSlug(article) === options.substance);
    if (articles.length === 0) {
      console.error(`Error: No article found for slug "${options.substance}"`);
      process.exit(1);
    }
    console.log(`Filtered to substance: ${options.substance}`);
  } else if (options.slugs?.length) {
    const requested = new Set(options.slugs);
    articles = articles.filter((article) => requested.has(getArticleSlug(article)));
    const found = new Set(articles.map((article) => getArticleSlug(article)));
    const notFound = options.slugs.filter((slug) => !found.has(slug));
    console.log(`Filtered to ${articles.length} substances from ${options.slugs.length} slugs`);
    if (notFound.length > 0) {
      console.warn(`Warning: Slugs not found: ${notFound.join(", ")}`);
    }
  }

  if (options.limit && articles.length > options.limit) {
    articles = articles.slice(0, options.limit);
    console.log(`Limited to: ${articles.length} items`);
  }

  if (articles.length === 0) {
    console.log("\nNo articles to process.");
    return;
  }

  if (options.dryRun) {
    console.log("\n[DRY RUN] Would process:");
    for (const article of articles.slice(0, 20)) {
      const slug = getArticleSlug(article);
      const status = sourceUrl
        ? ((await loadLegalityQuotes(slug)) ? "has quotes" : "NO QUOTES")
        : "quote check unavailable";
      console.log(`  - ${article.title} (${status})`);
    }
    if (articles.length > 20) {
      console.log(`  ... and ${articles.length - 20} more`);
    }
    return;
  }

  console.log("\nLoading prompt from Postgres...");
  const systemPrompt = await loadPromptFromPostgres();
  console.log(`  Prompt loaded: ${systemPrompt.length.toLocaleString()} chars`);

  if (!options.skipBackup) {
    createBackup();
  }

  console.log(`\nProcessing ${articles.length} articles...\n`);
  const startTime = Date.now();
  const results = await processAll(apiKey, articles, systemPrompt, options);
  const duration = (Date.now() - startTime) / 1000;

  if (results.successfulUpdates.length > 0) {
    const adminKey = requireBatchArticleWriteToken();
    if (!adminKey) {
      throw new Error("DATA_ADMIN_KEY environment variable is required for Postgres sync");
    }
    const syncResult = await applyAndSyncUpdates(results, allArticles, createBatchTargetClient(targetContext), adminKey);
    console.log(`Postgres sync complete (${syncResult.created} created, ${syncResult.updated} updated).`);
  }

  printBatchSummary({
    results,
    durationSeconds: duration,
    failedItems: results.failedItems,
  });
}

await runBatchGenerator({
  parseOptions: parseArgs,
  printHelp,
  execute: main,
});
