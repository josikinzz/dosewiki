import { writeFileSync } from "fs";

import {
  copyLocalJsonBackup,
  createArticlePersistence,
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
import { loadDosageDurationQuotes } from "./loader.mjs";
import { buildUserMessage, getArticleSlug, mergeGeneratedWithExisting } from "./lib.mjs";
import { callOpenRouter, callWithRetry } from "./openrouter.mjs";
import { parseGeneratedYaml } from "./parser.mjs";

export function createBackup() {
  return copyLocalJsonBackup(CONFIG);
}

function writeProgress(state) { writeFileSync(CONFIG.progressFile, JSON.stringify(state, null, 2), "utf-8"); }

async function resolveDosageDurationSourceMaterial(article) { const slug = getArticleSlug(article);
return resolveQuoteSourceMaterial({
  slug,
  loadQuotes: loadDosageDurationQuotes,
  buildUserMessage: (quotes) => buildUserMessage(article, quotes),
  missingReason: "No dosage duration quotes file",
  emptyReason: "No dosage duration quotes file",
}); }

async function processArticle(apiKey, article, systemPrompt, options = {}) { const slug = getArticleSlug(article);

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
assertNoPublicProseArtifactLanguage(
  { slug, title: article.title, dosage: merged.dosage, duration: merged.duration },
  { sections: ["dosage", "duration"], sourcePath: `batch:dosage_duration:${slug}` },
);
assertNoPublicProseNamedSourceAttribution(
  { slug, title: article.title, dosage: merged.dosage, duration: merged.duration },
  { sections: ["dosage", "duration"], sourcePath: `batch:dosage_duration:${slug}` },
);

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
}; }

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
    postgresClient: context.postgresClient,
    sourceArticlesBySlug: new Map(context.allArticles.map((article) => [getArticleSlug(article), article])),
    targetArticlesBySlug: new Map(context.allArticles.map((article) => [getArticleSlug(article), article])),
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
        const slug = getArticleSlug(article);

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
              slug: result.slug,
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
  assertNoPublicProseArtifactLanguage(article, {
    sections: ["dosage", "duration"],
    sourcePath: `batch:dosage_duration:${update.slug || getArticleSlug(article)}`,
  });
  assertNoPublicProseNamedSourceAttribution(article, {
    sections: ["dosage", "duration"],
    sourcePath: `batch:dosage_duration:${update.slug || getArticleSlug(article)}`,
  });
  return article;
}
