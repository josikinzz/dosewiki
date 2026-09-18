#!/usr/bin/env node
import { postgresFingerprintFromUrl } from "../lib/data-client.ts";

import { createBatchTargetClient, createBatchTargetRunContext, requireBatchArticleWriteToken } from "./lib/batch-targets.mjs";
import { printBatchBanner, printBatchSummary, runBatchGenerator } from "./lib/generator-runner.mjs";
import { CONFIG, parseArgs, printHelp } from "./dosage-duration/cli.mjs";
import {
  hasExistingDosageDuration,
  getArticleSlug,
  selectArticlesForProcessing,
} from "./dosage-duration/lib.mjs";
import {
  hasQuotesForSlug,
  initPostgresClient,
  loadArticles,
  loadDosageDurationQuotes,
  loadPromptFromPostgres,
} from "./dosage-duration/loader.mjs";
import { createBackup, processAll } from "./dosage-duration/persist.mjs";

async function main(options) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey && !options.dryRun) {
    console.error("Error: OPENROUTER_API_KEY environment variable is required");
    process.exit(1);
  }

  const targetContext = createBatchTargetRunContext({
    operation: "batch dosage duration generation",
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
    title: "Batch Dosage & Duration Section Generation (Review Mode)",
    config: CONFIG,
    options,
    details: [
      { label: "Mode", value: options.newOnly ? "New-only" : options.all ? "All quote-backed" : "Existing content only" },
      { label: "Field Preservation", value: "bioavailability / half_life preserved" },
      { label: "Source Postgres", value: postgresFingerprintFromUrl(sourceUrl) },
      { label: "Target Postgres", value: postgresFingerprintFromUrl(targetUrl) },
    ],
  });

  const allArticles = await loadArticles();
  let articles = selectArticlesForProcessing(allArticles, options, hasQuotesForSlug);

  console.log(`\nPriority articles (high/normal): ${allArticles.filter((article) => article.priority === "high" || article.priority === "normal").length}`);
  if (options.substance) {
    console.log(`Filtered to substance: ${options.substance}`);
  } else if (options.slugs?.length) {
    const found = new Set(articles.map((article) => getArticleSlug(article)));
    const notFound = options.slugs.filter((slug) => !found.has(slug));
    console.log(`Filtered to ${articles.length} substances from ${options.slugs.length} slugs`);
    if (notFound.length > 0) {
      console.warn(`Warning: Slugs not found: ${notFound.join(", ")}`);
    }
  } else if (options.newOnly) {
    console.log(`Filtered to articles with quotes but NO existing content: ${articles.length}`);
  } else if (!options.all) {
    const existingCount = allArticles.filter((article) =>
      (article.priority === "high" || article.priority === "normal") && hasExistingDosageDuration(article),
    ).length;
    console.log(`Filtered to articles with existing dosage/duration: ${articles.length} (of ${existingCount})`);
  }
  if (options.limit) {
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
      const quotes = loadDosageDurationQuotes(slug);
      const hasExisting = hasExistingDosageDuration(article);
      console.log(`  - ${article.title} ${hasExisting ? "(has content)" : "(no content)"} [${quotes ? "has quotes" : "NO QUOTES"}]`);
    }
    if (articles.length > 20) {
      console.log(`  ... and ${articles.length - 20} more`);
    }
    return;
  }

  console.log("\nLoading prompt from Postgres...");
  const systemPrompt = await loadPromptFromPostgres();
  console.log(`  Prompt loaded: ${systemPrompt.length.toLocaleString()} chars`);

  const adminKey = options.dryRun ? null : requireBatchArticleWriteToken();
  if (!adminKey) {
    console.error("Error: DATA_ADMIN_KEY environment variable is required for Postgres sync");
    process.exit(1);
  }

  if (!options.skipBackup) {
    createBackup();
  }

  console.log(`\nProcessing ${articles.length} articles...\n`);
  const startTime = Date.now();
  const results = await processAll(apiKey, articles, systemPrompt, options, {
    adminKey,
    postgresClient: createBatchTargetClient(targetContext),
    allArticles,
    articlesMap: new Map(allArticles.map((article) => [article.title, article])),
  });
  const duration = (Date.now() - startTime) / 1000;

  printBatchSummary({
    results,
    durationSeconds: duration,
    failedItems: results.failedItems,
  });

  if (results.successfulUpdates.length > 0) {
    console.log("\n" + "=".repeat(55));
    console.log("(Postgres sync already complete)");
    console.log("=".repeat(55));
  }
}

await runBatchGenerator({
  parseOptions: parseArgs,
  printHelp,
  execute: main,
});
