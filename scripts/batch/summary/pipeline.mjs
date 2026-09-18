import { callWithRetry as callBatchOpenRouterWithRetry } from "../lib/openrouter-adapter.mjs";
import { runBatchLifecycle } from "../lib/generator-runner.mjs";
import { createArticlePersistence } from "../lib/persistence-artifacts.mjs";
import { createDryRunResultFromSourceMaterial } from "../lib/source-material-resolver.mjs";
import { getArticleSlug } from "./articles.mjs";
import { CONFIG } from "./config.mjs";
import { parseGeneratedSummary } from "./parsing.mjs";
import {
  createSourceMaterialDescription,
  resolveSourceMaterial,
} from "./source-material.mjs";
import { appendResult, buildProgressSnapshot, updateProgress } from "./run-artifacts.mjs";

export { createOpenRouterCaller } from "./openrouter.mjs";

async function callWithRetry(fn, attempts = CONFIG.retryAttempts, config = CONFIG, log = console.log) {
  return callBatchOpenRouterWithRetry(fn, {
    attempts,
    retryDelayMs: config.retryDelayMs,
    log,
  });
}

export function createPersistSuccessfulUpdate({
  adminKey,
  sourceArticlesBySlug,
  targetArticlesBySlug,
  targetClient,
}) {
  return createArticlePersistence({
    adminKey,
    sourceArticlesBySlug,
    targetArticlesBySlug,
    postgresClient: targetClient,
    applyUpdate: applySummaryUpdate,
  });
}

export function applySummaryUpdate(article, result) {
  article.summary = result.summary;
  return article;
}

async function createDryRunResult(
  article,
  availability,
  loadSummaryQuoteForSlug,
  loadArticleSourcesForSlug,
) {
  const sourceMaterial = await resolveSourceMaterial({
    article,
    availability,
    loadSummaryQuoteForSlug,
    loadArticleSourcesForSlug,
  });
  return createDryRunResultFromSourceMaterial(sourceMaterial, article.title);
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
  loadSummaryQuoteForSlug,
  loadArticleSourcesForSlug,
  persistSuccessfulUpdate,
  log = console.log,
  errorLog = console.error,
  writeProgress = updateProgress,
  appendRunResult = appendResult,
}) {
  return runBatchLifecycle({
    items: articles,
    options,
    getItemSlug: getArticleSlug,
    getItemLabel: getArticleSlug,
    getItemTitle: (article) => article.title,
    createDryRunResult: (article) =>
      createDryRunResult(
        article,
        availability,
        loadSummaryQuoteForSlug,
        loadArticleSourcesForSlug,
      ),
    processItem: processArticleForEntry,
    persistSuccessfulResult: persistSuccessfulUpdate,
    log,
    errorLog,
    onResult: (result) => {
      if (result.status === "success") {
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
        if (options.verbose) {
          log(
            `  Saved: ${result.slug} (${createSourceMaterialDescription(result.sourceMaterial)}, ${result.tokens} tokens)`,
          );
        }
      } else if (result.status === "skipped" || result.status === "would-skip") {
        appendRunResult(runArtifacts, {
          status: result.status,
          slug: result.slug,
          title: result.title,
          sourceMaterial: result.sourceMaterial ?? null,
          reason: result.reason,
        });
      } else if (result.status === "failed" || result.status === "persist_failed") {
        appendRunResult(runArtifacts, {
          status: result.status,
          slug: result.slug,
          title: result.title,
          error: result.error,
        });
      }
    },
    onProgress: (state) => {
      writeProgress(
        runArtifacts,
        buildProgressSnapshot({
          runArtifacts,
          selectedCount: articles.length,
          completed: state.completed,
          failed: state.failed,
          skipped: state.skipped,
          totalPromptTokens: state.totalPromptTokens,
          totalCompletionTokens: state.totalCompletionTokens,
          failedItems: state.failedItems,
          startedAt: state.startedAt,
          currentSlug: state.currentSlug,
          status: state.status,
        }),
      );
    },
  });
}
