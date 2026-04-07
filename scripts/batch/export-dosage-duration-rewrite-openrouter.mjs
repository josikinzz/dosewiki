#!/usr/bin/env node
/**
 * Export OpenRouter-ready payloads for dosage/duration note rewrites.
 *
 * Reads the previously generated direct-note rewrite queue and emits:
 * - NDJSON item jobs for one-note-at-a-time processing
 * - JSON article payloads for one-article-at-a-time processing
 *
 * Usage:
 *   node scripts/batch/export-dosage-duration-rewrite-openrouter.mjs
 *   node scripts/batch/export-dosage-duration-rewrite-openrouter.mjs --article=2c-b
 *   node scripts/batch/export-dosage-duration-rewrite-openrouter.mjs --limit=10
 *   node scripts/batch/export-dosage-duration-rewrite-openrouter.mjs --model=anthropic/claude-opus-4.5
 */

import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "../..");

const DEFAULT_MODEL = process.env.OPENROUTER_MODEL || "anthropic/claude-opus-4.5";
const DEFAULT_TEMPERATURE = 0.2;
const DEFAULT_MAX_TOKENS = 1200;
const DEFAULT_REASONING_EFFORT = "medium";
const DEFAULT_QUEUE_PATH = join(
  PROJECT_ROOT,
  "notes-and-plans/exports/dosage-duration-direct-note-rewrite-queue.json"
);
const DEFAULT_OUT_DIR = join(PROJECT_ROOT, "notes-and-plans/exports/openrouter");

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    queuePath: DEFAULT_QUEUE_PATH,
    outDir: DEFAULT_OUT_DIR,
    model: DEFAULT_MODEL,
    temperature: DEFAULT_TEMPERATURE,
    maxTokens: DEFAULT_MAX_TOKENS,
    reasoningEffort: DEFAULT_REASONING_EFFORT,
    article: null,
    limit: null,
  };

  for (const arg of args) {
    if (arg.startsWith("--queue=")) {
      options.queuePath = arg.split("=")[1];
    } else if (arg.startsWith("--out-dir=")) {
      options.outDir = arg.split("=")[1];
    } else if (arg.startsWith("--model=")) {
      options.model = arg.split("=")[1];
    } else if (arg.startsWith("--temperature=")) {
      options.temperature = Number.parseFloat(arg.split("=")[1]);
    } else if (arg.startsWith("--max-tokens=")) {
      options.maxTokens = Number.parseInt(arg.split("=")[1], 10);
    } else if (arg.startsWith("--reasoning-effort=")) {
      options.reasoningEffort = arg.split("=")[1];
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
Export OpenRouter-ready payloads for dosage/duration note rewrites.

Usage:
  node scripts/batch/export-dosage-duration-rewrite-openrouter.mjs

Options:
  --queue=<path>              Input queue JSON
  --out-dir=<path>            Output directory
  --model=<id>                OpenRouter model id
  --temperature=<n>           Sampling temperature (default: 0.2)
  --max-tokens=<n>            Max output tokens per request (default: 1200)
  --reasoning-effort=<level>  minimal|low|medium|high|xhigh
  --article=<slug>            Export one article only
  --limit=<n>                 Export first N matching articles
  --help, -h                  Show help
`);
}

function loadQueue(queuePath) {
  return JSON.parse(readFileSync(queuePath, "utf8"));
}

function normalizeArticles(articleQueue, options) {
  let filtered = articleQueue;

  if (options.article) {
    filtered = filtered.filter((entry) => entry.slug === options.article);
  }

  if (typeof options.limit === "number" && Number.isFinite(options.limit) && options.limit > 0) {
    filtered = filtered.slice(0, options.limit);
  }

  return filtered;
}

function buildSystemPrompt() {
  return [
    "You rewrite short dosage and duration note copy for a harm-reduction encyclopedia.",
    "",
    "Requirements:",
    "- Write original reference prose rather than lightly editing the input.",
    "- Preserve factual meaning and safety-critical details from the source note.",
    "- Do not preserve sentence order, distinctive phrasing, or editorial scaffolding from the source.",
    "- Remove source attributions, talk-page references, and manual-review markers unless they are essential user-facing facts.",
    "- Keep the tone concise, neutral, factual, and caution-oriented where relevant.",
    "- Do not add new medical, legal, or pharmacological claims that are not supported by the source note.",
    "",
    "Return JSON only.",
  ].join("\n");
}

function buildItemUserMessage(article, target) {
  return [
    "Rewrite the following single note into original encyclopedic copy.",
    "",
    `Article title: ${article.title}`,
    `Article slug: ${article.slug}`,
    `Section: ${target.section}`,
    `Route: ${target.route || "(none)"}`,
    `Field path: ${target.fieldPath}`,
    "",
    "Source note:",
    target.text,
    "",
    "Return JSON with exactly this shape:",
    "{",
    '  "rewrittenText": "string"',
    "}",
  ].join("\n");
}

function buildArticleUserMessage(article) {
  const blocks = article.targets.map((target, index) => {
    return [
      `Target ${index + 1}`,
      `Field path: ${target.fieldPath}`,
      `Section: ${target.section}`,
      `Route: ${target.route || "(none)"}`,
      "Source note:",
      target.text,
    ].join("\n");
  });

  return [
    "Rewrite every note below into original encyclopedic copy.",
    "",
    `Article title: ${article.title}`,
    `Article slug: ${article.slug}`,
    `Target count: ${article.targets.length}`,
    "",
    blocks.join("\n\n---\n\n"),
    "",
    "Return JSON with exactly this shape:",
    "{",
    '  "rewrites": {',
    '    "field.path.one": "rewritten text",',
    '    "field.path.two": "rewritten text"',
    "  }",
    "}",
    "",
    "Rules for the response:",
    "- Include every field path exactly once.",
    "- Use the field path strings exactly as provided.",
    "- Do not include extra keys or commentary.",
  ].join("\n");
}

function buildItemJob(article, target, articleIndex, targetIndex, options) {
  return {
    jobType: "dosewiki_note_rewrite",
    promptVersion: 1,
    jobId: `${String(articleIndex + 1).padStart(3, "0")}:${article.slug}:${String(targetIndex + 1).padStart(2, "0")}`,
    articleSlug: article.slug,
    articleTitle: article.title,
    section: target.section,
    route: target.route,
    fieldPath: target.fieldPath,
    currentText: target.text,
    openrouter: {
      model: options.model,
      temperature: options.temperature,
      maxTokens: options.maxTokens,
      reasoningEffort: options.reasoningEffort,
      systemPrompt: buildSystemPrompt(),
      userMessage: buildItemUserMessage(article, target),
      responseShape: {
        rewrittenText: "string",
      },
    },
  };
}

function buildArticlePayload(article, articleIndex, options) {
  return {
    queueIndex: articleIndex + 1,
    articleSlug: article.slug,
    articleTitle: article.title,
    targetCount: article.targets.length,
    targets: article.targets.map((target, targetIndex) => ({
      targetIndex: targetIndex + 1,
      fieldPath: target.fieldPath,
      section: target.section,
      route: target.route,
      currentText: target.text,
    })),
    openrouter: {
      model: options.model,
      temperature: options.temperature,
      maxTokens: Math.max(options.maxTokens, 2200),
      reasoningEffort: options.reasoningEffort,
      systemPrompt: buildSystemPrompt(),
      userMessage: buildArticleUserMessage(article),
      responseShape: {
        rewrites: Object.fromEntries(article.targets.map((target) => [target.fieldPath, "string"])),
      },
    },
  };
}

function writeJson(path, value) {
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
}

function main() {
  const options = parseArgs();
  const queue = loadQueue(options.queuePath);
  const articleQueue = normalizeArticles(queue.articleQueue ?? [], options);

  if (articleQueue.length === 0) {
    console.warn("Warning: no matching articles were found in the rewrite queue.");
  }

  mkdirSync(options.outDir, { recursive: true });

  const itemJobs = articleQueue.flatMap((article, articleIndex) =>
    article.targets.map((target, targetIndex) => buildItemJob(article, target, articleIndex, targetIndex, options))
  );
  const articlePayloads = articleQueue.map((article, articleIndex) =>
    buildArticlePayload(article, articleIndex, options)
  );

  const baseName = options.article
    ? `dosage-duration-rewrite-${options.article}`
    : "dosage-duration-rewrite";

  const itemJobsPath = join(options.outDir, `${baseName}-item-jobs.ndjson`);
  const articlePayloadsPath = join(options.outDir, `${baseName}-article-payloads.json`);
  const manifestPath = join(options.outDir, `${baseName}-manifest.json`);

  writeFileSync(itemJobsPath, itemJobs.map((job) => JSON.stringify(job)).join("\n") + "\n");
  writeJson(articlePayloadsPath, {
    generatedAt: new Date().toISOString(),
    sourceQueue: options.queuePath,
    articleCount: articlePayloads.length,
    itemCount: itemJobs.length,
    articlesBySlug: Object.fromEntries(articlePayloads.map((payload) => [payload.articleSlug, payload])),
  });
  writeJson(manifestPath, {
    generatedAt: new Date().toISOString(),
    sourceQueue: options.queuePath,
    model: options.model,
    temperature: options.temperature,
    maxTokens: options.maxTokens,
    reasoningEffort: options.reasoningEffort,
    articleCount: articlePayloads.length,
    itemCount: itemJobs.length,
    outputs: {
      itemJobsPath,
      articlePayloadsPath,
    },
  });

  console.log(JSON.stringify({
    articleCount: articlePayloads.length,
    itemCount: itemJobs.length,
    itemJobsPath,
    articlePayloadsPath,
    manifestPath,
  }, null, 2));
}

main();
