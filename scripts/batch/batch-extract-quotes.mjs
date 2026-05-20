#!/usr/bin/env node

import { printBatchSummary } from "./lib/generator-runner.mjs";
import { CONFIG, parseArgs, printHelp } from "./extract-quotes/cli.mjs";
import { CATEGORIES } from "./extract-quotes/categories.mjs";
import { getConfiguredOutputFiles, getPrioritySlugs, getSourceFileSize, findLargeFiles, loadPrompt } from "./extract-quotes/loader.mjs";
import { outputExists } from "./extract-quotes/formatter.mjs";
import { processAll } from "./extract-quotes/runner.mjs";

function selectSlugs(options, category) {
  let slugs = options.slugs ?? getPrioritySlugs();
  const summary = {
    alreadyDone: 0,
    largeFiles: [],
  };

  if (options.resume) {
    const existingOutputs = getConfiguredOutputFiles(category);
    const config = CATEGORIES[category];
    const expectedName = (slug) => `${slug}${config.outputSuffix}`;
    summary.alreadyDone = slugs.filter((slug) => existingOutputs.has(expectedName(slug))).length;
    slugs = slugs.filter((slug) => !existingOutputs.has(expectedName(slug)));
  }

  if (options.limit && slugs.length > options.limit) {
    slugs = slugs.slice(0, options.limit);
  }

  summary.largeFiles = findLargeFiles(slugs);
  return { slugs, summary };
}

async function main() {
  const options = parseArgs();

  if (!options.category || !CATEGORIES[options.category]) {
    console.error("Error: --category is required. Valid options: legality, tolerance, subjective-effects, intro-text");
    process.exit(1);
  }

  if (options.sequential) {
    options.concurrency = 1;
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey && !options.dryRun) {
    console.error("Error: OPENROUTER_API_KEY environment variable is required");
    process.exit(1);
  }

  const category = options.category;
  const config = CATEGORIES[category];

  console.log(`\nBatch Quote Extraction: ${category}`);
  console.log("=".repeat(50));
  console.log(`Loading prompt from: ${config.promptFile}`);
  const systemPrompt = loadPrompt(category);

  const { slugs, summary } = selectSlugs(options, category);
  if (options.slugs) {
    console.log(`Processing specific slugs: ${slugs.length}`);
  } else {
    console.log(`Priority substances (high/normal): ${getPrioritySlugs().length}`);
  }
  if (options.resume) {
    console.log(`Already completed: ${summary.alreadyDone}`);
    console.log(`Remaining to process: ${slugs.length}`);
  }
  if (options.limit) {
    console.log(`Limited to: ${slugs.length} items`);
  }

  if (slugs.length === 0) {
    console.log("\nNo substances to process. All done!");
    return;
  }

  if (summary.largeFiles.length > 0 && options.verbose) {
    console.log(`\nLarge files detected (>${Math.round(CONFIG.largeFileThreshold / 1024)}KB):`);
    for (const file of summary.largeFiles.slice(0, 5)) {
      console.log(`  - ${file.slug}: ${file.size}KB`);
    }
    if (summary.largeFiles.length > 5) {
      console.log(`  ... and ${summary.largeFiles.length - 5} more`);
    }
    console.log(`Consider using --sequential for these files.\n`);
  }

  if (options.dryRun) {
    console.log("\n[DRY RUN] Would process:");
    for (const slug of slugs.slice(0, 20)) {
      const size = getSourceFileSize(slug);
      const sizeStr = size > 0 ? ` (${Math.round(size / 1024)}KB)` : " (no file)";
      console.log(`  - ${slug}${sizeStr}`);
    }
    if (slugs.length > 20) {
      console.log(`  ... and ${slugs.length - 20} more`);
    }
    return;
  }

  const mode = options.sequential ? "sequential" : `${options.concurrency} concurrent`;
  console.log(`\nProcessing ${slugs.length} items (${mode})...`);
  console.log(`Output: ${config.outputDir}/\n`);

  const startTime = Date.now();
  const results = await processAll(apiKey, slugs, category, systemPrompt, options);
  const duration = (Date.now() - startTime) / 1000;

  printBatchSummary({
    results,
    durationSeconds: duration,
    failedItems: results.failedItems,
  });

  console.log(`\n[JSON]`);
  console.log(JSON.stringify({
    category,
    successful: results.completed,
    failed: results.failed,
    skipped: results.skipped,
    tokens: { input: results.totalPromptTokens, output: results.totalCompletionTokens },
    duration,
    failedItems: results.failedItems,
  }, null, 2));
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
