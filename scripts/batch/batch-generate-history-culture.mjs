#!/usr/bin/env node
import { postgresFingerprintFromUrl } from "../lib/data-client.ts";

import { createBatchTargetClient, createBatchTargetRunContext, requireBatchArticleWriteToken } from "./lib/batch-targets.mjs";
import { printBatchBanner, printBatchSummary, runBatchGenerator } from "./lib/generator-runner.mjs";
import { CONFIG, parseArgs, printHelp } from "./history-culture/cli.mjs";
import {
  hasExistingHistoryCulture,
  getArticleSlug,
  selectArticlesForProcessing,
} from "./history-culture/lib.mjs";
import {
  initPostgresClient,
  loadArticles,
  loadHistoryCultureQuotes,
  loadPromptFromPostgres,
} from "./history-culture/loader.mjs";
import { applyAndSyncUpdates, createBackup, processAll } from "./history-culture/persist.mjs";

async function main(options) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey && !options.dryRun) {
    console.error("Error: OPENROUTER_API_KEY environment variable is required");
    process.exit(1);
  }

  const targetContext = createBatchTargetRunContext({
    operation: "batch history culture generation",
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
    title: "Batch History & Culture Section Generation",
    config: CONFIG,
    options,
    details: [
      { label: "Mode", value: options.newOnly ? "New-only" : options.all ? "All quote-backed" : "Existing content only" },
      { label: "Source Postgres", value: postgresFingerprintFromUrl(sourceUrl) },
      { label: "Target Postgres", value: postgresFingerprintFromUrl(targetUrl) },
    ],
  });

  const allArticles = await loadArticles();
  const explicitSelection = options.substance || options.slugs?.length || options.all;
  let articles = explicitSelection
    ? [...allArticles]
    : allArticles.filter((article) => article.priority === "high" || article.priority === "normal");
  console.log(`\nPriority articles (high/normal): ${articles.length}`);

  if (options.substance || options.slugs?.length) {
    try {
      const selection = selectArticlesForProcessing(articles, options);
      articles = selection.articles;
      if (selection.notFound.length > 0) {
        console.warn(`Warning: Slugs not found: ${selection.notFound.join(", ")}`);
      }
    } catch (error) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
    if (options.substance) {
      console.log(`Filtered to substance: ${options.substance}`);
    } else {
      console.log(`Filtered to ${articles.length} substances from ${options.slugs.length} slugs`);
    }
  } else if (options.newOnly) {
    const beforeCount = articles.length;
    articles = articles.filter((article) => {
      const hasQuotes = sourceUrl ? false : false;
      return hasQuotes && !hasExistingHistoryCulture(article);
    });
    if (sourceUrl) {
      const quoteResults = await Promise.all(
        articles.map(async (article) => ({
          article,
          hasQuotes: !!(await loadHistoryCultureQuotes(getArticleSlug(article))),
        })),
      );
      articles = quoteResults.filter(({ article, hasQuotes }) => hasQuotes && !hasExistingHistoryCulture(article)).map(({ article }) => article);
    }
    console.log(`Filtered to articles with quotes but NO existing content: ${articles.length} (of ${beforeCount})`);
  } else if (!options.all) {
    const beforeCount = articles.length;
    articles = articles.filter(hasExistingHistoryCulture);
    console.log(`Filtered to articles with existing history_culture: ${articles.length} (of ${beforeCount})`);
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
        ? ((await loadHistoryCultureQuotes(slug)) ? "has quotes" : "NO QUOTES")
        : "quote check unavailable";
      const existing = hasExistingHistoryCulture(article) ? "(has content)" : "(no content)";
      console.log(`  - ${article.title} ${existing} [${status}]`);
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
