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
import { buildUserMessage, parseGeneratedYaml, titleToSlug } from "./lib.mjs";
import { loadToleranceQuotes } from "./loader.mjs";
import { callOpenRouter, callWithRetry } from "./openrouter.mjs";

export function createBackup() {
  return copyLocalJsonBackup(CONFIG);
}

async function resolveToleranceSourceMaterial(article) {
  const slug = titleToSlug(article.title);
  return resolveQuoteSourceMaterial({
    slug,
    loadQuotes: loadToleranceQuotes,
    buildUserMessage: (quotes) => buildUserMessage(article, quotes),
    missingReason: "No tolerance quotes in Postgres",
    emptyReason: "No tolerance quotes in Postgres",
  });
}

async function processArticle(apiKey, article, systemPrompt, verbose) {
  const slug = titleToSlug(article.title);
  const sourceMaterial = await resolveToleranceSourceMaterial(article);
  if (sourceMaterial.status !== "ready") {
    return { slug, status: "skipped", reason: sourceMaterial.reason, tokens: 0 };
  }

  const result = await callWithRetry(() => callOpenRouter(apiKey, systemPrompt, sourceMaterial.userMessage));
  const tolerance = parseGeneratedYaml(result.content);
  assertNoPublicProseArtifactLanguage(
    { slug, title: article.title, tolerance },
    { sections: ["tolerance"], sourcePath: `batch:tolerance:${slug}` },
  );
  assertNoPublicProseNamedSourceAttribution(
    { slug, title: article.title, tolerance },
    { sections: ["tolerance"], sourcePath: `batch:tolerance:${slug}` },
  );

  if (verbose) {
    console.log(`  Generated tolerance for ${slug}:`);
    console.log(`    full_tolerance: ${tolerance.full_tolerance ? "yes" : "no"}`);
    console.log(`    half_tolerance: ${tolerance.half_tolerance ? "yes" : "no"}`);
    console.log(`    baseline_tolerance: ${tolerance.baseline_tolerance ? "yes" : "no"}`);
    console.log(`    cross_tolerance entries: ${tolerance.cross_tolerance.length}`);
  }

  return {
    slug,
    status: "success",
    tolerance,
    tokens: result.usage.totalTokens,
    promptTokens: result.usage.promptTokens,
    completionTokens: result.usage.completionTokens,
  };
}

function applyToleranceUpdate(article, update) {
  article.tolerance = update.tolerance;
  assertNoPublicProseArtifactLanguage(article, {
    sections: ["tolerance"],
    sourcePath: `batch:tolerance:${update.slug || titleToSlug(article.title)}`,
  });
  assertNoPublicProseNamedSourceAttribution(article, {
    sections: ["tolerance"],
    sourcePath: `batch:tolerance:${update.slug || titleToSlug(article.title)}`,
  });
  return article;
}

function createTolerancePersistence({ adminKey, postgresClient, sourceArticlesBySlug, targetArticlesBySlug }) {
  return createArticlePersistence({
    adminKey,
    postgresClient,
    sourceArticlesBySlug,
    targetArticlesBySlug,
    applyUpdate: applyToleranceUpdate,
  });
}

export async function processAll(apiKey, articles, systemPrompt, options, persistenceContext) {
  const { concurrency, verbose, dryRun } = options;
  const persistSuccessfulUpdate = createTolerancePersistence(persistenceContext);
  let completed = 0;
  let failed = 0;
  let skipped = 0;
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  const failedItems = [];
  const successfulUpdates = [];
  const total = articles.length;

  for (let index = 0; index < articles.length; index += concurrency) {
    const batch = articles.slice(index, index + concurrency);
    const results = await Promise.all(
      batch.map(async (article) => {
        const slug = titleToSlug(article.title);
        if (verbose) {
          console.log(`  Processing: ${article.title}`);
        }

        if (dryRun) {
          const sourceMaterial = await resolveToleranceSourceMaterial(article);
          return createDryRunResultFromSourceMaterial(sourceMaterial, article.title);
        }

        try {
          const result = await processArticle(apiKey, article, systemPrompt, verbose);
          if (result.status === "success") {
            totalPromptTokens += result.promptTokens;
            totalCompletionTokens += result.completionTokens;
            successfulUpdates.push({ title: article.title, slug, tolerance: result.tolerance });
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
        try {
          await persistSuccessfulUpdate(result);
          completed += 1;
        } catch (error) {
          failed += 1;
          failedItems.push({ slug: result.slug, title: result.title, error: error.message });
          console.error(`  Failed to persist: ${result.slug} - ${error.message}`);
        }
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
  }

  console.log();
  return { completed, failed, skipped, totalPromptTokens, totalCompletionTokens, failedItems, successfulUpdates };
}
