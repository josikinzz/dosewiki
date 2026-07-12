#!/usr/bin/env node

import {
  assertDataOpsWriteAllowed,
  createDataOpsRunContext,
  getFlagValue,
  requireAdminIntentToken,
  requireSourceUrl,
  requireTargetUrl,
} from "../lib/data-ops-run-context.mjs";
import { printBatchSummary } from "./lib/generator-runner.mjs";
import { CONFIG, parseArgs, printHelp } from "./extract-quotes/cli.mjs";
import { CATEGORIES } from "./extract-quotes/categories.mjs";
import {
  createConvexClient,
  getConfiguredOutputFiles,
  getConvexArticleSourceSize,
  getPrioritySlugs,
  getSourceFileSize,
  findLargeFiles,
  loadExistingQuoteSlugs,
  loadConvexArticleSourceSlugs,
  loadPrompt,
} from "./extract-quotes/loader.mjs";
import { outputExists } from "./extract-quotes/formatter.mjs";
import { processAll } from "./extract-quotes/runner.mjs";

const VALID_SOURCE_MODES = new Set(["local", "convex"]);
const VALID_SAVE_MODES = new Set(["local", "convex"]);

function createQuoteExtractionRunContext(options) {
  const argv = process.argv.slice(2);
  const sourceUrlFlag = getFlagValue(argv, "--source-url");
  const targetUrlFlag = getFlagValue(argv, "--target-url");
  const envWithCliOverrides = {
    ...process.env,
    ...(sourceUrlFlag ? { SOURCE_CONVEX_URL: sourceUrlFlag } : {}),
    ...(targetUrlFlag ? { TARGET_CONVEX_URL: targetUrlFlag } : {}),
  };

  return createDataOpsRunContext({
    operation: "batch quote extraction",
    intent: "quoteMigrationWrite",
    argv,
    env: envWithCliOverrides,
    selectedTables: [
      options.source === "convex" ? "articleSources" : null,
      options.save === "convex" ? "quotes" : null,
    ].filter(Boolean),
    localArtifacts: options.save === "local" ? ["quotes"] : [],
  });
}

function requireValidModes(options) {
  if (!VALID_SOURCE_MODES.has(options.source)) {
    throw new Error(`Invalid --source=${options.source}. Expected local or convex.`);
  }
  if (!VALID_SAVE_MODES.has(options.save)) {
    throw new Error(`Invalid --save=${options.save}. Expected local or convex.`);
  }
}

async function selectSlugs(options, category, context) {
  let sourceClient = null;
  if (options.source === "convex") {
    sourceClient = createConvexClient(requireSourceUrl(context, "quote extraction source Convex URL"));
  }

  let slugs = options.slugs ?? (
    options.source === "convex"
      ? await loadConvexArticleSourceSlugs(sourceClient)
      : getPrioritySlugs()
  );
  const summary = {
    alreadyDone: 0,
    largeFiles: [],
  };

  if (options.save === "convex" && !options.overwrite) {
    const targetClient = createConvexClient(requireTargetUrl(context, "quote extraction target Convex URL"));
    const existingSlugs = await loadExistingQuoteSlugs(targetClient, category);
    summary.alreadyDone = slugs.filter((slug) => existingSlugs.has(slug)).length;
    slugs = slugs.filter((slug) => !existingSlugs.has(slug));
  } else if (options.resume) {
    const existingOutputs = getConfiguredOutputFiles(category);
    const config = CATEGORIES[category];
    const expectedName = (slug) => `${slug}${config.outputSuffix}`;
    summary.alreadyDone = slugs.filter((slug) => existingOutputs.has(expectedName(slug))).length;
    slugs = slugs.filter((slug) => !existingOutputs.has(expectedName(slug)));
  }

  if (options.limit && slugs.length > options.limit) {
    slugs = slugs.slice(0, options.limit);
  }

  summary.largeFiles = options.source === "local" ? findLargeFiles(slugs) : [];
  return { slugs, summary, sourceClient };
}

async function getDryRunSize(slug, options, sourceClient) {
  if (options.source === "convex") {
    const size = await getConvexArticleSourceSize(sourceClient, slug);
    return size > 0 ? ` (${Math.round(size / 1024)}KB convex source)` : " (no Convex source)";
  }

  const size = getSourceFileSize(slug);
  return size > 0 ? ` (${Math.round(size / 1024)}KB)` : " (no file)";
}

async function main() {
  const options = parseArgs();
  requireValidModes(options);
  CONFIG.reasoningEffort = options.reasoningEffort;

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
  const context = createQuoteExtractionRunContext(options);
  const sourceClient = options.source === "convex"
    ? createConvexClient(requireSourceUrl(context, "quote extraction source Convex URL"))
    : null;
  const targetClient = options.save === "convex"
    ? createConvexClient(requireTargetUrl(context, "quote extraction target Convex URL"))
    : null;
  const adminKey = options.save === "convex" && !options.dryRun
    ? requireAdminIntentToken("quoteMigrationWrite").token
    : null;

  if (options.save === "convex" && !adminKey && !options.dryRun) {
    console.error("Error: CONVEX_ADMIN_TOKEN_QUOTE_MIGRATION_WRITE or CONVEX_ADMIN_KEY is required for Convex quote saves");
    process.exit(1);
  }

  console.log(`\nBatch Quote Extraction: ${category}`);
  console.log("=".repeat(50));
  console.log(`Loading prompt from: ${config.promptFile}`);
  console.log(`Model: ${CONFIG.model}`);
  console.log(`Reasoning Effort: ${CONFIG.reasoningEffort}`);
  console.log(`Source mode: ${options.source}`);
  console.log(`Save mode: ${options.save}`);
  if (sourceClient) console.log(`Source Convex: ${context.sourceUrl}`);
  if (targetClient) console.log(`Target Convex: ${context.targetUrl}`);
  const systemPrompt = loadPrompt(category);

  const { slugs, summary } = await selectSlugs(options, category, context);
  if (options.slugs) {
    console.log(`Processing specific slugs: ${slugs.length}`);
  } else {
    const defaultScopeCount = options.source === "convex" ? slugs.length : getPrioritySlugs().length;
    console.log(`${options.source === "convex" ? "Convex articleSource substances" : "Priority substances (high/normal)"}: ${defaultScopeCount}`);
  }
  if (options.resume || (options.save === "convex" && !options.overwrite)) {
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
      console.log(`  - ${slug}${await getDryRunSize(slug, options, sourceClient)}`);
    }
    if (slugs.length > 20) {
      console.log(`  ... and ${slugs.length - 20} more`);
    }
    return;
  }

  if (options.save === "convex") {
    assertDataOpsWriteAllowed(context);
  }

  const mode = options.sequential ? "sequential" : `${options.concurrency} concurrent`;
  console.log(`\nProcessing ${slugs.length} items (${mode})...`);
  console.log(`Output: ${options.save === "convex" ? `Convex quotes/${config.section}` : `${config.outputDir}/`}\n`);

  const startTime = Date.now();
  const results = await processAll(apiKey, slugs, category, systemPrompt, {
    ...options,
    sourceClient,
    targetClient,
    adminKey,
  });
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
