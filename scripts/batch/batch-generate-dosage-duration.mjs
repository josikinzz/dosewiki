#!/usr/bin/env node

import { printBatchBanner, printBatchSummary, runBatchGenerator } from "./lib/generator-runner.mjs";
import { CONFIG, parseArgs, printHelp } from "./dosage-duration/cli.mjs";
import {
  hasExistingDosageDuration,
  selectArticlesForProcessing,
  titleToSlug,
} from "./dosage-duration/lib.mjs";
import {
  getConvexClient,
  hasQuotesForSlug,
  initConvexClient,
  loadArticles,
  loadDosageDurationQuotes,
  loadPromptFromConvex,
} from "./dosage-duration/loader.mjs";
import { createBackup, processAll } from "./dosage-duration/persist.mjs";

async function main(options) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey && !options.dryRun) {
    console.error("Error: OPENROUTER_API_KEY environment variable is required");
    process.exit(1);
  }

  const convexUrl = process.env.CONVEX_URL || process.env.VITE_CONVEX_URL;
  if (!convexUrl && !options.dryRun) {
    console.error("Error: CONVEX_URL or VITE_CONVEX_URL environment variable is required");
    process.exit(1);
  }

  printBatchBanner({
    title: "Batch Dosage & Duration Section Generation (Review Mode)",
    config: CONFIG,
    options,
    details: [
      { label: "Mode", value: options.newOnly ? "New-only" : options.all ? "All quote-backed" : "Existing content only" },
      { label: "Field Preservation", value: "bioavailability / half_life preserved" },
    ],
  });

  const allArticles = loadArticles();
  let articles = selectArticlesForProcessing(allArticles, options, hasQuotesForSlug);

  console.log(`\nPriority articles (high/normal): ${allArticles.filter((article) => article.priority === "high" || article.priority === "normal").length}`);
  if (options.substance) {
    console.log(`Filtered to substance: ${options.substance}`);
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
      const slug = titleToSlug(article.title);
      const quotes = loadDosageDurationQuotes(slug);
      const hasExisting = hasExistingDosageDuration(article);
      console.log(`  - ${article.title} ${hasExisting ? "(has content)" : "(no content)"} [${quotes ? "has quotes" : "NO QUOTES"}]`);
    }
    if (articles.length > 20) {
      console.log(`  ... and ${articles.length - 20} more`);
    }
    return;
  }

  initConvexClient(convexUrl);

  console.log("\nLoading prompt from Convex...");
  const systemPrompt = await loadPromptFromConvex();
  console.log(`  Prompt loaded: ${systemPrompt.length.toLocaleString()} chars`);

  const adminKey = process.env.CONVEX_ADMIN_KEY;
  if (!adminKey) {
    console.error("Error: CONVEX_ADMIN_KEY environment variable is required for Convex sync");
    process.exit(1);
  }

  if (!options.skipBackup) {
    createBackup();
  }

  console.log(`\nProcessing ${articles.length} articles...\n`);
  const startTime = Date.now();
  const results = await processAll(apiKey, articles, systemPrompt, options, {
    adminKey,
    convexClient: getConvexClient(),
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
    console.log("IMPORTANT: Run the following to rebuild compressed articles:");
    console.log("  node scripts/build/buildCompressedArticles.mjs");
    console.log("(Convex sync already complete)");
    console.log("=".repeat(55));
  }
}

await runBatchGenerator({
  parseOptions: parseArgs,
  printHelp,
  execute: main,
});
