#!/usr/bin/env node
/**
 * Batch Harm Potential Section Generation Script
 *
 * Regenerates harm_potential sections using Claude Opus 4.5 via OpenRouter,
 * replacing existing content with fresh AI-generated content.
 *
 * Usage:
 *   export OPENROUTER_API_KEY="sk-or-..."
 *   export VITE_CONVEX_URL="https://..."
 *   node scripts/batch-generate-harm-potential.mjs
 *
 * Options:
 *   --dry-run              Preview without API calls or saving
 *   --verbose              Show detailed progress output
 *   --substance=lsd        Process single substance
 *   --slugs=lsd,mdma,dmt   Process multiple substances by comma-separated slugs
 *   --concurrency=3        Parallel requests (default: 3)
 *   --limit=5              Process only N articles
 *   --skip-backup          Don't create backup file
 *   --all                  Process all articles with quotes (not just those with existing content)
 */

import { readFileSync, writeFileSync, existsSync, copyFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api.js";
import { callOpenRouterChat } from "../lib/openrouter-sdk.mjs";
import { printBatchBanner, printBatchSummary, runBatchGenerator } from "./lib/generator-runner.mjs";
import yaml from "yaml";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "../..");

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
  model: process.env.OPENROUTER_MODEL || "anthropic/claude-opus-4.5",
  maxTokens: 16384,
  temperature: 0.3,
  maxConcurrency: 3,
  retryAttempts: 3,
  retryDelayMs: 2000,
  reasoningEffort: "high", // For Anthropic models with extended thinking
  articlesFile: join(PROJECT_ROOT, "src/data/SubstanceIndex.json"),
  quotesDir: join(PROJECT_ROOT, "quotes/harmpotential-quotes"),
  backupFile: join(PROJECT_ROOT, "src/data/backups/articles.backup.json"),
};

// Security bounds for input validation (VULN-05 remediation)
const INPUT_BOUNDS = {
  concurrency: { min: 1, max: 50 },
  limit: { min: 1, max: 10000 },
};

// Parse command line arguments with bounds validation
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    concurrency: CONFIG.maxConcurrency,
    dryRun: false,
    verbose: false,
    substance: null,
    slugs: null,
    limit: null,
    skipBackup: false,
    all: false,
    newOnly: false,
  };

  for (const arg of args) {
    if (arg.startsWith("--concurrency=")) {
      const value = parseInt(arg.split("=")[1], 10);
      // Bounds validation to prevent resource exhaustion
      options.concurrency = Math.min(
        Math.max(isNaN(value) ? CONFIG.maxConcurrency : value, INPUT_BOUNDS.concurrency.min),
        INPUT_BOUNDS.concurrency.max
      );
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--verbose") {
      options.verbose = true;
    } else if (arg.startsWith("--substance=")) {
      options.substance = arg.split("=")[1];
    } else if (arg.startsWith("--slugs=")) {
      options.slugs = arg.split("=")[1].split(",").map(s => s.trim());
    } else if (arg.startsWith("--limit=")) {
      const value = parseInt(arg.split("=")[1], 10);
      // Bounds validation to prevent excessive processing
      options.limit = Math.min(
        Math.max(isNaN(value) ? null : value, INPUT_BOUNDS.limit.min),
        INPUT_BOUNDS.limit.max
      );
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
Batch Harm Potential Section Generation Script

Regenerates harm_potential sections using Claude Opus 4.5 via OpenRouter.

Usage:
  export OPENROUTER_API_KEY="sk-or-..."
  export VITE_CONVEX_URL="https://..."
  node scripts/batch-generate-harm-potential.mjs

Options:
  --dry-run              Preview without API calls or saving
  --verbose              Show detailed progress output
  --substance=<slug>     Process single substance only
  --slugs=<slug1,slug2>  Process multiple substances by comma-separated slugs
  --concurrency=<n>      Number of parallel API requests (default: 3)
  --limit=<n>            Process at most N items then stop
  --skip-backup          Don't create backup file
  --all                  Process all articles with quotes (not just those with existing content)
  --new-only             Process only articles with quotes that haven't been regenerated with new schema
  --help, -h             Show this help message

Examples:
  node scripts/batch-generate-harm-potential.mjs --substance=ketamine --dry-run
  node scripts/batch-generate-harm-potential.mjs --slugs=lsd,mdma,dmt --concurrency=3
  node scripts/batch-generate-harm-potential.mjs --limit=5
  node scripts/batch-generate-harm-potential.mjs --concurrency=5 --verbose
  node scripts/batch-generate-harm-potential.mjs --all  # Process all 505 with quotes
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
    console.error("Error: SubstanceIndex.json not found at", CONFIG.articlesFile);
    process.exit(1);
  }
  return JSON.parse(readFileSync(CONFIG.articlesFile, "utf-8"));
}

// Save articles to JSON
function saveArticles(articles) {
  writeFileSync(CONFIG.articlesFile, JSON.stringify(articles, null, 2), "utf-8");
}

// Create backup of SubstanceIndex.json
function createBackup() {
  if (existsSync(CONFIG.articlesFile)) {
    copyFileSync(CONFIG.articlesFile, CONFIG.backupFile);
    console.log(`Backup created: ${CONFIG.backupFile}`);
  }
}

// Load harm potential quotes for a substance from Convex
async function loadHarmPotentialQuotes(slug) {
  try {
    const quote = await convexClient.query(api.quotes.getBySlugAndSection, {
      slug,
      section: "harm_potential",
    });
    return quote?.content ?? null;
  } catch (error) {
    console.error(`  Error loading quotes for ${slug}:`, error.message);
    return null;
  }
}

// Check if article has existing harm_potential content (supports both old and new schema)
function hasExistingHarmPotential(article) {
  const hp = article.harm_potential;
  if (!hp) return false;

  // Check new schema format (psychosis/seizure at top level, no risks wrapper)
  const hasNewFormat = !!(
    hp.addiction?.psychological?.description?.trim() ||
    hp.addiction?.physical_dependence?.description?.trim() ||
    hp.toxicity?.ld50?.length > 0 ||
    hp.toxicity?.organ_toxicity?.length > 0 ||
    hp.toxicity?.carcinogenicity?.description?.trim() ||
    hp.toxicity?.antibiotic_function?.description?.trim() ||
    hp.psychosis?.description?.trim() ||
    hp.seizure?.description?.trim()
  );

  // Check old schema format (for backwards compatibility - has risks wrapper)
  const hasOldFormat = !!(
    hp.addiction_liability?.trim() ||
    hp.dependence_liability?.trim() ||
    (typeof hp.toxicity?.ld50 === 'string' && hp.toxicity?.ld50?.trim()) ||
    (typeof hp.toxicity?.organ_toxicity === 'string' && hp.toxicity?.organ_toxicity?.trim()) ||
    hp.risks?.psychosis?.description?.trim() ||
    hp.risks?.seizure?.description?.trim() ||
    (typeof hp.risks?.psychosis === 'string' && hp.risks?.psychosis?.trim()) ||
    (typeof hp.risks?.seizure === 'string' && hp.risks?.seizure?.trim())
  );

  return hasNewFormat || hasOldFormat;
}

// Check if article has been regenerated with the NEW schema specifically
// (distinguishes from old schema that had risks.psychosis wrapper)
function hasNewSchemaHarmPotential(article) {
  const hp = article.harm_potential;
  if (!hp) return false;

  // New schema indicators:
  // - psychosis is at top level with level/description (not under risks)
  // - addiction has psychological.level/description structure
  return !!(
    hp.psychosis?.level ||
    hp.psychosis?.description?.trim() ||
    hp.addiction?.psychological?.level ||
    hp.addiction?.psychological?.description?.trim()
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
  const prompt = await convexClient.query(api.prompts.getByKey, { key: "section_harm_potential" });

  if (!prompt) {
    throw new Error("section_harm_potential prompt not found in Convex. Run the migration script first.");
  }

  return prompt.content;
}

// Build user message (lightweight - no full article context to save tokens)
function buildUserMessage(article, quotes) {
  // Only include substance name and classification for context
  const context = {
    title: article.title,
    psychoactive_class: article.classification?.psychoactive_class || [],
    chemical_class: article.classification?.chemical_class || [],
  };

  return `## Substance

**${context.title}**
- Psychoactive class: ${context.psychoactive_class.join(", ") || "Unknown"}
- Chemical class: ${context.chemical_class.join(", ") || "Unknown"}

## Source Material

Generate the harm_potential section based on these extracted quotes:

${quotes}

## Instructions

Generate ONLY the harm_potential section as valid YAML. Do not include information that belongs in other sections (pharmacology, interactions, tolerance, dosage, duration, legality).`;
}

// Call OpenRouter API (non-streaming)
async function callOpenRouter(apiKey, systemPrompt, userMessage) {
  return callOpenRouterChat({
    apiKey,
    appTitle: "Dose.wiki Batch Harm Potential Generator",
    model: CONFIG.model,
    systemPrompt,
    userMessage,
    temperature: CONFIG.temperature,
    maxTokens: CONFIG.maxTokens,
    reasoningEffort: CONFIG.reasoningEffort,
  });
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

    // Handle case where the response wraps in a "harm_potential" key
    let hp = parsed.harm_potential || parsed;

    // Validate expected structure for new schema (psychosis/seizure at top level)
    if (
      hp.addiction !== undefined ||
      hp.toxicity !== undefined ||
      hp.psychosis !== undefined ||
      hp.seizure !== undefined
    ) {
      // Normalize and validate the structure
      return normalizeHarmPotential(hp);
    }

    throw new Error("Invalid harm_potential structure - missing expected fields (addiction, toxicity, psychosis, seizure)");
  } catch (error) {
    throw new Error(`Failed to parse YAML: ${error.message}`);
  }
}

// Normalize harm_potential to ensure all required fields exist with correct types
function normalizeHarmPotential(hp) {
  // Handle lethal_dosage - can be nested under toxicity.lethal_dosage or legacy toxicity.ld50
  const lethalDosage = hp.toxicity?.lethal_dosage;
  const legacyLd50 = hp.toxicity?.ld50;

  // Extract ld50 array: prefer lethal_dosage.ld50 > legacy ld50 > empty array
  let ld50Array = [];
  if (lethalDosage?.ld50 && Array.isArray(lethalDosage.ld50)) {
    ld50Array = lethalDosage.ld50;
  } else if (Array.isArray(legacyLd50)) {
    ld50Array = legacyLd50;
  }

  // Extract notes from lethal_dosage
  const lethalDosageNotes = lethalDosage?.notes ?? "";

  const normalized = {
    addiction: {
      psychological: {
        level: hp.addiction?.psychological?.level ?? null,
        description: hp.addiction?.psychological?.description ?? "",
      },
      physical_dependence: {
        level: hp.addiction?.physical_dependence?.level ?? null,
        description: hp.addiction?.physical_dependence?.description ?? "",
      },
    },
    toxicity: {
      // New structure: lethal_dosage with notes and ld50
      lethal_dosage: {
        notes: lethalDosageNotes,
        ld50: ld50Array,
      },
      organ_toxicity: Array.isArray(hp.toxicity?.organ_toxicity) ? hp.toxicity.organ_toxicity : [],
      carcinogenicity: {
        level: hp.toxicity?.carcinogenicity?.level ?? null,
        evidence: hp.toxicity?.carcinogenicity?.evidence ?? null,
        description: hp.toxicity?.carcinogenicity?.description ?? "",
      },
      antibiotic_function: {
        level: hp.toxicity?.antibiotic_function?.level ?? null,
        description: hp.toxicity?.antibiotic_function?.description ?? "",
      },
    },
    psychosis: {
      level: hp.psychosis?.level ?? null,
      description: hp.psychosis?.description ?? "",
    },
    seizure: {
      level: hp.seizure?.level ?? null,
      description: hp.seizure?.description ?? "",
    },
  };

  // Validate severity level enums
  const validRiskLevels = ["extremely_low", "low", "moderate", "high", "extremely_high", null];
  const validCarcinogenicityLevels = ["confirmed", "probable", "possible", "no_evidence", "unknown", null];

  // Validate addiction levels
  if (!validRiskLevels.includes(normalized.addiction.psychological.level)) {
    normalized.addiction.psychological.level = null;
  }
  if (!validRiskLevels.includes(normalized.addiction.physical_dependence.level)) {
    normalized.addiction.physical_dependence.level = null;
  }

  // Validate carcinogenicity level
  if (!validCarcinogenicityLevels.includes(normalized.toxicity.carcinogenicity.level)) {
    normalized.toxicity.carcinogenicity.level = null;
  }

  // Validate antibiotic function level (uses same levels as carcinogenicity)
  if (!validCarcinogenicityLevels.includes(normalized.toxicity.antibiotic_function.level)) {
    normalized.toxicity.antibiotic_function.level = null;
  }

  // Validate psychosis and seizure levels
  if (!validRiskLevels.includes(normalized.psychosis.level)) {
    normalized.psychosis.level = null;
  }
  if (!validRiskLevels.includes(normalized.seizure.level)) {
    normalized.seizure.level = null;
  }

  return normalized;
}

// Process a single article
async function processArticle(apiKey, article, systemPrompt, verbose) {
  const slug = titleToSlug(article.title);

  // Load harm potential quotes from Convex
  const quotes = await loadHarmPotentialQuotes(slug);
  if (!quotes) {
    return { slug, status: "skipped", reason: "No harm potential quotes in Convex", tokens: 0 };
  }

  // Build user message
  const userMessage = buildUserMessage(article, quotes);

  // Call API with retry
  const result = await callWithRetry(() =>
    callOpenRouter(apiKey, systemPrompt, userMessage)
  );

  // Parse the generated YAML
  const newHarmPotential = parseGeneratedYaml(result.content);

  if (verbose) {
    console.log(`  Generated harm_potential for ${slug}:`);
    console.log(`    psychological addiction: ${newHarmPotential.addiction?.psychological?.description ? "yes" : "no"} (level: ${newHarmPotential.addiction?.psychological?.level || "null"})`);
    console.log(`    physical dependence: ${newHarmPotential.addiction?.physical_dependence?.description ? "yes" : "no"} (level: ${newHarmPotential.addiction?.physical_dependence?.level || "null"})`);
    console.log(`    lethal_dosage.notes: ${newHarmPotential.toxicity?.lethal_dosage?.notes ? "yes" : "no"} (${(newHarmPotential.toxicity?.lethal_dosage?.notes?.length || 0)} chars)`);
    console.log(`    lethal_dosage.ld50 entries: ${newHarmPotential.toxicity?.lethal_dosage?.ld50?.length || 0}`);
    console.log(`    organ toxicity entries: ${newHarmPotential.toxicity?.organ_toxicity?.length || 0}`);
    console.log(`    carcinogenicity: ${newHarmPotential.toxicity?.carcinogenicity?.description ? "yes" : "no"} (level: ${newHarmPotential.toxicity?.carcinogenicity?.level || "null"})`);
    console.log(`    psychosis: ${newHarmPotential.psychosis?.description ? "yes" : "no"} (level: ${newHarmPotential.psychosis?.level || "null"})`);
    console.log(`    seizure: ${newHarmPotential.seizure?.description ? "yes" : "no"} (level: ${newHarmPotential.seizure?.level || "null"})`);
  }

  return {
    slug,
    status: "success",
    harm_potential: newHarmPotential,
    tokens: result.usage.totalTokens,
    promptTokens: result.usage.promptTokens,
    completionTokens: result.usage.completionTokens,
  };
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

  // Process in batches
  for (let i = 0; i < articles.length; i += concurrency) {
    const batch = articles.slice(i, i + concurrency);

    const promises = batch.map(async (article) => {
      const slug = titleToSlug(article.title);

      if (verbose) {
        console.log(`  Processing: ${article.title}`);
      }

      if (dryRun) {
        const quotes = await loadHarmPotentialQuotes(slug);
        return {
          slug,
          title: article.title,
          status: quotes ? "dry-run" : "would-skip",
          reason: quotes ? null : "No harm potential quotes in Convex",
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
            harm_potential: result.harm_potential,
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
  }

  console.log(); // New line after progress

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
async function main(options) {

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

  printBatchBanner({
    title: "Batch Harm Potential Section Generation",
    config: CONFIG,
    options,
    details: [
      {
        label: "Mode",
        value: options.newOnly
          ? "Articles with quotes but no new schema"
          : options.all
            ? "All articles with quotes"
            : "Only articles with existing content",
      },
    ],
  });

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
  } else if (options.slugs) {
    // Filter by multiple slugs
    articles = articles.filter(a =>
      options.slugs.includes(titleToSlug(a.title))
    );
    if (articles.length === 0) {
      console.error(`Error: No articles found for slugs: ${options.slugs.join(", ")}`);
      process.exit(1);
    }
    const notFound = options.slugs.filter(slug =>
      !articles.some(a => titleToSlug(a.title) === slug)
    );
    if (notFound.length > 0) {
      console.warn(`Warning: Slugs not found: ${notFound.join(", ")}`);
    }
    console.log(`Filtered to ${articles.length} substances from ${options.slugs.length} slugs`);
  } else if (options.newOnly) {
    // Process only articles with quotes that haven't been regenerated with new schema
    const beforeCount = articles.length;
    // First, get all articles that have quotes in Convex (async check)
    const articlesWithQuoteStatus = await Promise.all(
      articles.map(async (a) => {
        const slug = titleToSlug(a.title);
        const quotes = await loadHarmPotentialQuotes(slug);
        return { article: a, hasQuotes: !!quotes };
      })
    );
    articles = articlesWithQuoteStatus
      .filter(({ article, hasQuotes }) => hasQuotes && !hasNewSchemaHarmPotential(article))
      .map(({ article }) => article);
    console.log(`Filtered to articles with quotes but no new schema: ${articles.length} (of ${beforeCount})`);
  } else if (!options.all) {
    // Default: only articles with existing harm_potential content
    const beforeCount = articles.length;
    articles = articles.filter(hasExistingHarmPotential);
    console.log(`Filtered to articles with existing harm_potential: ${articles.length} (of ${beforeCount})`);
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
      const quotes = await loadHarmPotentialQuotes(slug);
      const hasExisting = hasExistingHarmPotential(article);
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
    console.log(`\nApplying ${results.successfulUpdates.length} updates to SubstanceIndex.json...`);

    const articlesMap = new Map(allArticles.map(a => [a.title, a]));

    for (const update of results.successfulUpdates) {
      const article = articlesMap.get(update.title);
      if (article) {
        article.harm_potential = update.harm_potential;
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

      // Use substanceIndex.saveSubstances for batch updates
      const adminKey = process.env.CONVEX_ADMIN_KEY;
      if (!adminKey) {
        throw new Error("CONVEX_ADMIN_KEY environment variable is required for Convex sync");
      }
      const result = await convexClient.mutation(api.substanceIndex.saveSubstances, {
        apiKey: adminKey,
        articles: sanitizedArticles,
      });
      console.log(`Convex sync complete (${result.created} created, ${result.updated} updated).`);
    } catch (syncError) {
      console.error("Warning: Convex sync failed:", syncError.message);
      console.error("Run manually: CONVEX_URL=... node scripts/migrate-articles-to-convex.mjs");
    }
  }

  // Summary
  printBatchSummary({
    results,
    durationSeconds: duration,
    failedItems: results.failedItems,
  });

  // Reminder to rebuild compressed articles
  if (results.successfulUpdates.length > 0) {
    console.log("\n" + "=".repeat(50));
    console.log("IMPORTANT: Run the following to rebuild compressed articles:");
    console.log("  node scripts/build/buildCompressedArticles.mjs");
    console.log("(Convex sync already complete)");
    console.log("=".repeat(50));
  }
}

await runBatchGenerator({
  parseOptions: parseArgs,
  printHelp,
  execute: main,
});
