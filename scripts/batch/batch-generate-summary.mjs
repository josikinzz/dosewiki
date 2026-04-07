#!/usr/bin/env node
/**
 * Batch Summary Section Generation Script
 *
 * Generates top-level article summaries using the live Convex prompt.
 *
 * Defaults:
 * - Reads prompt/content from SOURCE_CONVEX_URL or CONVEX_PUBLIC_READ_URL first
 * - Writes generated summaries to TARGET_CONVEX_URL or the same deployment by default
 *
 * Usage:
 *   node scripts/batch/batch-generate-summary.mjs --dry-run
 *   node scripts/batch/batch-generate-summary.mjs --all --concurrency=2
 *   TARGET_CONVEX_URL=https://dev-or-prod.convex.cloud node scripts/batch/batch-generate-summary.mjs --substance=lsd
 */

import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import { ConvexHttpClient } from "convex/browser";
import yaml from "yaml";
import { api } from "../../convex/_generated/api.js";
import { callOpenRouterChat } from "../lib/openrouter-sdk.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "../..");

function loadEnvLocal() {
  try {
    const envPath = resolve(PROJECT_ROOT, ".env.local");
    const content = readFileSync(envPath, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex === -1) continue;
      const key = trimmed.slice(0, separatorIndex);
      const value = trimmed.slice(separatorIndex + 1);
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    // .env.local is optional
  }
}

loadEnvLocal();

const CONFIG = {
  model: process.env.OPENROUTER_MODEL || "anthropic/claude-opus-4-6",
  maxTokens: 2048,
  temperature: 0.3,
  maxConcurrency: 2,
  retryAttempts: 4,
  retryDelayMs: 2000,
  reasoningEffort: process.env.OPENROUTER_REASONING_EFFORT || "high",
  progressDir: join(PROJECT_ROOT, "notes-and-plans/exports/batch"),
  debugDir: join(PROJECT_ROOT, "tmp"),
  backupDir: join(PROJECT_ROOT, "notes-and-plans/exports/batch"),
  maxGenericSourceChars: 90000,
  maxCharsPerSource: 22000,
};

const INPUT_BOUNDS = {
  concurrency: { min: 1, max: 10 },
  limit: { min: 1, max: 10000 },
};

const GREEK_TO_ASCII = {
  alpha: "alpha",
  beta: "beta",
  gamma: "gamma",
  delta: "delta",
  epsilon: "epsilon",
  zeta: "zeta",
  eta: "eta",
  theta: "theta",
  iota: "iota",
  kappa: "kappa",
  lambda: "lambda",
  mu: "mu",
  nu: "nu",
  xi: "xi",
  omicron: "omicron",
  pi: "pi",
  rho: "rho",
  sigma: "sigma",
  tau: "tau",
  upsilon: "upsilon",
  phi: "phi",
  chi: "chi",
  psi: "psi",
  omega: "omega",
  "α": "alpha",
  "β": "beta",
  "γ": "gamma",
  "δ": "delta",
  "ε": "epsilon",
  "ζ": "zeta",
  "η": "eta",
  "θ": "theta",
  "ι": "iota",
  "κ": "kappa",
  "λ": "lambda",
  "μ": "mu",
  "ν": "nu",
  "ξ": "xi",
  "ο": "omicron",
  "π": "pi",
  "ρ": "rho",
  "σ": "sigma",
  "τ": "tau",
  "υ": "upsilon",
  "φ": "phi",
  "χ": "chi",
  "ψ": "psi",
  "ω": "omega",
};

let sourceClient = null;
let targetClient = null;
let runArtifacts = null;

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    concurrency: CONFIG.maxConcurrency,
    dryRun: false,
    verbose: false,
    substance: null,
    slugs: null,
    limit: null,
    all: false,
    includeExisting: false,
    skipBackup: false,
    sourceUrl: null,
    targetUrl: null,
    reasoningEffort: CONFIG.reasoningEffort,
  };

  for (const arg of args) {
    if (arg.startsWith("--concurrency=")) {
      const value = parseInt(arg.split("=")[1], 10);
      options.concurrency = Math.min(
        Math.max(Number.isNaN(value) ? CONFIG.maxConcurrency : value, INPUT_BOUNDS.concurrency.min),
        INPUT_BOUNDS.concurrency.max,
      );
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--verbose") {
      options.verbose = true;
    } else if (arg.startsWith("--substance=")) {
      options.substance = arg.split("=")[1];
    } else if (arg.startsWith("--slugs=")) {
      options.slugs = arg.split("=")[1].split(",").map((slug) => slug.trim()).filter(Boolean);
    } else if (arg.startsWith("--limit=")) {
      const value = parseInt(arg.split("=")[1], 10);
      options.limit = Math.min(
        Math.max(Number.isNaN(value) ? null : value, INPUT_BOUNDS.limit.min),
        INPUT_BOUNDS.limit.max,
      );
    } else if (arg === "--all") {
      options.all = true;
    } else if (arg === "--include-existing") {
      options.includeExisting = true;
    } else if (arg === "--skip-backup") {
      options.skipBackup = true;
    } else if (arg.startsWith("--source-url=")) {
      options.sourceUrl = arg.split("=")[1];
    } else if (arg.startsWith("--target-url=")) {
      options.targetUrl = arg.split("=")[1];
    } else if (arg.startsWith("--reasoning-effort=")) {
      options.reasoningEffort = arg.split("=")[1];
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
  }

  return options;
}

function printHelp() {
  console.log(`
Batch Summary Section Generation Script

Usage:
  node scripts/batch/batch-generate-summary.mjs [options]

Options:
  --dry-run                 Preview selection without generation or saving
  --verbose                 Show detailed progress output
  --substance=<slug>        Process a single substance
  --slugs=<a,b,c>           Process a comma-separated list of slugs
  --concurrency=<n>         Number of parallel generations (default: 2)
  --limit=<n>               Process at most N substances
  --all                     Include low-priority articles (default is high/normal only)
  --include-existing        Regenerate articles that already have a summary
  --skip-backup             Skip backup export for target articles
  --source-url=<url>        Override the source Convex deployment
  --target-url=<url>        Override the target Convex deployment
  --reasoning-effort=<lvl>  minimal|low|medium|high|xhigh (default: high)
  --help, -h                Show this help message
`);
}

function getSourceUrl(options) {
  return (
    options.sourceUrl ||
    process.env.SOURCE_CONVEX_URL ||
    process.env.CONVEX_PUBLIC_READ_URL ||
    process.env.CONVEX_URL ||
    process.env.VITE_CONVEX_URL ||
    process.env.NEXT_PUBLIC_CONVEX_URL ||
    null
  );
}

function getTargetUrl(options, sourceUrl) {
  return options.targetUrl || process.env.TARGET_CONVEX_URL || sourceUrl || null;
}

function titleToSlug(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getArticleSlug(article) {
  return article.slug || titleToSlug(article.title);
}

function stripConvexMetadata(article) {
  const { _id, _creationTime, ...clean } = article;
  return clean;
}

function sanitizeFieldName(name) {
  let result = name;
  for (const [greek, ascii] of Object.entries(GREEK_TO_ASCII)) {
    result = result.replace(new RegExp(greek, "g"), ascii);
  }
  return result.replace(/[^\x00-\x7F]/g, "_");
}

function sanitizeObjectKeys(value) {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(sanitizeObjectKeys);
  if (typeof value !== "object") return value;

  const result = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    result[sanitizeFieldName(key)] = sanitizeObjectKeys(nestedValue);
  }
  return result;
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function ensureRunDirs() {
  mkdirSync(CONFIG.progressDir, { recursive: true });
  mkdirSync(CONFIG.debugDir, { recursive: true });
  mkdirSync(CONFIG.backupDir, { recursive: true });
}

function createRunArtifacts(options, sourceUrl, targetUrl) {
  ensureRunDirs();
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const prefix = `summary-generation-${timestamp}`;
  const progressPath = join(CONFIG.progressDir, `${prefix}-progress.json`);
  const resultsPath = join(CONFIG.progressDir, `${prefix}-results.jsonl`);
  const backupPath = join(CONFIG.backupDir, `${prefix}-backup.json`);

  runArtifacts = {
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
      model: CONFIG.model,
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

function updateProgress(progress) {
  if (!runArtifacts?.progressPath) return;
  writeFileSync(runArtifacts.progressPath, JSON.stringify(progress, null, 2), "utf8");
}

function appendResult(entry) {
  if (!runArtifacts?.resultsPath) return;
  appendFileSync(runArtifacts.resultsPath, `${JSON.stringify(entry)}\n`, "utf8");
}

function writeDebugArtifact({ slug, suffix, payload, metadata = {} }) {
  if (!slug) return;
  ensureRunDirs();
  const baseName = `${slug.replace(/[^a-z0-9_-]+/gi, "_")}-${suffix}`;
  const payloadPath = join(CONFIG.debugDir, `${baseName}.txt`);
  const metaPath = join(CONFIG.debugDir, `${baseName}-meta.json`);
  writeFileSync(payloadPath, `${payload ?? ""}`, "utf8");
  writeFileSync(metaPath, JSON.stringify({ slug, payloadPath, ...metadata }, null, 2), "utf8");
}

async function initClients(sourceUrl, targetUrl) {
  sourceClient = new ConvexHttpClient(sourceUrl);
  targetClient = new ConvexHttpClient(targetUrl);
}

async function loadPromptFromSource() {
  const prompt = await sourceClient.query(api.prompts.getByKey, { key: "section_summary" });
  if (!prompt) {
    throw new Error("section_summary prompt not found in source Convex deployment.");
  }
  return prompt.content;
}

async function loadArticles(client) {
  const articles = await client.query(api.substanceIndex.getAll, {});
  return articles.map(stripConvexMetadata);
}

async function loadSummaryQuoteSlugs() {
  const docs = await sourceClient.query(api.quotes.getBySection, { section: "summary" });
  return new Set(docs.map((doc) => doc.slug));
}

async function loadArticleSourceSlugs() {
  const slugs = new Set();
  let cursor = undefined;
  let isDone = false;

  while (!isDone) {
    const result = await sourceClient.query(api.articleSources.getSubstanceList, {
      cursor,
      limit: 100,
    });

    for (const item of result.items) {
      slugs.add(item.slug);
    }

    cursor = result.cursor ?? undefined;
    isDone = result.isDone;
  }

  return slugs;
}

async function loadSummaryQuote(slug) {
  return await sourceClient.query(api.quotes.getBySlugAndSection, {
    slug,
    section: "summary",
  });
}

async function loadArticleSources(slug) {
  return await sourceClient.query(api.articleSources.getBySlug, { slug });
}

function buildSummaryQuoteUserMessage(article, quoteContent) {
  const psychoactiveClass = article.classification?.psychoactive_class || [];
  const chemicalClass = article.classification?.chemical_class || [];

  return `## Substance

**${article.title}**
- Psychoactive class: ${psychoactiveClass.join(", ") || "Unknown"}
- Chemical class: ${chemicalClass.join(", ") || "Unknown"}

## Source Material

Generate the top-level summary using these extracted summary-focused quotes:

${quoteContent}

## Instructions

Generate ONLY valid YAML for the top-level summary field. Do not include aliases, dosage detail, duration detail, detailed pharmacology, or legal detail.`;
}

function truncateContent(content, maxChars) {
  if (content.length <= maxChars) return { content, truncated: false };
  return {
    content: `${content.slice(0, maxChars)}\n\n[Source content truncated for batch generation]`,
    truncated: true,
  };
}

function buildGenericSourceUserMessage(article, sourceDoc) {
  const psychoactiveClass = article.classification?.psychoactive_class || [];
  const chemicalClass = article.classification?.chemical_class || [];
  const sections = [];
  let totalChars = 0;
  let truncatedSources = 0;

  for (const source of sourceDoc.sources || []) {
    const rawContent = sourceDoc.contents?.[source.id];
    if (typeof rawContent !== "string" || !rawContent.trim()) {
      continue;
    }

    const remaining = CONFIG.maxGenericSourceChars - totalChars;
    if (remaining <= 0) break;

    const maxChars = Math.min(CONFIG.maxCharsPerSource, remaining);
    const { content, truncated } = truncateContent(rawContent, maxChars);
    if (truncated) truncatedSources++;

    sections.push(
      `## Source: ${source.displayName}\nSource ID: ${source.id}\n\n\`\`\`markdown\n${content}\n\`\`\``,
    );
    totalChars += content.length;
  }

  if (sections.length === 0) {
    throw new Error("No usable generic source content found in Convex articleSources.");
  }

  const truncationNote =
    truncatedSources > 0
      ? `\nNote: ${truncatedSources} source section(s) were truncated to stay within batch limits.\n`
      : "";

  return `## Substance

**${article.title}**
- Psychoactive class: ${psychoactiveClass.join(", ") || "Unknown"}
- Chemical class: ${chemicalClass.join(", ") || "Unknown"}
${truncationNote}
## Source Material

Generate the top-level summary using the following source articles:

${sections.join("\n\n---\n\n")}

## Instructions

Generate ONLY valid YAML for the top-level summary field. Do not include aliases, dosage detail, duration detail, detailed pharmacology, or legal detail.`;
}

async function callOpenRouter(apiKey, systemPrompt, userMessage, debugContext = null, options = {}) {
  const response = await callOpenRouterChat({
    apiKey,
    appTitle: "Dose.wiki Batch Summary Generator",
    model: CONFIG.model,
    systemPrompt,
    userMessage,
    temperature: CONFIG.temperature,
    maxTokens: CONFIG.maxTokens,
    reasoningEffort: options.reasoningEffort || CONFIG.reasoningEffort,
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
}

async function callWithRetry(fn, attempts = CONFIG.retryAttempts) {
  let lastError;

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!error.retryable) throw error;

      const delay = CONFIG.retryDelayMs * Math.pow(2, attempt);
      console.log(`  Retry ${attempt + 1}/${attempts} after ${delay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

function repairCommonYamlIssues(yamlContent) {
  return yamlContent
    .split(/\r?\n/)
    .map((line) => {
      const quotedScalarMatch = line.match(/^(\s*[^:#][^:]*:\s*)"([^"\n]*)$/);
      if (quotedScalarMatch) {
        return `${quotedScalarMatch[1]}${quotedScalarMatch[2]}`;
      }
      return line;
    })
    .join("\n");
}

function extractSummaryYaml(response) {
  const withoutThinkBlocks = response.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  const yamlMatch = withoutThinkBlocks.match(/```ya?ml\s*([\s\S]*?)```/i);
  if (yamlMatch) {
    return yamlMatch[1].trim();
  }

  const lines = withoutThinkBlocks.split(/\r?\n/);
  const firstRelevantLine = lines.findIndex((line) => /^summary\s*:/i.test(line.trim()));
  if (firstRelevantLine === -1) {
    return withoutThinkBlocks;
  }

  return lines.slice(firstRelevantLine).join("\n").trim();
}

function normalizeSummaryString(summary) {
  return summary.replace(/\s+/g, " ").trim();
}

function validateSummaryString(summary) {
  const normalized = normalizeSummaryString(summary);
  const words = normalized.split(/\s+/).filter(Boolean);

  if (!normalized) {
    throw new Error("Summary is empty");
  }

  if (words.length < 35 || words.length > 120) {
    throw new Error(`Summary word count ${words.length} is outside the accepted batch range`);
  }

  if (/(provided excerpts|provided sources|according to the sources|based on the provided|the excerpts describe)/i.test(normalized)) {
    throw new Error("Summary contains source-meta commentary");
  }

  return normalized;
}

function parseGeneratedSummary(response, debugContext = null) {
  const yamlContent = extractSummaryYaml(response);
  const parseAttempts = [yamlContent, repairCommonYamlIssues(yamlContent)].filter(
    (content, index, arr) => content && arr.indexOf(content) === index,
  );

  let lastError = null;
  for (const candidate of parseAttempts) {
    try {
      const parsed = yaml.parse(candidate, { uniqueKeys: false });
      const value =
        typeof parsed === "string"
          ? parsed
          : parsed && typeof parsed === "object" && typeof parsed.summary === "string"
            ? parsed.summary
            : null;

      if (typeof value === "string") {
        return validateSummaryString(value);
      }

      lastError = new Error("Missing string summary field");
    } catch (error) {
      lastError = error;
    }
  }

  writeDebugArtifact({
    slug: debugContext?.slug,
    suffix: "summary-parse-failure",
    payload: response,
    metadata: {
      title: debugContext?.title,
      yamlContent,
      errorMessage: lastError?.message ?? "Unknown parse failure",
    },
  });

  throw new Error(`Failed to parse YAML: ${lastError?.message ?? "Unknown parse failure"}`);
}

function createSourceMaterialDescription(materialType) {
  return materialType === "quotes" ? "summary quotes" : "generic source articles";
}

async function processArticle(apiKey, article, systemPrompt, options, availability) {
  const slug = getArticleSlug(article);
  const hasQuote = availability.summaryQuoteSlugs.has(slug);
  const hasSourceDoc = availability.articleSourceSlugs.has(slug);

  if (!hasQuote && !hasSourceDoc) {
    return {
      slug,
      title: article.title,
      status: "skipped",
      reason: "No summary quote doc or articleSources doc in source Convex",
      tokens: 0,
    };
  }

  let materialType = "quotes";
  let userMessage = null;

  if (hasQuote) {
    const quote = await loadSummaryQuote(slug);
    if (!quote?.content?.trim()) {
      return {
        slug,
        title: article.title,
        status: "skipped",
        reason: "Summary quote doc exists but has no content",
        tokens: 0,
      };
    }
    userMessage = buildSummaryQuoteUserMessage(article, quote.content);
  } else {
    materialType = "generic_sources";
    const sourceDoc = await loadArticleSources(slug);
    if (!sourceDoc) {
      return {
        slug,
        title: article.title,
        status: "skipped",
        reason: "No articleSources doc found",
        tokens: 0,
      };
    }
    userMessage = buildGenericSourceUserMessage(article, sourceDoc);
  }

  const result = await callWithRetry(() =>
    callOpenRouter(apiKey, systemPrompt, userMessage, { slug, title: article.title }, options),
  );

  const summary = parseGeneratedSummary(result.content, { slug, title: article.title });

  return {
    slug,
    title: article.title,
    status: "success",
    summary,
    sourceMaterial: materialType,
    tokens: result.usage.totalTokens,
    promptTokens: result.usage.promptTokens,
    completionTokens: result.usage.completionTokens,
  };
}

async function persistSuccessfulUpdate(result, persistenceContext) {
  const { adminKey, targetArticlesBySlug, sourceArticlesBySlug } = persistenceContext;

  const baseArticle =
    targetArticlesBySlug.get(result.slug) ||
    sourceArticlesBySlug.get(result.slug);

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
}

function buildProgressSnapshot({
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

async function processAll(apiKey, articles, systemPrompt, options, availability, persistenceContext) {
  const { concurrency, verbose, dryRun } = options;

  let completed = 0;
  let failed = 0;
  let skipped = 0;
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  const failedItems = [];
  const startedAt = new Date().toISOString();

  updateProgress(
    buildProgressSnapshot({
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

    const promises = batch.map(async (article) => {
      const slug = getArticleSlug(article);

      if (verbose) {
        console.log(`  Processing: ${slug}`);
      }

      if (dryRun) {
        const hasQuote = availability.summaryQuoteSlugs.has(slug);
        const hasSourceDoc = availability.articleSourceSlugs.has(slug);
        return {
          slug,
          title: article.title,
          status: hasQuote || hasSourceDoc ? "dry-run" : "would-skip",
          reason: hasQuote || hasSourceDoc ? null : "No summary quote doc or articleSources doc in source Convex",
          sourceMaterial: hasQuote ? "quotes" : hasSourceDoc ? "generic_sources" : null,
          tokens: 0,
        };
      }

      try {
        return await processArticle(apiKey, article, systemPrompt, options, availability);
      } catch (error) {
        console.error(`  Failed: ${slug} - ${error.message}`);
        return {
          slug,
          title: article.title,
          status: "failed",
          error: error.message,
        };
      }
    });

    const results = await Promise.all(promises);

    for (const result of results) {
      if (result.status === "success") {
        try {
          await persistSuccessfulUpdate(result, persistenceContext);
          completed++;
          totalPromptTokens += result.promptTokens;
          totalCompletionTokens += result.completionTokens;
          appendResult({
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
            console.log(
              `  Saved: ${result.slug} (${createSourceMaterialDescription(result.sourceMaterial)}, ${result.tokens} tokens)`,
            );
          }
        } catch (error) {
          failed++;
          failedItems.push({ slug: result.slug, title: result.title, error: error.message });
          appendResult({
            status: "persist_failed",
            slug: result.slug,
            title: result.title,
            error: error.message,
          });
          console.error(`  Failed to persist: ${result.slug} - ${error.message}`);
        }
      } else if (result.status === "dry-run") {
        completed++;
      } else if (result.status === "skipped" || result.status === "would-skip") {
        skipped++;
        appendResult({
          status: result.status,
          slug: result.slug,
          title: result.title,
          sourceMaterial: result.sourceMaterial ?? null,
          reason: result.reason,
        });
      } else if (result.status === "failed") {
        failed++;
        failedItems.push({ slug: result.slug, title: result.title, error: result.error });
        appendResult({
          status: "failed",
          slug: result.slug,
          title: result.title,
          error: result.error,
        });
      }
    }

    const done = completed + failed + skipped;
    process.stdout.write(`\rProgress: ${done}/${articles.length} (${completed} ok, ${failed} failed, ${skipped} skipped)`);

    updateProgress(
      buildProgressSnapshot({
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

  console.log();

  const finalProgress = buildProgressSnapshot({
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
  updateProgress(finalProgress);

  return {
    completed,
    failed,
    skipped,
    totalPromptTokens,
    totalCompletionTokens,
    failedItems,
  };
}

function selectArticles(allArticles, options, availability) {
  let articles = allArticles.filter((article) => (options.all ? true : article.priority === "high" || article.priority === "normal"));

  if (options.substance) {
    articles = articles.filter((article) => getArticleSlug(article) === options.substance);
  } else if (options.slugs) {
    const wanted = new Set(options.slugs);
    articles = articles.filter((article) => wanted.has(getArticleSlug(article)));
  }

  const withSources = articles.filter((article) => {
    const slug = getArticleSlug(article);
    return availability.summaryQuoteSlugs.has(slug) || availability.articleSourceSlugs.has(slug);
  });

  const missingSourceCoverage = articles.length - withSources.length;
  articles = withSources;

  if (!options.includeExisting) {
    articles = articles.filter((article) => !(typeof article.summary === "string" && article.summary.trim()));
  }

  if (options.limit && articles.length > options.limit) {
    articles = articles.slice(0, options.limit);
  }

  return {
    articles,
    missingSourceCoverage,
    quotedCount: articles.filter((article) => availability.summaryQuoteSlugs.has(getArticleSlug(article))).length,
    genericCount: articles.filter((article) => !availability.summaryQuoteSlugs.has(getArticleSlug(article))).length,
  };
}

async function createBackup(selectedArticles, targetArticlesBySlug, options, sourceUrl, targetUrl) {
  if (options.dryRun || options.skipBackup || !runArtifacts?.backupPath) {
    return null;
  }

  const backupDocs = selectedArticles
    .map((article) => targetArticlesBySlug.get(getArticleSlug(article)) || null)
    .filter(Boolean);

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

async function main() {
  const options = parseArgs();
  CONFIG.reasoningEffort = options.reasoningEffort || CONFIG.reasoningEffort;

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey && !options.dryRun) {
    console.error("Error: OPENROUTER_API_KEY environment variable is required");
    process.exit(1);
  }

  const adminKey = process.env.CONVEX_ADMIN_KEY;
  if (!adminKey && !options.dryRun) {
    console.error("Error: CONVEX_ADMIN_KEY environment variable is required");
    process.exit(1);
  }

  const sourceUrl = getSourceUrl(options);
  const targetUrl = getTargetUrl(options, sourceUrl);
  if (!sourceUrl) {
    console.error("Error: No source Convex URL configured");
    process.exit(1);
  }
  if (!targetUrl) {
    console.error("Error: No target Convex URL configured");
    process.exit(1);
  }

  createRunArtifacts(options, sourceUrl, targetUrl);
  await initClients(sourceUrl, targetUrl);

  console.log("\nBatch Summary Section Generation");
  console.log("=".repeat(50));
  console.log(`Model: ${CONFIG.model}`);
  console.log(`Reasoning Effort: ${CONFIG.reasoningEffort}`);
  console.log(`Concurrency: ${options.concurrency}`);
  console.log(`Source Convex: ${sourceUrl}`);
  console.log(`Target Convex: ${targetUrl}`);

  console.log("\nLoading prompt from source Convex...");
  const systemPrompt = await loadPromptFromSource();
  console.log(`  Prompt loaded: ${systemPrompt.length.toLocaleString()} chars`);

  console.log("\nLoading article and source availability...");
  const [sourceArticles, targetArticles, summaryQuoteSlugs, articleSourceSlugs] = await Promise.all([
    loadArticles(sourceClient),
    sourceUrl === targetUrl ? loadArticles(sourceClient) : loadArticles(targetClient),
    loadSummaryQuoteSlugs(),
    loadArticleSourceSlugs(),
  ]);

  const sourceArticlesBySlug = new Map(sourceArticles.map((article) => [getArticleSlug(article), article]));
  const targetArticlesBySlug = new Map(targetArticles.map((article) => [getArticleSlug(article), article]));

  console.log(`  Source articles loaded: ${sourceArticles.length}`);
  console.log(`  Target articles loaded: ${targetArticles.length}`);
  console.log(`  Summary quote docs: ${summaryQuoteSlugs.size}`);
  console.log(`  Article source docs: ${articleSourceSlugs.size}`);

  const availability = { summaryQuoteSlugs, articleSourceSlugs };
  const selection = selectArticles(sourceArticles, options, availability);
  const selectedArticles = selection.articles;

  console.log(`\nSelected articles: ${selectedArticles.length}`);
  console.log(`  Using summary quotes: ${selection.quotedCount}`);
  console.log(`  Using generic source fallback: ${selection.genericCount}`);
  if (selection.missingSourceCoverage > 0) {
    console.log(`  Excluded for missing source coverage: ${selection.missingSourceCoverage}`);
  }

  if (selectedArticles.length === 0) {
    console.log("\nNo articles to process.");
    updateProgress({
      ...JSON.parse(readFileSync(runArtifacts.progressPath, "utf8")),
      status: "completed",
      updatedAt: new Date().toISOString(),
      selectedCount: 0,
    });
    return;
  }

  if (options.dryRun) {
    console.log("\n[DRY RUN] Would process:");
    for (const article of selectedArticles.slice(0, 20)) {
      const slug = getArticleSlug(article);
      const sourceMaterial = summaryQuoteSlugs.has(slug) ? "quotes" : "generic_sources";
      console.log(`  - ${slug} (${sourceMaterial})`);
    }
    if (selectedArticles.length > 20) {
      console.log(`  ... and ${selectedArticles.length - 20} more`);
    }
    return;
  }

  const backupPath = await createBackup(selectedArticles, targetArticlesBySlug, options, sourceUrl, targetUrl);
  if (backupPath) {
    console.log(`\nBackup written: ${backupPath}`);
  }

  console.log(`\nProcessing ${selectedArticles.length} articles...\n`);
  const startedAt = Date.now();

  const results = await processAll(
    apiKey,
    selectedArticles,
    systemPrompt,
    options,
    availability,
    {
      adminKey,
      sourceArticlesBySlug,
      targetArticlesBySlug,
    },
  );

  const duration = (Date.now() - startedAt) / 1000;

  console.log("\n" + "=".repeat(50));
  console.log("Complete!");
  console.log("=".repeat(50));
  console.log(`\nResults:`);
  console.log(`  Successful: ${results.completed}`);
  console.log(`  Failed: ${results.failed}`);
  console.log(`  Skipped: ${results.skipped}`);
  console.log(`  Duration: ${duration.toFixed(1)}s`);
  console.log(`\nTokens:`);
  console.log(`  Input: ${results.totalPromptTokens.toLocaleString()}`);
  console.log(`  Output: ${results.totalCompletionTokens.toLocaleString()}`);
  console.log(`\nArtifacts:`);
  console.log(`  Progress: ${runArtifacts.progressPath}`);
  console.log(`  Results: ${runArtifacts.resultsPath}`);
  if (backupPath) {
    console.log(`  Backup: ${backupPath}`);
  }

  if (results.failed > 0) {
    console.log(`\nFailed articles:`);
    for (const item of results.failedItems) {
      console.log(`  - ${item.slug}: ${item.error}`);
    }
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);

  if (runArtifacts?.progressPath && existsSync(runArtifacts.progressPath)) {
    try {
      const existing = JSON.parse(readFileSync(runArtifacts.progressPath, "utf8"));
      existing.status = "fatal_error";
      existing.updatedAt = new Date().toISOString();
      existing.error = error instanceof Error ? error.message : String(error);
      writeFileSync(runArtifacts.progressPath, JSON.stringify(existing, null, 2), "utf8");
    } catch {
      // best effort only
    }
  }

  process.exit(1);
});
