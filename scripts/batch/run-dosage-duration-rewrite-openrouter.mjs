#!/usr/bin/env node
/**
 * Run OpenRouter rewrite jobs exported from the dosage/duration note queue.
 *
 * Reads NDJSON jobs, calls OpenRouter via the shared SDK helper, and writes:
 * - results NDJSON with one record per completed job
 * - a progress JSON file for resume support
 * - a summary JSON file for review
 *
 * Usage:
 *   export OPENROUTER_API_KEY="sk-or-..."
 *   node scripts/batch/run-dosage-duration-rewrite-openrouter.mjs
 *   node scripts/batch/run-dosage-duration-rewrite-openrouter.mjs --concurrency=3 --resume
 *   node scripts/batch/run-dosage-duration-rewrite-openrouter.mjs --article=2c-b
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { callOpenRouterChat } from "../lib/openrouter-sdk.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "../..");

const DEFAULT_INPUT_PATH = join(
  PROJECT_ROOT,
  "notes-and-plans/exports/openrouter/dosage-duration-rewrite-item-jobs.ndjson"
);
const DEFAULT_OUT_DIR = join(
  PROJECT_ROOT,
  "notes-and-plans/exports/openrouter/results"
);

const DEFAULT_CONCURRENCY = 3;
const DEFAULT_RETRY_ATTEMPTS = 4;
const DEFAULT_RETRY_DELAY_MS = 2500;

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    input: DEFAULT_INPUT_PATH,
    outDir: DEFAULT_OUT_DIR,
    concurrency: DEFAULT_CONCURRENCY,
    retryAttempts: DEFAULT_RETRY_ATTEMPTS,
    retryDelayMs: DEFAULT_RETRY_DELAY_MS,
    resume: true,
    verbose: false,
    article: null,
    limit: null,
  };

  for (const arg of args) {
    if (arg.startsWith("--input=")) {
      options.input = arg.split("=")[1];
    } else if (arg.startsWith("--out-dir=")) {
      options.outDir = arg.split("=")[1];
    } else if (arg.startsWith("--concurrency=")) {
      options.concurrency = Number.parseInt(arg.split("=")[1], 10);
    } else if (arg.startsWith("--retry-attempts=")) {
      options.retryAttempts = Number.parseInt(arg.split("=")[1], 10);
    } else if (arg.startsWith("--retry-delay-ms=")) {
      options.retryDelayMs = Number.parseInt(arg.split("=")[1], 10);
    } else if (arg === "--no-resume") {
      options.resume = false;
    } else if (arg === "--resume") {
      options.resume = true;
    } else if (arg === "--verbose") {
      options.verbose = true;
    } else if (arg.startsWith("--article=")) {
      options.article = arg.split("=")[1];
    } else if (arg.startsWith("--limit=")) {
      options.limit = Number.parseInt(arg.split("=")[1], 10);
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
  }

  return options;
}

function printHelp() {
  console.log(`
Run OpenRouter rewrite jobs exported from the dosage/duration note queue.

Usage:
  export OPENROUTER_API_KEY="sk-or-..."
  node scripts/batch/run-dosage-duration-rewrite-openrouter.mjs

Options:
  --input=<path>             Input jobs NDJSON
  --out-dir=<path>           Output directory
  --concurrency=<n>          Parallel requests (default: 3)
  --retry-attempts=<n>       Retry attempts per failed request (default: 4)
  --retry-delay-ms=<n>       Base retry delay in ms (default: 2500)
  --article=<slug>           Run only one article slug
  --limit=<n>                Run only the first N matching jobs
  --resume                   Resume from progress file (default)
  --no-resume                Ignore progress file and rerun everything
  --verbose                  Print per-job details
  --help, -h                 Show help
`);
}

function requireApiKey() {
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    console.error("Error: OPENROUTER_API_KEY environment variable is required");
    process.exit(1);
  }

  return apiKey;
}

function loadJobs(inputPath) {
  const raw = readFileSync(inputPath, "utf8");
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function filterJobs(jobs, options) {
  let filtered = jobs;

  if (options.article) {
    filtered = filtered.filter((job) => job.articleSlug === options.article);
  }

  if (typeof options.limit === "number" && Number.isFinite(options.limit) && options.limit > 0) {
    filtered = filtered.slice(0, options.limit);
  }

  return filtered;
}

function getPaths(options) {
  mkdirSync(options.outDir, { recursive: true });

  const scope = options.article ? `dosage-duration-rewrite-${options.article}` : "dosage-duration-rewrite";

  return {
    progressPath: join(options.outDir, `${scope}-progress.json`),
    resultsPath: join(options.outDir, `${scope}-results.ndjson`),
    summaryPath: join(options.outDir, `${scope}-summary.json`),
  };
}

function loadProgress(progressPath, shouldResume) {
  if (!shouldResume || !existsSync(progressPath)) {
    return {
      startedAt: new Date().toISOString(),
      completedJobIds: [],
      failedJobIds: [],
      totals: {
        completed: 0,
        failed: 0,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      },
    };
  }

  return JSON.parse(readFileSync(progressPath, "utf8"));
}

function saveProgress(progressPath, progress) {
  writeFileSync(progressPath, JSON.stringify(progress, null, 2) + "\n");
}

function extractJsonObject(text) {
  const trimmed = text.trim();

  try {
    return JSON.parse(trimmed);
  } catch {
    // The response may be wrapped in a code fence, so try that representation next.
  }

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch) {
    try {
      return JSON.parse(fencedMatch[1].trim());
    } catch {
      // A fenced block may contain surrounding prose; the brace-bounded fallback handles it.
    }
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    const candidate = trimmed.slice(firstBrace, lastBrace + 1);
    return JSON.parse(candidate);
  }

  throw new Error("Model response did not contain parseable JSON");
}

function stripWrappingCodeFences(text) {
  const trimmed = text.trim();
  const fencedMatch = trimmed.match(/```(?:json|text|markdown)?\s*([\s\S]*?)```/i);
  return fencedMatch ? fencedMatch[1].trim() : trimmed;
}

function parseResponsePayload(job, text) {
  try {
    return extractJsonObject(text);
  } catch (error) {
    if (job.openrouter?.responseShape && Object.keys(job.openrouter.responseShape).length === 1 && job.openrouter.responseShape.rewrittenText === "string") {
      const fallback = stripWrappingCodeFences(text);
      if (fallback.length > 0) {
        return { rewrittenText: fallback };
      }
    }

    throw error;
  }
}

async function callWithRetry(fn, options, jobId) {
  let lastError;

  for (let attempt = 0; attempt < options.retryAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (!error?.retryable || attempt === options.retryAttempts - 1) {
        throw error;
      }

      const delay = options.retryDelayMs * Math.pow(2, attempt);
      console.log(`  Retry ${attempt + 1}/${options.retryAttempts} for ${jobId} after ${delay}ms`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

async function runJob(apiKey, job, options) {
  const startedAt = Date.now();
  let response = await callWithRetry(
    () =>
      callOpenRouterChat({
        apiKey,
        appTitle: "Dose.wiki Dosage/Duration Note Rewrite Runner",
        model: job.openrouter.model,
        systemPrompt: job.openrouter.systemPrompt,
        userMessage: job.openrouter.userMessage,
        temperature: job.openrouter.temperature,
        maxTokens: job.openrouter.maxTokens,
        reasoningEffort: job.openrouter.reasoningEffort,
      }),
    options,
    job.jobId
  );

  if (!response.content.trim()) {
    response = await callWithRetry(
      () =>
        callOpenRouterChat({
          apiKey,
          appTitle: "Dose.wiki Dosage/Duration Note Rewrite Runner",
          model: job.openrouter.model,
          systemPrompt: job.openrouter.systemPrompt,
          userMessage: `${job.openrouter.userMessage}\n\nYour previous response was empty. Return the requested JSON object now.`,
          temperature: job.openrouter.temperature,
          maxTokens: job.openrouter.maxTokens,
          disableReasoning: true,
        }),
      options,
      `${job.jobId}:empty-retry`
    );
  }

  const parsed = parseResponsePayload(job, response.content);

  return {
    jobId: job.jobId,
    articleSlug: job.articleSlug,
    articleTitle: job.articleTitle,
    section: job.section,
    route: job.route,
    fieldPath: job.fieldPath,
    currentText: job.currentText,
    status: "success",
    startedAt: new Date(startedAt).toISOString(),
    finishedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    response: {
      finishReason: response.finishReason,
      usage: response.usage,
      rawContent: response.content,
      reasoning: response.reasoning,
      parsed,
    },
  };
}

function summarizeResults(results) {
  return results.reduce(
    (acc, result) => {
      if (result.status === "success") {
        acc.completed++;
        acc.promptTokens += result.response?.usage?.promptTokens || 0;
        acc.completionTokens += result.response?.usage?.completionTokens || 0;
        acc.totalTokens += result.response?.usage?.totalTokens || 0;
      } else {
        acc.failed++;
      }

      return acc;
    },
    {
      completed: 0,
      failed: 0,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    }
  );
}

async function processAll(apiKey, jobs, options, paths, progress) {
  const completedSet = new Set(progress.completedJobIds || []);
  const failedSet = new Set(progress.failedJobIds || []);
  const pendingJobs = jobs.filter((job) => !completedSet.has(job.jobId));
  const total = jobs.length;
  const runResults = [];

  for (let i = 0; i < pendingJobs.length; i += options.concurrency) {
    const batch = pendingJobs.slice(i, i + options.concurrency);

    const batchResults = await Promise.all(
      batch.map(async (job) => {
        if (options.verbose) {
          console.log(`Processing ${job.jobId} (${job.articleSlug} ${job.fieldPath})`);
        }

        try {
          const result = await runJob(apiKey, job, options);
          appendFileSync(paths.resultsPath, JSON.stringify(result) + "\n");
          return result;
        } catch (error) {
          const failure = {
            jobId: job.jobId,
            articleSlug: job.articleSlug,
            articleTitle: job.articleTitle,
            section: job.section,
            route: job.route,
            fieldPath: job.fieldPath,
            currentText: job.currentText,
            status: "failed",
            finishedAt: new Date().toISOString(),
            error: {
              message: error?.message || String(error),
              status: error?.status ?? null,
              retryable: Boolean(error?.retryable),
            },
          };
          appendFileSync(paths.resultsPath, JSON.stringify(failure) + "\n");
          return failure;
        }
      })
    );

    for (const result of batchResults) {
      runResults.push(result);

      if (result.status === "success") {
        completedSet.add(result.jobId);
        failedSet.delete(result.jobId);
        progress.totals.promptTokens += result.response?.usage?.promptTokens || 0;
        progress.totals.completionTokens += result.response?.usage?.completionTokens || 0;
        progress.totals.totalTokens += result.response?.usage?.totalTokens || 0;
      } else {
        failedSet.add(result.jobId);
      }
    }

    const completed = completedSet.size;
    const failed = failedSet.size;

    progress.completedJobIds = Array.from(completedSet);
    progress.failedJobIds = Array.from(failedSet);
    progress.lastUpdatedAt = new Date().toISOString();
    progress.totals.completed = completed;
    progress.totals.failed = failed;
    saveProgress(paths.progressPath, progress);

    process.stdout.write(`\rProgress: ${completed + failed}/${total} (${completed} ok, ${failed} failed)`);
  }

  console.log("");

  return runResults;
}

function loadExistingResults(resultsPath) {
  if (!existsSync(resultsPath)) {
    return [];
  }

  const rows = readFileSync(resultsPath, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));

  const latestByJobId = new Map();
  for (const row of rows) {
    latestByJobId.set(row.jobId, row);
  }

  return Array.from(latestByJobId.values());
}

function writeSummary(summaryPath, jobs, allResults, options, startedAt) {
  const totals = summarizeResults(allResults);
  const failedResults = allResults.filter((result) => result.status === "failed");

  writeFileSync(
    summaryPath,
    JSON.stringify(
      {
        startedAt,
        finishedAt: new Date().toISOString(),
        inputJobCount: jobs.length,
        completed: totals.completed,
        failed: totals.failed,
        promptTokens: totals.promptTokens,
        completionTokens: totals.completionTokens,
        totalTokens: totals.totalTokens,
        concurrency: options.concurrency,
        failedJobs: failedResults.map((result) => ({
          jobId: result.jobId,
          articleSlug: result.articleSlug,
          fieldPath: result.fieldPath,
          error: result.error,
        })),
      },
      null,
      2
    ) + "\n"
  );
}

async function main() {
  const startedAt = new Date().toISOString();
  const apiKey = requireApiKey();
  const options = parseArgs();
  const jobs = filterJobs(loadJobs(options.input), options);
  const paths = getPaths(options);
  const progress = loadProgress(paths.progressPath, options.resume);

  if (jobs.length === 0) {
    console.error("Error: no matching jobs found");
    process.exit(1);
  }

  if (!options.resume && existsSync(paths.resultsPath)) {
    writeFileSync(paths.resultsPath, "");
  }

  console.log(`Starting rewrite run for ${jobs.length} jobs with concurrency ${options.concurrency}`);
  console.log(`Results: ${paths.resultsPath}`);
  console.log(`Progress: ${paths.progressPath}`);

  await processAll(apiKey, jobs, options, paths, progress);

  const allResults = loadExistingResults(paths.resultsPath);
  writeSummary(paths.summaryPath, jobs, allResults, options, startedAt);

  const totals = summarizeResults(allResults);
  console.log(JSON.stringify({
    completed: totals.completed,
    failed: totals.failed,
    promptTokens: totals.promptTokens,
    completionTokens: totals.completionTokens,
    totalTokens: totals.totalTokens,
    resultsPath: paths.resultsPath,
    summaryPath: paths.summaryPath,
  }, null, 2));

  if (totals.failed > 0) {
    process.exitCode = 1;
  }
}

main();
