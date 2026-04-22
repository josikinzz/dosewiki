import { appendFileSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";

export function ensureRunDirs(config) {
  mkdirSync(config.progressDir, { recursive: true });
  mkdirSync(config.debugDir, { recursive: true });
  mkdirSync(config.backupDir, { recursive: true });
}

export function createRunArtifacts(options, sourceUrl, targetUrl, config) {
  ensureRunDirs(config);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const prefix = `summary-generation-${timestamp}`;
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

  writeFileSync(
    progressPath,
    JSON.stringify(
      {
        runId: prefix,
        status: "starting",
        sourceUrl,
        targetUrl,
        startedAt: new Date().toISOString(),
        options: runArtifacts.options,
      },
      null,
      2,
    ),
    "utf8",
  );

  return runArtifacts;
}

export function updateProgress(runArtifacts, progress) {
  if (!runArtifacts?.progressPath) return;
  writeFileSync(runArtifacts.progressPath, JSON.stringify(progress, null, 2), "utf8");
}

export function appendResult(runArtifacts, entry) {
  if (!runArtifacts?.resultsPath) return;
  appendFileSync(runArtifacts.resultsPath, `${JSON.stringify(entry)}\n`, "utf8");
}

export function writeDebugArtifact({ slug, suffix, payload, metadata = {}, config }) {
  if (!slug) return;
  ensureRunDirs(config);
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
    resultsPath: runArtifacts?.resultsPath ?? null,
    backupPath: runArtifacts?.backupPath ?? null,
  };
}
