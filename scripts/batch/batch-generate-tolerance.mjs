#!/usr/bin/env node
import { postgresFingerprintFromUrl } from "../lib/data-client.ts";

import { createDataClient } from "../lib/data-client.ts";

import { createBatchTargetClient, createBatchTargetRunContext, requireBatchArticleWriteToken } from "./lib/batch-targets.mjs";
import { printBatchBanner, printBatchSummary, runBatchGenerator } from "./lib/generator-runner.mjs";
import { CONFIG, parseArgs, printHelp } from "./tolerance/cli.mjs";
import {
  getArticleSlug,
  hasExistingTolerance,
  selectArticlesForProcessing,
} from "./tolerance/lib.mjs";
import {
  initPostgresClient,
  loadArticlesFromPostgres,
  loadPromptFromPostgres,
  loadToleranceQuoteSlugs,
} from "./tolerance/loader.mjs";
import { createBackup, processAll } from "./tolerance/persist.mjs";

async function main(options) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey && !options.dryRun) {
    console.error("Error: OPENROUTER_API_KEY environment variable is required");
    process.exit(1);
  }

  const targetContext = createBatchTargetRunContext({
    operation: "batch tolerance generation",
    argv: process.argv.slice(2),
  });
  const sourceUrl = targetContext.sourceUrl;
  const targetUrl = targetContext.targetUrl;
  if (!sourceUrl) {
    console.error("Error: batch source Postgres URL is required");
    process.exit(1);
  }
  if (!targetUrl && !options.dryRun) {
    console.error("Error: batch target Postgres URL is required");
    process.exit(1);
  }
  initPostgresClient(sourceUrl);

  printBatchBanner({
    title: "Batch Tolerance Section Generation",
    config: CONFIG,
    options,
    details: [
      { label: "Mode", value: options.dryRun ? "Dry run" : "Live run" },
      { label: "Priority Scope", value: options.all ? "All priorities" : "High/normal only" },
      { label: "Include Existing", value: options.includeExisting ? "Yes" : "No" },
      { label: "Source Postgres", value: postgresFingerprintFromUrl(sourceUrl) },
      { label: "Target Postgres", value: postgresFingerprintFromUrl(targetUrl) },
    ],
  });

  console.log("\nLoading prompt from Postgres...");
  const systemPrompt = await loadPromptFromPostgres();
  console.log(`  Prompt loaded: ${systemPrompt.length.toLocaleString()} chars`);

  console.log("\nLoading authoritative articles and quote availability...");
  const targetClient = targetUrl ? createDataClient({ target: targetUrl }).client : null;
  const [sourceArticles, targetArticles, toleranceQuoteSlugs] = await Promise.all([
    loadArticlesFromPostgres(),
    targetClient ? loadArticlesFromPostgres(targetClient) : Promise.resolve([]),
    loadToleranceQuoteSlugs(),
  ]);

  console.log(`  Source articles loaded: ${sourceArticles.length}`);
  console.log(`  Target articles loaded: ${targetArticles.length}`);
  console.log(`  Tolerance quote docs: ${toleranceQuoteSlugs.size}`);

  const { articles, summary } = selectArticlesForProcessing(sourceArticles, options, toleranceQuoteSlugs);
  console.log(`\nCandidate articles: ${summary.candidateCount}${options.all ? " (all priorities)" : " (high/normal)"}`);
  if (options.substance) {
    console.log(`Filtered to substance: ${options.substance}`);
  } else if (options.slugs?.length) {
    console.log(`Filtered to ${summary.requestedCount} substances from ${options.slugs.length} slugs`);
    if (summary.notFound.length > 0) {
      console.warn(`Warning: Slugs not found: ${summary.notFound.join(", ")}`);
    }
  }
  console.log(`Filtered to quote-backed articles: ${summary.quoteBackedCount}`);
  if (!options.includeExisting) {
    console.log(`Filtered to articles without existing tolerance content: ${summary.incompleteCount}`);
  }

  if (articles.length === 0) {
    console.log("\nNo articles to process.");
    return;
  }

  if (options.dryRun) {
    console.log("\n[DRY RUN] Would process:");
    for (const article of articles.slice(0, 20)) {
      console.log(`  - ${article.title} (${article.slug || ""}) ${hasExistingTolerance(article) ? "(has content)" : "(no content)"}`);
    }
    if (articles.length > 20) {
      console.log(`  ... and ${articles.length - 20} more`);
    }
    return;
  }

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
    sourceArticlesBySlug: new Map(sourceArticles.map((article) => [getArticleSlug(article), article])),
    targetArticlesBySlug: new Map(targetArticles.map((article) => [getArticleSlug(article), article])),
  });
  const duration = (Date.now() - startTime) / 1000;

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
