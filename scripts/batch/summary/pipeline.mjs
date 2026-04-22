import { callOpenRouterChat } from "../../lib/openrouter-sdk.mjs";
import { api } from "../../../convex/_generated/api.js";
import { cloneJson, getArticleSlug, sanitizeObjectKeys } from "./articles.mjs";
import { CONFIG } from "./config.mjs";
import { parseGeneratedSummary } from "./parsing.mjs";
import {
  createSourceMaterialDescription,
  resolveSourceMaterial,
} from "./source-material.mjs";
import { appendResult, buildProgressSnapshot, updateProgress } from "./run-artifacts.mjs";

export function createOpenRouterCaller({ apiKey, config = CONFIG, writeDebugArtifact }) {
  return async function callOpenRouter(systemPrompt, userMessage, debugContext = null, options = {}) {
    const response = await callOpenRouterChat({
      apiKey,
      appTitle: "Dose.wiki Batch Summary Generator",
      model: config.model,
      systemPrompt,
      userMessage,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      reasoningEffort: options.reasoningEffort || config.reasoningEffort,
      disableReasoning: false,
    });

    if (!response.content.trim()) {
      writeDebugArtifact({
        slug: debugContext?.slug,
        suffix: "summary-openrouter-empty-content",
        payload: JSON.stringify(response.response, null, 2),
        metadata: {
          title: debugContext?.title,
          finishReason: response.finishReason,
        },
      });
    }

    return {
      content: response.content,
      usage: response.usage,
    };
  };
}

export async function callWithRetry(fn, attempts = CONFIG.retryAttempts, config = CONFIG, log = console.log) {
  let lastError;

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!error.retryable) throw error;

      const delay = config.retryDelayMs * Math.pow(2, attempt);
      log(`  Retry ${attempt + 1}/${attempts} after ${delay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

export function createPersistSuccessfulUpdate({
  adminKey,
  sourceArticlesBySlug,
  targetArticlesBySlug,
  targetClient,
}) {
  return async function persistSuccessfulUpdate(result) {
    const baseArticle = targetArticlesBySlug.get(result.slug) || sourceArticlesBySlug.get(result.slug);

    if (!baseArticle) {
      throw new Error(`No target/source base article found for slug ${result.slug}`);
    }

    const nextArticle = cloneJson(baseArticle);
    nextArticle.summary = result.summary;

    await targetClient.mutation(api.substanceIndex.saveSubstances, {
      apiKey: adminKey,
      articles: [sanitizeObjectKeys(nextArticle)],
    });

    targetArticlesBySlug.set(result.slug, nextArticle);
  };
}

export function createDryRunResult(article, availability) {
  const slug = getArticleSlug(article);
  const hasQuote = availability.summaryQuoteSlugs.has(slug);
  const hasSourceDoc = availability.articleSourceSlugs.has(slug);

  return {
    slug,
    title: article.title,
    status: hasQuote || hasSourceDoc ? "dry-run" : "would-skip",
    reason:
      hasQuote || hasSourceDoc
        ? null
        : "No summary quote doc or articleSources doc in source Convex",
    sourceMaterial: hasQuote ? "quotes" : hasSourceDoc ? "generic_sources" : null,
    tokens: 0,
  };
}

export async function processArticle({
  article,
  availability,
  options,
  systemPrompt,
  loadSummaryQuoteForSlug,
  loadArticleSourcesForSlug,
  callOpenRouter,
  writeDebugArtifact,
}) {
  const slug = getArticleSlug(article);
  const sourceMaterial = await resolveSourceMaterial({
    article,
    availability,
    loadSummaryQuoteForSlug,
    loadArticleSourcesForSlug,
  });

  if (sourceMaterial.status !== "ready") {
    return {
      slug,
      title: article.title,
      status: "skipped",
      reason: sourceMaterial.reason,
      tokens: 0,
    };
  }

  const result = await callWithRetry(
    () =>
      callOpenRouter(systemPrompt, sourceMaterial.userMessage, { slug, title: article.title }, options),
    CONFIG.retryAttempts,
    CONFIG,
  );

  const summary = parseGeneratedSummary(
    result.content,
    { slug, title: article.title },
    writeDebugArtifact,
  );

  return {
    slug,
    title: article.title,
    status: "success",
    summary,
    sourceMaterial: sourceMaterial.materialType,
    tokens: result.usage.totalTokens,
    promptTokens: result.usage.promptTokens,
    completionTokens: result.usage.completionTokens,
  };
}

export async function processAll({
  articles,
  availability,
  options,
  runArtifacts,
  processArticleForEntry,
  persistSuccessfulUpdate,
  log = console.log,
  errorLog = console.error,
  writeProgress = updateProgress,
  appendRunResult = appendResult,
}) {
  const { concurrency, verbose, dryRun } = options;

  let completed = 0;
  let failed = 0;
  let skipped = 0;
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  const failedItems = [];
  const startedAt = new Date().toISOString();

  writeProgress(
    runArtifacts,
    buildProgressSnapshot({
      runArtifacts,
      selectedCount: articles.length,
      completed,
      failed,
      skipped,
      totalPromptTokens,
      totalCompletionTokens,
      failedItems,
      startedAt,
      status: "running",
    }),
  );

  for (let i = 0; i < articles.length; i += concurrency) {
    const batch = articles.slice(i, i + concurrency);

    const results = await Promise.all(
      batch.map(async (article) => {
        const slug = getArticleSlug(article);

        if (verbose) {
          log(`  Processing: ${slug}`);
        }

        if (dryRun) {
          return createDryRunResult(article, availability);
        }

        try {
          return await processArticleForEntry(article);
        } catch (error) {
          errorLog(`  Failed: ${slug} - ${error.message}`);
          return {
            slug,
            title: article.title,
            status: "failed",
            error: error.message,
          };
        }
      }),
    );

    for (const result of results) {
      if (result.status === "success") {
        try {
          await persistSuccessfulUpdate(result);
          completed++;
          totalPromptTokens += result.promptTokens;
          totalCompletionTokens += result.completionTokens;
          appendRunResult(runArtifacts, {
            status: "success",
            slug: result.slug,
            title: result.title,
            sourceMaterial: result.sourceMaterial,
            promptTokens: result.promptTokens,
            completionTokens: result.completionTokens,
            totalTokens: result.tokens,
            summary: result.summary,
          });
          if (verbose) {
            log(
              `  Saved: ${result.slug} (${createSourceMaterialDescription(result.sourceMaterial)}, ${result.tokens} tokens)`,
            );
          }
        } catch (error) {
          failed++;
          failedItems.push({ slug: result.slug, title: result.title, error: error.message });
          appendRunResult(runArtifacts, {
            status: "persist_failed",
            slug: result.slug,
            title: result.title,
            error: error.message,
          });
          errorLog(`  Failed to persist: ${result.slug} - ${error.message}`);
        }
      } else if (result.status === "dry-run") {
        completed++;
      } else if (result.status === "skipped" || result.status === "would-skip") {
        skipped++;
        appendRunResult(runArtifacts, {
          status: result.status,
          slug: result.slug,
          title: result.title,
          sourceMaterial: result.sourceMaterial ?? null,
          reason: result.reason,
        });
      } else if (result.status === "failed") {
        failed++;
        failedItems.push({ slug: result.slug, title: result.title, error: result.error });
        appendRunResult(runArtifacts, {
          status: "failed",
          slug: result.slug,
          title: result.title,
          error: result.error,
        });
      }
    }

    const done = completed + failed + skipped;
    process.stdout.write(
      `\rProgress: ${done}/${articles.length} (${completed} ok, ${failed} failed, ${skipped} skipped)`,
    );

    writeProgress(
      runArtifacts,
      buildProgressSnapshot({
        runArtifacts,
        selectedCount: articles.length,
        completed,
        failed,
        skipped,
        totalPromptTokens,
        totalCompletionTokens,
        failedItems,
        startedAt,
        currentSlug: batch[batch.length - 1] ? getArticleSlug(batch[batch.length - 1]) : null,
        status: "running",
      }),
    );
  }

  log("");

  const finalProgress = buildProgressSnapshot({
    runArtifacts,
    selectedCount: articles.length,
    completed,
    failed,
    skipped,
    totalPromptTokens,
    totalCompletionTokens,
    failedItems,
    startedAt,
    status: "completed",
  });
  writeProgress(runArtifacts, finalProgress);

  return {
    completed,
    failed,
    skipped,
    totalPromptTokens,
    totalCompletionTokens,
    failedItems,
  };
}
