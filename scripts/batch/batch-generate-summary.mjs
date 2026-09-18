#!/usr/bin/env node
import { postgresFingerprintFromUrl } from "../lib/data-client.ts";
/**
 * Batch Summary Section Generation Script
 *
 * Generates top-level article summaries using the live Postgres prompt.
 *
 * Defaults:
 * - Reads prompt/content from SOURCE_POSTGRES_URL or the selected Postgres target first
 * - Writes generated summaries to TARGET_POSTGRES_URL or the same deployment by default
 *
 * Usage:
 *   node scripts/batch/batch-generate-summary.mjs --dry-run
 *   node scripts/batch/batch-generate-summary.mjs --all --concurrency=2
 *   TARGET_POSTGRES_URL=postgresql://localhost/dev-or-prod node scripts/batch/batch-generate-summary.mjs --substance=lsd
 */

import { createDataClient } from "../lib/data-client.ts";
import { api } from "../../lib/postgres/runtime/api.ts"
import { createBatchTargetRunContext, requireBatchArticleWriteToken } from "./lib/batch-targets.mjs";
import { assertDataOpsWriteAllowed } from "../lib/data-ops-run-context.mjs";
import { printBatchBanner, printBatchSummary, runBatchGenerator } from "./lib/generator-runner.mjs";
import { getArticleSlug } from "./summary/articles.mjs";
import { parseArgs, printHelp } from "./summary/cli.mjs";
import { CONFIG, INPUT_BOUNDS, PROJECT_ROOT } from "./summary/config.mjs";
import { loadEnvLocal } from "./summary/env.mjs";
import { processAll, processArticle, createOpenRouterCaller, createPersistSuccessfulUpdate } from "./summary/pipeline.mjs";
import {
  createRunArtifacts,
  updateProgress,
  writeBackup,
  writeDebugArtifact,
  writeFatalProgress,
} from "./summary/run-artifacts.mjs";
import {
  loadPromptFromSource,
  loadArticles,
  loadSummaryQuoteSlugs,
  loadArticleSourceSlugs,
  loadSummaryQuote,
  loadArticleSources,
} from "./summary/source-material.mjs";
import { selectArticles } from "./summary/articles.mjs";

loadEnvLocal(PROJECT_ROOT);
let activeRunArtifacts = null;

async function main(options) {
  CONFIG.reasoningEffort = options.reasoningEffort || CONFIG.reasoningEffort;

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey && !options.dryRun) {
    console.error("Error: OPENROUTER_API_KEY environment variable is required");
    process.exit(1);
  }

  const adminKey = options.dryRun ? null : requireBatchArticleWriteToken();
  if (!adminKey && !options.dryRun) {
    console.error("Error: DATA_ADMIN_KEY environment variable is required");
    process.exit(1);
  }

  const targetContext = createBatchTargetRunContext({
    operation: "batch summary generation",
    argv: process.argv.slice(2),
  });
  const sourceUrl = targetContext.sourceUrl;
  const targetUrl = targetContext.targetUrl;
  if (!sourceUrl) {
    console.error("Error: No source Postgres URL configured");
    process.exit(1);
  }
  if (!targetUrl) {
    console.error("Error: No target Postgres URL configured");
    process.exit(1);
  }

  const runArtifacts = createRunArtifacts(options, sourceUrl, targetUrl, CONFIG);
  activeRunArtifacts = runArtifacts;
  const sourceClient = createDataClient({ target: sourceUrl }).client;
  const targetClient = createDataClient({ target: targetUrl }).client;

  printBatchBanner({
    title: "Batch Summary Section Generation",
    config: CONFIG,
    options,
    details: [
      { label: "Source Postgres", value: postgresFingerprintFromUrl(sourceUrl) },
      { label: "Target Postgres", value: postgresFingerprintFromUrl(targetUrl) },
    ],
  });

  console.log("\nLoading prompt from source Postgres...");
  const systemPrompt = await loadPromptFromSource(sourceClient, api);
  console.log(`  Prompt loaded: ${systemPrompt.length.toLocaleString()} chars`);

  console.log("\nLoading article and source availability...");
  const [sourceArticles, targetArticles, summaryQuoteSlugs, articleSourceSlugs] = await Promise.all([
    loadArticles(sourceClient, api),
    sourceUrl === targetUrl ? loadArticles(sourceClient, api) : loadArticles(targetClient, api),
    loadSummaryQuoteSlugs(sourceClient, api),
    loadArticleSourceSlugs(sourceClient, api),
  ]);

  const sourceArticlesBySlug = new Map(sourceArticles.map((article) => [getArticleSlug(article), article]));
  const targetArticlesBySlug = new Map(targetArticles.map((article) => [getArticleSlug(article), article]));

  console.log(`  Source articles loaded: ${sourceArticles.length}`);
  console.log(`  Target articles loaded: ${targetArticles.length}`);
  console.log(`  Summary quote docs: ${summaryQuoteSlugs.size}`);
  console.log(`  Article source docs: ${articleSourceSlugs.size}`);

  const availability = { summaryQuoteSlugs, articleSourceSlugs };
  const selection = selectArticles(sourceArticles, options, availability);
  const selectedArticles = selection.articles;

  console.log(`\nSelected articles: ${selectedArticles.length}`);
  console.log(`  Using summary quotes: ${selection.quotedCount}`);
  console.log(`  Using generic source fallback: ${selection.genericCount}`);
  if (selection.missingSourceCoverage > 0) {
    console.log(`  Excluded for missing source coverage: ${selection.missingSourceCoverage}`);
  }

  if (selectedArticles.length === 0) {
    console.log("\nNo articles to process.");
    updateProgress(runArtifacts, {
      runId: runArtifacts.runId,
      status: "completed",
      sourceIdentity: runArtifacts.sourceIdentity,
      targetIdentity: runArtifacts.targetIdentity,
      updatedAt: new Date().toISOString(),
      selectedCount: 0,
    });
    return;
  }

  if (options.dryRun) {
    console.log("\n[DRY RUN] Would process:");
    for (const article of selectedArticles.slice(0, 20)) {
      const slug = getArticleSlug(article);
      const sourceMaterial = summaryQuoteSlugs.has(slug) ? "quotes" : "generic_sources";
      console.log(`  - ${slug} (${sourceMaterial})`);
    }
    if (selectedArticles.length > 20) {
      console.log(`  ... and ${selectedArticles.length - 20} more`);
    }
    return;
  }

  assertDataOpsWriteAllowed(targetContext);

  const backupPath = writeBackup({
    runArtifacts,
    articles: selectedArticles,
    targetArticlesBySlug,
    sourceUrl,
    targetUrl,
    skipped: options.dryRun || options.skipBackup,
  });
  if (backupPath) {
    console.log(`\nBackup written: ${backupPath}`);
  }

  console.log(`\nProcessing ${selectedArticles.length} articles...\n`);
  const startedAt = Date.now();
  const callOpenRouter = createOpenRouterCaller({
    apiKey,
    config: CONFIG,
    writeDebugArtifact: (payload) => writeDebugArtifact({ ...payload, config: CONFIG }),
  });
  const persistSuccessfulUpdate = createPersistSuccessfulUpdate({
    adminKey,
    sourceArticlesBySlug,
    targetArticlesBySlug,
    targetClient,
  });

  const results = await processAll({
    articles: selectedArticles,
    availability,
    options,
    runArtifacts,
    loadSummaryQuoteForSlug: (slug) => loadSummaryQuote(sourceClient, api, slug),
    loadArticleSourcesForSlug: (slug) => loadArticleSources(sourceClient, api, slug),
    processArticleForEntry: (article) =>
      processArticle({
        article,
        availability,
        options,
        systemPrompt,
        loadSummaryQuoteForSlug: (slug) => loadSummaryQuote(sourceClient, api, slug),
        loadArticleSourcesForSlug: (slug) => loadArticleSources(sourceClient, api, slug),
        callOpenRouter,
        writeDebugArtifact: (payload) => writeDebugArtifact({ ...payload, config: CONFIG }),
      }),
    persistSuccessfulUpdate,
  });

  const duration = (Date.now() - startedAt) / 1000;

  printBatchSummary({
    results,
    durationSeconds: duration,
    artifacts: [
      { label: "Progress", path: runArtifacts.progressPath },
      { label: "Results", path: runArtifacts.resultsPath },
      backupPath ? { label: "Backup", path: backupPath } : null,
    ],
    failedItems: results.failedItems,
  });
}

await runBatchGenerator({
  parseOptions: () => parseArgs(CONFIG, INPUT_BOUNDS),
  printHelp,
  execute: main,
  handleFatal: async (error) => {
    writeFatalProgress(activeRunArtifacts, error);
  },
});
