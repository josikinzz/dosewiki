#!/usr/bin/env node
import { postgresFingerprintFromUrl } from "../lib/data-client.ts";

import { createBatchTargetClient, createBatchTargetRunContext, requireBatchArticleWriteToken } from "./lib/batch-targets.mjs";
import { printBatchBanner, printBatchSummary, runBatchGenerator } from "./lib/generator-runner.mjs";
import { CONFIG, parseArgs, printHelp } from "./harm-potential/cli.mjs";
import {
  hasExistingHarmPotential,
  hasNewSchemaHarmPotential,
  getArticleSlug,
  selectArticlesForProcessing,
} from "./harm-potential/lib.mjs";
import {
  initPostgresClient,
  loadArticles,
  loadHarmPotentialQuotes,
  loadPromptFromPostgres,
} from "./harm-potential/loader.mjs";
import { applyAndSyncUpdates, createBackup, processAll } from "./harm-potential/persist.mjs";

async function main(options) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey && !options.dryRun) {
    console.error("Error: OPENROUTER_API_KEY environment variable is required");
    process.exit(1);
  }

  const targetContext = createBatchTargetRunContext({
    operation: "batch harm potential generation",
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
    title: "Batch Harm Potential Section Generation",
    config: CONFIG,
    options,
    details: [
      {
        label: "Mode",
        value: options.newOnly
          ? "Articles with quotes but no new schema"
          : options.all
            ? "All articles with quotes"
            : "Only articles with existing content",
      },
      { label: "Source Postgres", value: postgresFingerprintFromUrl(sourceUrl) },
      { label: "Target Postgres", value: postgresFingerprintFromUrl(targetUrl) },
    ],
  });

  const allArticles = await loadArticles();
  const basePriorityArticles = allArticles.filter((article) => article.priority === "high" || article.priority === "normal");
  console.log(`\nPriority articles (high/normal): ${basePriorityArticles.length}`);

  let { articles, notFound } = selectArticlesForProcessing(allArticles, options);

  if (options.slugs?.length) {
    console.log(`Filtered to ${articles.length} substances from ${options.slugs.length} slugs`);
    if (notFound.length > 0) {
      console.warn(`Warning: Slugs not found: ${notFound.join(", ")}`);
    }
  } else if (options.substance) {
    console.log(`Filtered to substance: ${options.substance}`);
  } else if (options.newOnly) {
    const withQuoteStatus = await Promise.all(
      articles.map(async (article) => ({
        article,
        hasQuotes: !!(await loadHarmPotentialQuotes(getArticleSlug(article))),
      })),
    );
    articles = withQuoteStatus
      .filter(({ article, hasQuotes }) => hasQuotes && !hasNewSchemaHarmPotential(article))
      .map(({ article }) => article);
    console.log(`Filtered to articles with quotes but no new schema: ${articles.length} (of ${basePriorityArticles.length})`);
  } else if (!options.all) {
    console.log(`Filtered to articles with existing harm_potential: ${articles.length} (of ${basePriorityArticles.filter(hasExistingHarmPotential).length})`);
  }

  if (articles.length === 0) {
    console.log("\nNo articles to process.");
    return;
  }

  if (options.dryRun) {
    console.log("\n[DRY RUN] Would process:");
    for (const article of articles.slice(0, 20)) {
      const slug = getArticleSlug(article);
      const existing = hasExistingHarmPotential(article) ? "(has content)" : "(no content)";
      const quoteStatus = sourceUrl
        ? ((await loadHarmPotentialQuotes(slug)) ? "has quotes" : "NO QUOTES")
        : "quote check unavailable";
      console.log(`  - ${article.title} ${existing} [${quoteStatus}]`);
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
    console.log(`\nPersisting ${results.successfulUpdates.length} updates to Postgres...`);
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
