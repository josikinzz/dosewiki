#!/usr/bin/env node
import { postgresFingerprintFromUrl } from "../lib/data-client.ts";

import { createDataClient } from "../lib/data-client.ts";

import { createBatchTargetClient, createBatchTargetRunContext, requireBatchArticleWriteToken } from "./lib/batch-targets.mjs";
import { printBatchBanner, printBatchSummary, runBatchGenerator } from "./lib/generator-runner.mjs";
import { CONFIG, parseArgs, printHelp } from "./pharmacology/cli.mjs";
import {
  COMPLETE_PHARMACOLOGY_FIELD_THRESHOLD,
  countPopulatedPharmacologyFields,
  getArticleSlug,
  selectArticlesForProcessing,
} from "./pharmacology/lib.mjs";
import {
  initPostgresClient,
  loadArticlesFromPostgres,
  loadPharmacologyQuoteSlugs,
  loadPromptFromPostgres,
} from "./pharmacology/loader.mjs";
import { createBackup, processAll } from "./pharmacology/persist.mjs";

async function main(options) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey && !options.dryRun) {
    console.error("Error: OPENROUTER_API_KEY environment variable is required");
    process.exit(1);
  }

  const targetContext = createBatchTargetRunContext({
    operation: "batch pharmacology generation",
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

  printBatchBanner({
    title: "Batch Pharmacology Section Generation",
    config: CONFIG,
    options,
    details: [
      { label: "Mode", value: options.dryRun ? "Dry run" : "Live run" },
      { label: "Priority Scope", value: options.all ? "All priorities" : "High/normal only" },
      { label: "Include Complete", value: options.includeComplete ? "Yes" : "No" },
      { label: "Source Postgres", value: postgresFingerprintFromUrl(sourceUrl) },
      { label: "Target Postgres", value: postgresFingerprintFromUrl(targetUrl) },
    ],
  });

  initPostgresClient(sourceUrl);

  console.log("\nLoading prompt from Postgres...");
  let systemPrompt;
  try {
    systemPrompt = await loadPromptFromPostgres();
    console.log(`  Prompt loaded: ${systemPrompt.length.toLocaleString()} chars`);
  } catch (error) {
    console.error(`Error loading prompt: ${error.message}`);
    process.exit(1);
  }

  console.log("\nLoading authoritative articles from Postgres...");
  let allArticles;
  let targetArticles;
  let pharmacologyQuoteSlugs;
  try {
    const targetClient = createDataClient({ target: targetUrl }).client;
    [allArticles, targetArticles, pharmacologyQuoteSlugs] = await Promise.all([
      loadArticlesFromPostgres(),
      sourceUrl === targetUrl ? loadArticlesFromPostgres() : loadArticlesFromPostgres(targetClient),
      loadPharmacologyQuoteSlugs(),
    ]);
    console.log(`  Articles loaded: ${allArticles.length}`);
    console.log(`  Target articles loaded: ${targetArticles.length}`);
    console.log(`  Pharmacology quote docs: ${pharmacologyQuoteSlugs.size}`);
  } catch (error) {
    console.error(`Error loading Postgres data: ${error.message}`);
    process.exit(1);
  }

  let articles;
  let selectionSummary;
  try {
    const selection = selectArticlesForProcessing(allArticles, options, pharmacologyQuoteSlugs);
    articles = selection.articles;
    selectionSummary = selection.summary;
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }

  console.log(`\nCandidate articles: ${selectionSummary.candidateCount}${options.all ? " (all priorities)" : " (high/normal)"}`);
  if (options.substance) {
    console.log(`Filtered to substance: ${options.substance}`);
  } else if (options.slugs?.length) {
    console.log(`Filtered to ${selectionSummary.requestedCount} substances from ${options.slugs.length} slugs`);
    if (selectionSummary.notFound.length > 0) {
      console.warn(`Warning: Slugs not found: ${selectionSummary.notFound.join(", ")}`);
    }
  }

  console.log(`Filtered to quote-backed articles: ${articles.length} (of ${selectionSummary.quoteBackedCount})`);
  if (!options.includeComplete) {
    console.log(
      `Filtered to incomplete pharmacology (<${COMPLETE_PHARMACOLOGY_FIELD_THRESHOLD} populated fields): ${articles.length} (of ${selectionSummary.incompleteCount})`,
    );
  }
  if (options.limit && selectionSummary.preLimitCount > articles.length) {
    console.log(`Limited to: ${articles.length} items`);
  }

  if (articles.length === 0) {
    console.log("\nNo articles to process.");
    return;
  }

  if (options.dryRun) {
    console.log("\n[DRY RUN] Would process:");
    for (const article of articles.slice(0, 20)) {
      const fieldCount = countPopulatedPharmacologyFields(article);
      console.log(`  - ${article.title} (${article.slug || ""}) [fields=${fieldCount}] [quote-backed]`);
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
    allArticles,
    sourceArticlesBySlug: new Map(allArticles.map((article) => [getArticleSlug(article), article])),
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
