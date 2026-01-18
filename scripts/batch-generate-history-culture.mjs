#!/usr/bin/env node
/**
 * Batch History & Culture Section Generation Script
 *
 * Regenerates history_culture sections using Claude Opus 4.5 via OpenRouter,
 * replacing existing content with fresh AI-generated content.
 *
 * Usage:
 *   export OPENROUTER_API_KEY="sk-or-..."
 *   export VITE_CONVEX_URL="https://..."
 *   node scripts/batch-generate-history-culture.mjs
 *
 * Options:
 *   --dry-run              Preview without API calls or saving
 *   --verbose              Show detailed progress output
 *   --substance=lsd        Process single substance
 *   --concurrency=3        Parallel requests (default: 3)
 *   --limit=5              Process only N articles
 *   --skip-backup          Don't create backup file
 *   --all                  Process all articles with quotes (not just those with existing content)
 *   --new-only             Process only articles with quotes but WITHOUT existing content (skip already done)
 */

import { readFileSync, writeFileSync, existsSync, copyFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";
import yaml from "yaml";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");

// Greek letter to ASCII mapping for field name sanitization (Convex requirement)
const GREEK_TO_ASCII = {
  'α': 'alpha', 'β': 'beta', 'γ': 'gamma', 'δ': 'delta', 'ε': 'epsilon',
  'ζ': 'zeta', 'η': 'eta', 'θ': 'theta', 'ι': 'iota', 'κ': 'kappa',
  'λ': 'lambda', 'μ': 'mu', 'ν': 'nu', 'ξ': 'xi', 'ο': 'omicron',
  'π': 'pi', 'ρ': 'rho', 'σ': 'sigma', 'τ': 'tau', 'υ': 'upsilon',
  'φ': 'phi', 'χ': 'chi', 'ψ': 'psi', 'ω': 'omega',
};

function sanitizeFieldName(name) {
  let result = name;
  for (const [greek, ascii] of Object.entries(GREEK_TO_ASCII)) {
    result = result.replace(new RegExp(greek, 'g'), ascii);
  }
  return result.replace(/[^\x00-\x7F]/g, '_');
}

function sanitizeObjectKeys(obj) {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(sanitizeObjectKeys);
  if (typeof obj !== 'object') return obj;
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    result[sanitizeFieldName(key)] = sanitizeObjectKeys(value);
  }
  return result;
}

// Configuration
const CONFIG = {
  model: "anthropic/claude-opus-4.5",
  maxTokens: 16384,
  temperature: 0.3,
  maxConcurrency: 3,
  retryAttempts: 3,
  retryDelayMs: 2000,
  reasoningEffort: "high",
  articlesFile: join(PROJECT_ROOT, "src/data/articles.json"),
  quotesDir: join(PROJECT_ROOT, "history-culture-quotes"),
  costsFile: join(PROJECT_ROOT, "batch-history-culture-costs.json"),
  backupFile: join(PROJECT_ROOT, "src/data/articles.backup.json"),
  progressFile: join(PROJECT_ROOT, "batch-history-culture-progress.json"),
};

// Pricing for cost estimation (per 1M tokens)
const PRICING = {
  "anthropic/claude-opus-4.5": {
    input: 15.00,
    output: 75.00,
  },
};

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    concurrency: CONFIG.maxConcurrency,
    dryRun: false,
    verbose: false,
    substance: null,
    limit: null,
    skipBackup: false,
    all: false,
    newOnly: false,
  };

  for (const arg of args) {
    if (arg.startsWith("--concurrency=")) {
      options.concurrency = parseInt(arg.split("=")[1], 10);
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--verbose") {
      options.verbose = true;
    } else if (arg.startsWith("--substance=")) {
      options.substance = arg.split("=")[1];
    } else if (arg.startsWith("--limit=")) {
      options.limit = parseInt(arg.split("=")[1], 10);
    } else if (arg === "--skip-backup") {
      options.skipBackup = true;
    } else if (arg === "--all") {
      options.all = true;
    } else if (arg === "--new-only") {
      options.newOnly = true;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
  }

  return options;
}

function printHelp() {
  console.log(`
Batch History & Culture Section Generation Script

Regenerates history_culture sections using Claude Opus 4.5 via OpenRouter.

Usage:
  export OPENROUTER_API_KEY="sk-or-..."
  export VITE_CONVEX_URL="https://..."
  node scripts/batch-generate-history-culture.mjs

Options:
  --dry-run              Preview without API calls or saving
  --verbose              Show detailed progress output
  --substance=<slug>     Process single substance only
  --concurrency=<n>      Number of parallel API requests (default: 3)
  --limit=<n>            Process at most N items then stop
  --skip-backup          Don't create backup file
  --all                  Process all articles with quotes (not just those with existing content)
  --new-only             Process only articles with quotes but WITHOUT existing content (skip already done)
  --help, -h             Show this help message

Examples:
  node scripts/batch-generate-history-culture.mjs --substance=lsd --dry-run
  node scripts/batch-generate-history-culture.mjs --limit=5
  node scripts/batch-generate-history-culture.mjs --concurrency=5 --verbose
  node scripts/batch-generate-history-culture.mjs --all  # Process all 249 with quotes
`);
}

// Convert title to slug
function titleToSlug(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Load articles from JSON
function loadArticles() {
  if (!existsSync(CONFIG.articlesFile)) {
    console.error("Error: articles.json not found at", CONFIG.articlesFile);
    process.exit(1);
  }
  return JSON.parse(readFileSync(CONFIG.articlesFile, "utf-8"));
}

// Save articles to JSON
function saveArticles(articles) {
  writeFileSync(CONFIG.articlesFile, JSON.stringify(articles, null, 2), "utf-8");
}

// Create backup of articles.json
function createBackup() {
  if (existsSync(CONFIG.articlesFile)) {
    copyFileSync(CONFIG.articlesFile, CONFIG.backupFile);
    console.log(`Backup created: ${CONFIG.backupFile}`);
  }
}

// Load history culture quotes for a substance from Convex
async function loadHistoryCultureQuotes(slug) {
  try {
    const quote = await convexClient.query(api.quotes.getBySlugAndSection, {
      slug,
      section: "history_culture",
    });
    return quote?.content ?? null;
  } catch (error) {
    console.error(`  Error loading quotes for ${slug}:`, error.message);
    return null;
  }
}

// Check if article has existing history_culture content
function hasExistingHistoryCulture(article) {
  const hc = article.history_culture;
  if (!hc) return false;

  return !!(
    hc.content?.trim() ||
    (hc.sections && hc.sections.length > 0 && hc.sections.some(s => s.content?.trim()))
  );
}

// Convex client (initialized in main)
let convexClient = null;

// Initialize Convex client
function initConvexClient(convexUrl) {
  convexClient = new ConvexHttpClient(convexUrl);
  return convexClient;
}

// Load section prompt from Convex
async function loadPromptFromConvex() {
  const prompt = await convexClient.query(api.prompts.getByKey, { key: "section_history_culture" });

  if (!prompt) {
    throw new Error("section_history_culture prompt not found in Convex. Run the migration script first.");
  }

  return prompt.content;
}

// Build user message for Fresh Slate mode
function buildUserMessage(article, quotes) {
  // Remove history_culture section for Fresh Slate mode
  const filtered = { ...article };
  delete filtered.history_culture;

  const articleYaml = yaml.stringify(filtered, { lineWidth: 0, nullStr: "" });

  return `## Current Article Context

Below is the current state of the article (history_culture section excluded). Use this to understand what exists elsewhere and avoid duplication.

\`\`\`yaml
${articleYaml}
\`\`\`

## Extracted History & Culture Information

Generate the history_culture section from scratch based on these sources:

${quotes}

## Instructions

Generate the history_culture section from scratch based on the provided sources.`;
}

// Call OpenRouter API (non-streaming)
async function callOpenRouter(apiKey, systemPrompt, userMessage) {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://dose.wiki",
      "X-Title": "Dose.wiki Batch History Culture Generator",
    },
    body: JSON.stringify({
      model: CONFIG.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: CONFIG.temperature,
      max_tokens: CONFIG.maxTokens,
      reasoning: { effort: CONFIG.reasoningEffort },
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    const status = response.status;

    if (status === 429) {
      throw { status: 429, message: "Rate limited", retryable: true };
    } else if (status === 402) {
      throw { status: 402, message: "Insufficient credits", retryable: false };
    } else if (status >= 500) {
      throw { status, message: `Server error: ${status}`, retryable: true };
    }

    throw { status, message: error.error?.message || `API error: ${status}`, retryable: false };
  }

  const data = await response.json();
  const usage = data.usage || {};

  return {
    content: data.choices?.[0]?.message?.content || "",
    usage: {
      promptTokens: usage.prompt_tokens || 0,
      completionTokens: usage.completion_tokens || 0,
      totalTokens: usage.total_tokens || 0,
    },
  };
}

// Retry wrapper with exponential backoff
async function callWithRetry(fn, attempts = CONFIG.retryAttempts) {
  let lastError;

  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      if (!e.retryable) throw e;

      const delay = CONFIG.retryDelayMs * Math.pow(2, i);
      console.log(`  Retry ${i + 1}/${attempts} after ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

// Parse generated YAML from response
function parseGeneratedYaml(response) {
  // Extract YAML from markdown code blocks
  const yamlMatch = response.match(/```ya?ml\s*([\s\S]*?)```/);
  const yamlContent = yamlMatch ? yamlMatch[1].trim() : response.trim();

  try {
    const parsed = yaml.parse(yamlContent);

    // Handle case where the response wraps in a "history_culture" key
    if (parsed.history_culture) {
      return parsed.history_culture;
    }

    // Validate expected structure - history_culture has these fields
    if (
      parsed.content !== undefined ||
      parsed.sections !== undefined
    ) {
      return parsed;
    }

    throw new Error("Invalid history_culture structure - missing expected fields");
  } catch (error) {
    throw new Error(`Failed to parse YAML: ${error.message}`);
  }
}

// Process a single article
async function processArticle(apiKey, article, systemPrompt, verbose) {
  const slug = titleToSlug(article.title);

  // Load history culture quotes from Convex
  const quotes = await loadHistoryCultureQuotes(slug);
  if (!quotes) {
    return { slug, status: "skipped", reason: "No history culture quotes in Convex", tokens: 0 };
  }

  // Build user message
  const userMessage = buildUserMessage(article, quotes);

  // Call API with retry
  const result = await callWithRetry(() =>
    callOpenRouter(apiKey, systemPrompt, userMessage)
  );

  // Parse the generated YAML
  const newHistoryCulture = parseGeneratedYaml(result.content);

  if (verbose) {
    console.log(`  Generated history_culture for ${slug}:`);
    console.log(`    content: ${newHistoryCulture.content ? "yes" : "no"}`);
    console.log(`    sections: ${newHistoryCulture.sections?.length || 0}`);
  }

  return {
    slug,
    status: "success",
    history_culture: newHistoryCulture,
    tokens: result.usage.totalTokens,
    promptTokens: result.usage.promptTokens,
    completionTokens: result.usage.completionTokens,
  };
}

// Load costs file
function loadCosts() {
  if (!existsSync(CONFIG.costsFile)) {
    return { runs: [], totalCost: "$0.00", totalArticles: 0 };
  }
  try {
    return JSON.parse(readFileSync(CONFIG.costsFile, "utf-8"));
  } catch {
    return { runs: [], totalCost: "$0.00", totalArticles: 0 };
  }
}

// Save costs file
function saveCosts(costs) {
  writeFileSync(CONFIG.costsFile, JSON.stringify(costs, null, 2), "utf-8");
}

// Calculate estimated cost
function calculateCost(promptTokens, completionTokens) {
  const pricing = PRICING[CONFIG.model];
  return (promptTokens / 1_000_000) * pricing.input +
         (completionTokens / 1_000_000) * pricing.output;
}

// Write progress to file for cross-terminal monitoring
function writeProgress(state) {
  writeFileSync(CONFIG.progressFile, JSON.stringify(state, null, 2), "utf-8");
}

// Process articles with controlled concurrency
async function processAll(apiKey, articles, systemPrompt, options) {
  const { concurrency, verbose, dryRun } = options;

  // Track progress
  let completed = 0;
  let failed = 0;
  let skipped = 0;
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  const failedItems = [];
  const successfulUpdates = [];

  const total = articles.length;
  const startTime = new Date().toISOString();

  // Write initial progress
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
    estimatedCost: 0,
  });

  // Process in batches
  for (let i = 0; i < articles.length; i += concurrency) {
    const batch = articles.slice(i, i + concurrency);
    const batchTitles = batch.map(a => a.title);

    // Update progress with current batch
    writeProgress({
      status: "running",
      current: completed + failed + skipped,
      total,
      completed,
      failed,
      skipped,
      currentBatch: batchTitles,
      startTime,
      inputTokens: totalPromptTokens,
      outputTokens: totalCompletionTokens,
      estimatedCost: calculateCost(totalPromptTokens, totalCompletionTokens),
    });

    const promises = batch.map(async (article) => {
      const slug = titleToSlug(article.title);

      if (verbose) {
        console.log(`  Processing: ${article.title}`);
      }

      if (dryRun) {
        const quotes = await loadHistoryCultureQuotes(slug);
        return {
          slug,
          title: article.title,
          status: quotes ? "dry-run" : "would-skip",
          reason: quotes ? null : "No history culture quotes in Convex",
          tokens: 0,
        };
      }

      try {
        const result = await processArticle(apiKey, article, systemPrompt, verbose);

        if (result.status === "success") {
          totalPromptTokens += result.promptTokens;
          totalCompletionTokens += result.completionTokens;
          successfulUpdates.push({
            title: article.title,
            history_culture: result.history_culture,
          });
          if (verbose) {
            console.log(`  Completed: ${slug} (${result.tokens} tokens)`);
          }
        } else if (verbose) {
          console.log(`  Skipped: ${slug} - ${result.reason}`);
        }

        return result;
      } catch (error) {
        console.error(`  Failed: ${slug} - ${error.message}`);
        return { slug, title: article.title, status: "failed", error: error.message };
      }
    });

    const results = await Promise.all(promises);

    // Update counts
    for (const result of results) {
      if (result.status === "success" || result.status === "dry-run") {
        completed++;
      } else if (result.status === "skipped" || result.status === "would-skip") {
        skipped++;
      } else if (result.status === "failed") {
        failed++;
        failedItems.push({ slug: result.slug, title: result.title, error: result.error });
      }
    }

    // Progress update
    const done = completed + failed + skipped;
    process.stdout.write(`\rProgress: ${done}/${total} (${completed} ok, ${failed} failed, ${skipped} skipped)`);

    // Write progress after batch completes
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
      estimatedCost: calculateCost(totalPromptTokens, totalCompletionTokens),
    });
  }

  console.log(); // New line after progress

  // Write final progress
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
    estimatedCost: calculateCost(totalPromptTokens, totalCompletionTokens),
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

// Main function
async function main() {
  const options = parseArgs();

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey && !options.dryRun) {
    console.error("Error: OPENROUTER_API_KEY environment variable is required");
    process.exit(1);
  }

  const convexUrl = process.env.CONVEX_URL || process.env.VITE_CONVEX_URL;
  if (!convexUrl) {
    console.error("Error: CONVEX_URL or VITE_CONVEX_URL environment variable is required");
    process.exit(1);
  }

  console.log("\nBatch History & Culture Section Generation");
  console.log("=".repeat(50));
  console.log(`Model: ${CONFIG.model}`);
  console.log(`Reasoning Effort: ${CONFIG.reasoningEffort}`);
  console.log(`Concurrency: ${options.concurrency}`);
  console.log(`Mode: ${options.newOnly ? "Only NEW articles (with quotes, no existing content)" : options.all ? "All articles with quotes" : "Only articles with existing content"}`);

  // Initialize Convex client
  initConvexClient(convexUrl);

  // Load system prompt from Convex
  console.log("\nLoading prompt from Convex...");
  let systemPrompt;
  try {
    systemPrompt = await loadPromptFromConvex();
    console.log(`  Prompt loaded: ${systemPrompt.length.toLocaleString()} chars`);
  } catch (error) {
    console.error(`Error loading prompt: ${error.message}`);
    process.exit(1);
  }

  // Load articles
  const allArticles = loadArticles();

  // Filter articles to process
  let articles = allArticles.filter(a =>
    a.priority === "high" || a.priority === "normal"
  );
  console.log(`\nPriority articles (high/normal): ${articles.length}`);

  // Filter by specific substance if requested
  if (options.substance) {
    articles = articles.filter(a =>
      titleToSlug(a.title) === options.substance
    );
    if (articles.length === 0) {
      console.error(`Error: No article found for slug "${options.substance}"`);
      process.exit(1);
    }
    console.log(`Filtered to substance: ${options.substance}`);
  } else if (options.newOnly) {
    // Only articles with quotes but WITHOUT existing content
    const beforeCount = articles.length;
    articles = articles.filter(a => {
      const slug = titleToSlug(a.title);
      const hasQuotes = existsSync(join(CONFIG.quotesDir, `${slug}-history-culture.md`));
      return hasQuotes && !hasExistingHistoryCulture(a);
    });
    console.log(`Filtered to articles with quotes but NO existing content: ${articles.length} (of ${beforeCount})`);
  } else if (!options.all) {
    // Default: only articles with existing history_culture content
    const beforeCount = articles.length;
    articles = articles.filter(hasExistingHistoryCulture);
    console.log(`Filtered to articles with existing history_culture: ${articles.length} (of ${beforeCount})`);
  }

  // Apply limit
  if (options.limit && articles.length > options.limit) {
    articles = articles.slice(0, options.limit);
    console.log(`Limited to: ${articles.length} items`);
  }

  if (articles.length === 0) {
    console.log("\nNo articles to process.");
    return;
  }

  // Dry run preview
  if (options.dryRun) {
    console.log("\n[DRY RUN] Would process:");
    for (const article of articles.slice(0, 20)) {
      const slug = titleToSlug(article.title);
      const quotes = await loadHistoryCultureQuotes(slug);
      const hasExisting = hasExistingHistoryCulture(article);
      const status = quotes ? "has quotes" : "NO QUOTES";
      const existing = hasExisting ? "(has content)" : "(no content)";
      console.log(`  - ${article.title} ${existing} [${status}]`);
    }
    if (articles.length > 20) {
      console.log(`  ... and ${articles.length - 20} more`);
    }
    return;
  }

  // Create backup
  if (!options.skipBackup) {
    createBackup();
  }

  console.log(`\nProcessing ${articles.length} articles...\n`);

  const startTime = Date.now();

  const results = await processAll(apiKey, articles, systemPrompt, options);

  const endTime = Date.now();
  const duration = (endTime - startTime) / 1000;

  // Apply updates to articles
  if (results.successfulUpdates.length > 0) {
    console.log(`\nApplying ${results.successfulUpdates.length} updates to articles.json...`);

    const articlesMap = new Map(allArticles.map(a => [a.title, a]));

    for (const update of results.successfulUpdates) {
      const article = articlesMap.get(update.title);
      if (article) {
        article.history_culture = update.history_culture;
      }
    }

    saveArticles(allArticles);
    console.log("Articles saved successfully.");

    // Sync updated articles to Convex (batch, with field name sanitization)
    console.log(`\nSyncing ${results.successfulUpdates.length} articles to Convex...`);
    try {
      const updatedArticles = results.successfulUpdates.map(u =>
        allArticles.find(a => a.title === u.title)
      ).filter(Boolean);

      // Sanitize field names (Greek letters → ASCII) for Convex compatibility
      const sanitizedArticles = updatedArticles.map(sanitizeObjectKeys);

      // Use batch saveArticles instead of per-article saveArticle
      const result = await convexClient.mutation(api.articles.saveArticles, {
        articles: sanitizedArticles,
      });
      console.log(`Convex sync complete (${result.created} created, ${result.updated} updated).`);
    } catch (syncError) {
      console.error("Warning: Convex sync failed:", syncError.message);
      console.error("Run manually: CONVEX_URL=... node scripts/migrate-articles-to-convex.mjs");
    }
  }

  const estimatedCost = calculateCost(results.totalPromptTokens, results.totalCompletionTokens);

  // Summary
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
  console.log(`  Estimated Cost: $${estimatedCost.toFixed(2)}`);
  console.log(`  Avg Cost/Article: $${(estimatedCost / Math.max(results.completed, 1)).toFixed(4)}`);

  // Log costs
  const costs = loadCosts();
  const runCost = estimatedCost;
  costs.runs.push({
    timestamp: new Date().toISOString(),
    articlesProcessed: results.completed,
    inputTokens: results.totalPromptTokens,
    outputTokens: results.totalCompletionTokens,
    estimatedCost: `$${runCost.toFixed(4)}`,
    avgCostPerArticle: `$${(runCost / Math.max(results.completed, 1)).toFixed(4)}`,
    model: CONFIG.model,
    durationSeconds: duration,
  });

  // Update totals
  const totalCost = costs.runs.reduce((sum, r) => {
    const cost = parseFloat(r.estimatedCost.replace("$", ""));
    return sum + (isNaN(cost) ? 0 : cost);
  }, 0);
  costs.totalCost = `$${totalCost.toFixed(2)}`;
  costs.totalArticles = costs.runs.reduce((sum, r) => sum + r.articlesProcessed, 0);

  saveCosts(costs);
  console.log(`\nCost log saved to: ${CONFIG.costsFile}`);

  if (results.failed > 0) {
    console.log(`\nFailed articles:`);
    for (const item of results.failedItems) {
      console.log(`  - ${item.title}: ${item.error}`);
    }
  }

  // Reminder to rebuild compressed articles
  if (results.successfulUpdates.length > 0) {
    console.log("\n" + "=".repeat(50));
    console.log("IMPORTANT: Run the following to rebuild compressed articles:");
    console.log("  node scripts/build/buildCompressedArticles.mjs");
    console.log("(Convex sync already complete)");
    console.log("=".repeat(50));
  }
}

main().catch(error => {
  console.error("Fatal error:", error);
  process.exit(1);
});
