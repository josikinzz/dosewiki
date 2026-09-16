import { writeFileSync } from "fs";

import {
  applySuccessfulUpdates,
  copyLocalJsonBackup,
} from "../lib/persistence-artifacts.mjs";
import {
  assertNoPublicProseArtifactLanguage,
  assertNoPublicProseNamedSourceAttribution,
} from "../../analyze/public-prose-artifact-language-core.mjs";
import {
  createDryRunResultFromSourceMaterial,
  resolveQuoteSourceMaterial,
} from "../lib/source-material-resolver.mjs";
import { CONFIG } from "./cli.mjs";
import { loadHistoryCultureQuotes } from "./loader.mjs";
import { buildUserMessage, getArticleSlug, parseGeneratedYaml } from "./lib.mjs";
import { callOpenRouter, callWithRetry } from "./openrouter.mjs";

export function createBackup() {
  return copyLocalJsonBackup(CONFIG);
}

function writeProgress(state) {
  writeFileSync(CONFIG.progressFile, JSON.stringify(state, null, 2), "utf-8");
}

async function resolveHistoryCultureSourceMaterial(article) { const slug = getArticleSlug(article);
return resolveQuoteSourceMaterial({
  slug,
  loadQuotes: loadHistoryCultureQuotes,
  buildUserMessage: (quotes) => buildUserMessage(article, quotes),
  missingReason: "No history culture quotes in Postgres",
  emptyReason: "No history culture quotes in Postgres",
}); }

async function processArticle(apiKey, article, systemPrompt, verbose) {
  const slug = getArticleSlug(article);
  const sourceMaterial = await resolveHistoryCultureSourceMaterial(article);
  if (sourceMaterial.status !== "ready") {
    return { slug, status: "skipped", reason: sourceMaterial.reason, tokens: 0 };
  }

  const result = await callWithRetry(() => callOpenRouter(apiKey, systemPrompt, sourceMaterial.userMessage));
  const historyCulture = parseGeneratedYaml(result.content);
  assertNoPublicProseArtifactLanguage(
    { slug, title: article.title, history_culture: historyCulture },
    { sections: ["history_culture"], sourcePath: `batch:history_culture:${slug}` },
  );
  assertNoPublicProseNamedSourceAttribution(
    { slug, title: article.title, history_culture: historyCulture },
    { sections: ["history_culture"], sourcePath: `batch:history_culture:${slug}` },
  );

  if (verbose) {
    console.log(`  Generated history_culture for ${slug}:`);
    console.log(`    content: ${historyCulture.content ? "yes" : "no"}`);
    console.log(`    sections: ${historyCulture.sections?.length || 0}`);
  }

  return {
    slug,
    status: "success",
    history_culture: historyCulture,
    tokens: result.usage.totalTokens,
    promptTokens: result.usage.promptTokens,
    completionTokens: result.usage.completionTokens,
  };
}

export async function processAll(apiKey, articles, systemPrompt, options) {
  const { concurrency, verbose, dryRun } = options;
  let completed = 0;
  let failed = 0;
  let skipped = 0;
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  const failedItems = [];
  const successfulUpdates = [];
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
        const slug = getArticleSlug(article);
        if (verbose) {
          console.log(`  Processing: ${article.title}`);
        }

        if (dryRun) {
          const sourceMaterial = await resolveHistoryCultureSourceMaterial(article);
          return createDryRunResultFromSourceMaterial(sourceMaterial, article.title);
        }

        try {
          const result = await processArticle(apiKey, article, systemPrompt, verbose);
          if (result.status === "success") {
            totalPromptTokens += result.promptTokens;
            totalCompletionTokens += result.completionTokens;
            successfulUpdates.push({ title: article.title, slug: result.slug, history_culture: result.history_culture });
          }
          return { ...result, title: article.title };
        } catch (error) {
          console.error(`  Failed: ${slug} - ${error.message}`);
          return { slug, title: article.title, status: "failed", error: error.message };
        }
      }),
    );

    for (const result of results) {
      if (result.status === "success" || result.status === "dry-run") completed += 1;
      else if (result.status === "skipped" || result.status === "would-skip") skipped += 1;
      else {
        failed += 1;
        failedItems.push({ slug: result.slug, title: result.title, error: result.error });
      }
    }

    const done = completed + failed + skipped;
    process.stdout.write(`\rProgress: ${done}/${total} (${completed} ok, ${failed} failed, ${skipped} skipped)`);
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

  return { completed, failed, skipped, totalPromptTokens, totalCompletionTokens, failedItems, successfulUpdates };
}

export function applyHistoryCultureUpdate(article, update) {
  article.history_culture = update.history_culture;
  assertNoPublicProseArtifactLanguage(article, {
    sections: ["history_culture"],
    sourcePath: `batch:history_culture:${update.slug || getArticleSlug(article)}`,
  });
  assertNoPublicProseNamedSourceAttribution(article, {
    sections: ["history_culture"],
    sourcePath: `batch:history_culture:${update.slug || getArticleSlug(article)}`,
  });
  return article;
}

export async function applyAndSyncUpdates(results, allArticles, postgresClient, adminKey) {
  return applySuccessfulUpdates({
    results,
    allArticles,
    postgresClient,
    adminKey,
    applyUpdate: applyHistoryCultureUpdate,
  });
}
