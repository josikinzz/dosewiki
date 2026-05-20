import { writeFileSync } from "fs";

import {
  copyLocalJsonBackup,
  createArticlePersistence,
  writeLocalJsonExport,
} from "../lib/persistence-artifacts.mjs";
import {
  createDryRunResultFromSourceMaterial,
  resolveQuoteSourceMaterial,
} from "../lib/source-material-resolver.mjs";
import { CONFIG } from "./cli.mjs";
import { loadDosageDurationQuotes } from "./loader.mjs";
import { buildUserMessage, mergeGeneratedWithExisting, titleToSlug } from "./lib.mjs";
import { callOpenRouter, callWithRetry } from "./openrouter.mjs";
import { parseGeneratedYaml } from "./parser.mjs";

export function saveArticles(articles) {
  writeLocalJsonExport({ articles, articlesFile: CONFIG.articlesFile });
}

export function createBackup() {
  return copyLocalJsonBackup(CONFIG);
}

export function writeProgress(state) {
  writeFileSync(CONFIG.progressFile, JSON.stringify(state, null, 2), "utf-8");
}

export async function resolveDosageDurationSourceMaterial(article) {
  const slug = titleToSlug(article.title);
  return resolveQuoteSourceMaterial({
    slug,
    loadQuotes: loadDosageDurationQuotes,
    buildUserMessage: (quotes) => buildUserMessage(article, quotes),
    missingReason: "No dosage duration quotes file",
    emptyReason: "No dosage duration quotes file",
  });
}

export async function processArticle(apiKey, article, systemPrompt, options = {}) {
  const slug = titleToSlug(article.title);

  if (CONFIG.skipArticles.includes(slug)) {
    return { slug, status: "skipped", reason: "Manually curated - skip", tokens: 0 };
  }

  const sourceMaterial = await resolveDosageDurationSourceMaterial(article);
  if (sourceMaterial.status !== "ready") {
    return { slug, status: "skipped", reason: sourceMaterial.reason, tokens: 0 };
  }

  const result = await callWithRetry(() =>
    callOpenRouter(apiKey, systemPrompt, sourceMaterial.userMessage),
  );

  const generated = parseGeneratedYaml(result.content);
  const merged = mergeGeneratedWithExisting(article, generated.dosage, generated.duration, options.logger);

  if (options.verbose) {
    console.log(`  Generated dosage/duration for ${slug}:`);
    console.log(`    dosage routes: ${merged.dosage.routes.length}`);
    console.log(`    duration routes: ${merged.duration.routes.length}`);
    console.log(`    plateau_dosing: ${merged.dosage.plateau_dosing ? "yes" : "no"}`);
  }

  return {
    slug,
    status: "success",
    dosage: merged.dosage,
    duration: merged.duration,
    tokens: result.usage.totalTokens,
    promptTokens: result.usage.promptTokens,
    completionTokens: result.usage.completionTokens,
  };
}

export async function processAll(apiKey, articles, systemPrompt, options, context) {
  const { concurrency, verbose, dryRun } = options;
  let completed = 0;
  let failed = 0;
  let skipped = 0;
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  const failedItems = [];
  const successfulUpdates = [];
  const persistSuccessfulUpdate = createArticlePersistence({
    adminKey: context.adminKey,
    convexClient: context.convexClient,
    sourceArticlesBySlug: new Map(context.allArticles.map((article) => [titleToSlug(article.title), article])),
    targetArticlesBySlug: new Map(context.allArticles.map((article) => [titleToSlug(article.title), article])),
    localArticles: context.allArticles,
    localArticlesByTitle: context.articlesMap,
    articlesFile: CONFIG.articlesFile,
    updateLocalJson: Boolean(options.updateLocalJson),
    applyUpdate: applyDosageDurationUpdate,
  });
  const total = articles.length;
  const startTime = new Date().toISOString();

  writeProgress({
    status: "running",
    current: 0,
    total,
    completed: 0,
    failed: 0,
    skipped: 0,
    currentBatch: [],
    startTime,
    inputTokens: 0,
    outputTokens: 0,
  });

  for (let index = 0; index < articles.length; index += concurrency) {
    const batch = articles.slice(index, index + concurrency);
    writeProgress({
      status: "running",
      current: completed + failed + skipped,
      total,
      completed,
      failed,
      skipped,
      currentBatch: batch.map((article) => article.title),
      startTime,
      inputTokens: totalPromptTokens,
      outputTokens: totalCompletionTokens,
    });

    const results = await Promise.all(
      batch.map(async (article) => {
        const slug = titleToSlug(article.title);

        if (verbose) {
          console.log(`  Processing: ${article.title}`);
        }

        if (dryRun) {
          const sourceMaterial = await resolveDosageDurationSourceMaterial(article);
          return createDryRunResultFromSourceMaterial(sourceMaterial, article.title);
        }

        try {
          const result = await processArticle(apiKey, article, systemPrompt, { verbose, logger: console });
          if (result.status === "success") {
            totalPromptTokens += result.promptTokens;
            totalCompletionTokens += result.completionTokens;
            successfulUpdates.push({
              title: article.title,
              dosage: result.dosage,
              duration: result.duration,
            });
          }
          return { ...result, title: article.title };
        } catch (error) {
          console.error(`  Failed: ${slug} - ${error.message}`);
          return { slug, title: article.title, status: "failed", error: error.message };
        }
      }),
    );

    for (const result of results) {
      if (result.status === "success") {
        completed += 1;
      } else if (result.status === "dry-run") {
        completed += 1;
      } else if (result.status === "skipped" || result.status === "would-skip") {
        skipped += 1;
      } else {
        failed += 1;
        failedItems.push({ slug: result.slug, title: result.title, error: result.error || result.reason });
      }
    }

    const done = completed + failed + skipped;
    process.stdout.write(`\rProgress: ${done}/${total} (${completed} ok, ${failed} failed, ${skipped} skipped)`);

    if (!dryRun) {
      await Promise.all(results.filter((result) => result.status === "success").map(persistSuccessfulUpdate));
    }

    writeProgress({
      status: "running",
      current: done,
      total,
      completed,
      failed,
      skipped,
      currentBatch: [],
      startTime,
      inputTokens: totalPromptTokens,
      outputTokens: totalCompletionTokens,
    });
  }

  console.log();

  writeProgress({
    status: failed > 0 && completed === 0 ? "failed" : "completed",
    current: total,
    total,
    completed,
    failed,
    skipped,
    currentBatch: [],
    startTime,
    inputTokens: totalPromptTokens,
    outputTokens: totalCompletionTokens,
  });

  return {
    completed,
    failed,
    skipped,
    totalPromptTokens,
    totalCompletionTokens,
    failedItems,
    successfulUpdates,
  };
}

export function applyDosageDurationUpdate(article, update) {
  article.dosage = update.dosage;
  article.duration = update.duration;
  return article;
}
