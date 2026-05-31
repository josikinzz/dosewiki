import { appendFileSync, copyFileSync, existsSync, mkdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";

import { api } from "../../../convex/_generated/api.js";
import { cloneJson, getArticleSlug, sanitizeObjectKeys } from "../summary/articles.mjs";

export function ensureArtifactDirs(config) {
  for (const dir of [config?.progressDir, config?.debugDir, config?.backupDir]) {
    if (dir) mkdirSync(dir, { recursive: true });
  }
}

export function createRunArtifacts(options, sourceUrl, targetUrl, config, runName = "summary-generation") {
  ensureArtifactDirs(config);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const prefix = `${runName}-${timestamp}`;
  const progressPath = join(config.progressDir, `${prefix}-progress.json`);
  const resultsPath = join(config.progressDir, `${prefix}-results.jsonl`);
  const backupPath = join(config.backupDir, `${prefix}-backup.json`);

  const runArtifacts = {
    runId: prefix,
    progressPath,
    resultsPath,
    backupPath,
    sourceUrl,
    targetUrl,
    options: {
      concurrency: options.concurrency,
      all: options.all,
      includeExisting: options.includeExisting,
      dryRun: options.dryRun,
      reasoningEffort: options.reasoningEffort,
      model: config.model,
    },
  };

  updateProgress(runArtifacts, {
    runId: prefix,
    status: "starting",
    sourceUrl,
    targetUrl,
    startedAt: new Date().toISOString(),
    options: runArtifacts.options,
  });

  return runArtifacts;
}

export function updateProgress(runArtifacts, progress) {
  if (!runArtifacts?.progressPath) return;
  mkdirSync(dirname(runArtifacts.progressPath), { recursive: true });
  writeFileSync(runArtifacts.progressPath, JSON.stringify(progress, null, 2), "utf8");
}

export function appendResult(runArtifacts, entry) {
  if (!runArtifacts?.resultsPath) return;
  mkdirSync(dirname(runArtifacts.resultsPath), { recursive: true });
  appendFileSync(runArtifacts.resultsPath, `${JSON.stringify(entry)}\n`, "utf8");
}

export function writeDebugArtifact({ slug, suffix, payload, metadata = {}, config }) {
  if (!slug) return;
  ensureArtifactDirs(config);
  const baseName = `${slug.replace(/[^a-z0-9_-]+/gi, "_")}-${suffix}`;
  const payloadPath = join(config.debugDir, `${baseName}.txt`);
  const metaPath = join(config.debugDir, `${baseName}-meta.json`);
  writeFileSync(payloadPath, `${payload ?? ""}`, "utf8");
  writeFileSync(metaPath, JSON.stringify({ slug, payloadPath, ...metadata }, null, 2), "utf8");
}

export function buildProgressSnapshot({
  runArtifacts,
  selectedCount,
  completed,
  failed,
  skipped,
  totalPromptTokens,
  totalCompletionTokens,
  failedItems,
  startedAt,
  currentSlug = null,
  status = "running",
  fatalError,
}) {
  return {
    runId: runArtifacts?.runId ?? null,
    status,
    startedAt,
    updatedAt: new Date().toISOString(),
    sourceUrl: runArtifacts?.sourceUrl ?? null,
    targetUrl: runArtifacts?.targetUrl ?? null,
    selectedCount,
    completed,
    failed,
    skipped,
    totalPromptTokens,
    totalCompletionTokens,
    currentSlug,
    failedItems,
    fatalError,
    resultsPath: runArtifacts?.resultsPath ?? null,
    backupPath: runArtifacts?.backupPath ?? null,
  };
}

export function writeFatalProgress(runArtifacts, error) {
  if (!runArtifacts?.progressPath) return;
  updateProgress(runArtifacts, {
    runId: runArtifacts.runId ?? null,
    status: "fatal_error",
    updatedAt: new Date().toISOString(),
    sourceUrl: runArtifacts.sourceUrl ?? null,
    targetUrl: runArtifacts.targetUrl ?? null,
    error: error instanceof Error ? error.message : String(error),
    resultsPath: runArtifacts.resultsPath ?? null,
    backupPath: runArtifacts.backupPath ?? null,
  });
}

export function writeBackup({
  runArtifacts,
  articles,
  targetArticlesBySlug,
  sourceUrl,
  targetUrl,
  skipped = false,
}) {
  if (skipped || !runArtifacts?.backupPath) return null;
  const backupDocs = articles
    .map((article) => targetArticlesBySlug.get(getArticleSlug(article)) || null)
    .filter(Boolean);

  mkdirSync(dirname(runArtifacts.backupPath), { recursive: true });
  writeFileSync(
    runArtifacts.backupPath,
    JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        sourceUrl,
        targetUrl,
        count: backupDocs.length,
        articles: backupDocs,
      },
      null,
      2,
    ),
    "utf8",
  );

  return runArtifacts.backupPath;
}

export function copyLocalJsonBackup({ articlesFile, backupFile, log = console.log }) {
  if (!existsSync(articlesFile)) return null;
  mkdirSync(dirname(backupFile), { recursive: true });
  copyFileSync(articlesFile, backupFile);
  log(`Backup created: ${backupFile}`);
  return backupFile;
}

export function writeLocalJsonExport({ articles, articlesFile }) {
  mkdirSync(dirname(articlesFile), { recursive: true });
  writeFileSync(articlesFile, JSON.stringify(articles, null, 2), "utf8");
}

export function refreshLocalJsonExport({
  articles,
  articlesFile,
  confirmLocalExportRefresh = false,
}) {
  if (!confirmLocalExportRefresh) {
    throw new Error("refreshLocalJsonExport requires confirmLocalExportRefresh=true");
  }
  writeLocalJsonExport({ articles, articlesFile });
}

function assertNoImplicitLocalExport(updateLocalJson) {
  if (updateLocalJson) {
    throw new Error(
      "Batch Convex persistence no longer mutates local JSON. Run a separate local export refresh.",
    );
  }
}

export function createArticlePersistence({
  convexClient,
  adminKey,
  sourceArticlesBySlug = new Map(),
  targetArticlesBySlug = new Map(),
  applyUpdate,
  updateLocalJson = false,
}) {
  if (typeof applyUpdate !== "function") {
    throw new Error("createArticlePersistence requires an applyUpdate adapter");
  }
  assertNoImplicitLocalExport(updateLocalJson);

  return async function persistSuccessfulUpdate(result) {
    const baseArticle = targetArticlesBySlug.get(result.slug) || sourceArticlesBySlug.get(result.slug);
    if (!baseArticle) {
      throw new Error(`No target/source base article found for slug ${result.slug}`);
    }

    const nextArticle = applyUpdate(cloneJson(baseArticle), result);
    await convexClient.mutation(api.substanceIndex.saveSubstances, {
      apiKey: adminKey,
      articles: [sanitizeObjectKeys(nextArticle)],
    });
    targetArticlesBySlug.set(result.slug, nextArticle);

    return nextArticle;
  };
}

export async function applySuccessfulUpdates({
  results,
  allArticles,
  convexClient,
  adminKey,
  applyUpdate,
  updateLocalJson = false,
}) {
  if (!results?.successfulUpdates?.length) return null;
  assertNoImplicitLocalExport(updateLocalJson);

  const articlesByTitle = new Map(allArticles.map((article) => [article.title, article]));
  const updatedArticles = [];
  for (const update of results.successfulUpdates) {
    const article = articlesByTitle.get(update.title);
    if (!article) continue;
    applyUpdate(article, update);
    updatedArticles.push(article);
  }

  return convexClient.mutation(api.substanceIndex.saveSubstances, {
    apiKey: adminKey,
    articles: updatedArticles.map(sanitizeObjectKeys),
  });
}
