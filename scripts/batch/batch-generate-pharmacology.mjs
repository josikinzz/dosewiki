#!/usr/bin/env node
/**
 * Batch Pharmacology Section Generation Script
 *
 * Generates pharmacology sections using Claude Opus 4.5 via OpenRouter.
 *
 * Usage:
 *   export OPENROUTER_API_KEY="sk-or-..."
 *   export VITE_CONVEX_URL="https://..."
 *   node scripts/batch/batch-generate-pharmacology.mjs
 *
 * Options:
 *   --dry-run              Preview without API calls or saving
 *   --verbose              Show detailed progress output
 *   --substance=lsd        Process single substance
 *   --slugs=lsd,mdma,dmt   Process multiple substances by comma-separated slugs
 *   --concurrency=3        Parallel requests (default: 3)
 *   --limit=5              Process only N articles
 *   --skip-backup          Don't create backup file
 *   --all                  Process all articles with quotes
 */

import { readFileSync, writeFileSync, existsSync, copyFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api.js";
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
  reasoningEffort: "high",
  articlesFile: join(PROJECT_ROOT, "src/data/SubstanceIndex.json"),
  quotesDir: join(PROJECT_ROOT, "quotes/pharmacology-quotes"),
  backupFile: join(PROJECT_ROOT, "src/data/backups/articles.backup.json"),
};

// Security bounds for input validation
const INPUT_BOUNDS = {
  concurrency: { min: 1, max: 50 },
  limit: { min: 1, max: 10000 },
};

// Parse command line arguments
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
  };

  for (const arg of args) {
    if (arg.startsWith("--concurrency=")) {
      const value = parseInt(arg.split("=")[1], 10);
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
      options.limit = Math.min(
        Math.max(isNaN(value) ? null : value, INPUT_BOUNDS.limit.min),
        INPUT_BOUNDS.limit.max
      );
    } else if (arg === "--skip-backup") {
      options.skipBackup = true;
    } else if (arg === "--all") {
      options.all = true;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
  }

  return options;
}

function printHelp() {
  console.log(`
Batch Pharmacology Section Generation Script

Generates pharmacology sections using Claude Opus 4.5 via OpenRouter.

Usage:
  export OPENROUTER_API_KEY="sk-or-..."
  export VITE_CONVEX_URL="https://..."
  node scripts/batch/batch-generate-pharmacology.mjs

Options:
  --dry-run              Preview without API calls or saving
  --verbose              Show detailed progress output
  --substance=<slug>     Process single substance only
  --slugs=<slug1,slug2>  Process multiple substances by comma-separated slugs
  --concurrency=<n>      Number of parallel API requests (default: 3)
  --limit=<n>            Process at most N items then stop
  --skip-backup          Don't create backup file
  --all                  Process all articles with quotes
  --help, -h             Show this help message

Examples:
  node scripts/batch/batch-generate-pharmacology.mjs --substance=2c-b --dry-run
  node scripts/batch/batch-generate-pharmacology.mjs --slugs=2c-b,amphetamine,fentanyl
  node scripts/batch/batch-generate-pharmacology.mjs --all --concurrency=5
`);
}

function titleToSlug(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function loadArticles() {
  if (!existsSync(CONFIG.articlesFile)) {
    console.error("Error: SubstanceIndex.json not found at", CONFIG.articlesFile);
    process.exit(1);
  }
  return JSON.parse(readFileSync(CONFIG.articlesFile, "utf-8"));
}

function saveArticles(articles) {
  writeFileSync(CONFIG.articlesFile, JSON.stringify(articles, null, 2), "utf-8");
}

function createBackup() {
  if (existsSync(CONFIG.articlesFile)) {
    copyFileSync(CONFIG.articlesFile, CONFIG.backupFile);
    console.log(`Backup created: ${CONFIG.backupFile}`);
  }
}

// Load pharmacology quotes from Convex
async function loadPharmacologyQuotes(slug) {
  try {
    const quote = await convexClient.query(api.quotes.getBySlugAndSection, {
      slug,
      section: "pharmacology",
    });
    return quote?.content ?? null;
  } catch (error) {
    console.error(`  Error loading quotes for ${slug}:`, error.message);
    return null;
  }
}

// Check if article has existing pharmacology content
function hasExistingPharmacology(article) {
  const p = article.pharmacology;
  if (!p) return false;

  return !!(
    p.receptor_profile?.length > 0 ||
    p.summary?.trim() ||
    p.pharmacokinetics?.trim() ||
    p.metabolites?.length > 0 ||
    Object.keys(p.route_bioavailability || {}).length > 0 ||
    Object.keys(p.route_half_life || {}).length > 0
  );
}

// Convex client
let convexClient = null;

function initConvexClient(convexUrl) {
  convexClient = new ConvexHttpClient(convexUrl);
  return convexClient;
}

// Load section prompt from Convex
async function loadPromptFromConvex() {
  const prompt = await convexClient.query(api.prompts.getByKey, { key: "section_pharmacology" });

  if (!prompt) {
    throw new Error("section_pharmacology prompt not found in Convex. Run the migration script first.");
  }

  return prompt.content;
}

// Build user message (lightweight context)
function buildUserMessage(article, quotes) {
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

Generate the pharmacology section based on these extracted quotes:

${quotes}

## Instructions

Generate ONLY the pharmacology section as valid YAML. Do not include information that belongs in other sections (harm_potential, interactions, tolerance, dosage, duration, legality, subjective_effects).`;
}

// Call OpenRouter API
async function callOpenRouter(apiKey, systemPrompt, userMessage) {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://dose.wiki",
      "X-Title": "Dose.wiki Batch Pharmacology Generator",
    },
    body: JSON.stringify({
      model: CONFIG.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: CONFIG.temperature,
      max_tokens: CONFIG.maxTokens,
      ...(CONFIG.reasoningEffort && CONFIG.model.startsWith("anthropic/")
        ? { reasoning: { effort: CONFIG.reasoningEffort } }
        : {}),
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

// Retry wrapper
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

// Parse generated YAML
function parseGeneratedYaml(response) {
  const yamlMatch = response.match(/```ya?ml\s*([\s\S]*?)```/);
  const yamlContent = yamlMatch ? yamlMatch[1].trim() : response.trim();

  try {
    const parsed = yaml.parse(yamlContent);
    let p = parsed.pharmacology || parsed;

    if (
      p.receptor_profile !== undefined ||
      p.summary !== undefined ||
      p.pharmacokinetics !== undefined ||
      p.metabolites !== undefined
    ) {
      return normalizePharmacology(p);
    }

    throw new Error("Invalid pharmacology structure - missing expected fields");
  } catch (error) {
    throw new Error(`Failed to parse YAML: ${error.message}`);
  }
}

// Normalize pharmacology to ensure all required fields exist
function normalizePharmacology(p) {
  // Handle legacy format: convert mechanism_of_action + receptor_binding → receptor_profile
  let receptorProfile;
  if (Array.isArray(p.receptor_profile)) {
    receptorProfile = p.receptor_profile.map(entry => ({
      receptor: typeof entry.receptor === 'string' ? entry.receptor : "",
      ...(entry.tag ? { tag: String(entry.tag) } : {}),
      ...(entry.affinity ? { affinity: String(entry.affinity) } : {}),
      ...(entry.efficacy ? { efficacy: String(entry.efficacy) } : {}),
    }));
  } else if (Array.isArray(p.mechanism_of_action)) {
    // Legacy fallback: derive from old fields
    receptorProfile = p.mechanism_of_action.map(tag => ({
      receptor: tag.split(" receptor")[0] || tag,
      tag,
    }));
  } else {
    receptorProfile = [];
  }

  return {
    // Core pharmacology fields
    summary: typeof p.summary === 'string' ? p.summary : "",
    receptor_profile: receptorProfile,
    pharmacokinetics: typeof p.pharmacokinetics === 'string' ? p.pharmacokinetics
      : (typeof p.metabolism === 'string' ? p.metabolism : ""),
    metabolites: Array.isArray(p.metabolites) ? p.metabolites : [],
    // Route-specific data (will be merged into dosage/duration)
    route_bioavailability: typeof p.route_bioavailability === 'object' && p.route_bioavailability !== null
      ? p.route_bioavailability : {},
    route_half_life: typeof p.route_half_life === 'object' && p.route_half_life !== null
      ? p.route_half_life : {},
    route_half_life_notes: typeof p.route_half_life_notes === 'object' && p.route_half_life_notes !== null
      ? p.route_half_life_notes : {},
    route_bioavailability_notes: typeof p.route_bioavailability_notes === 'object' && p.route_bioavailability_notes !== null
      ? p.route_bioavailability_notes : {},
  };
}

// Merge route-specific pharmacokinetic data into dosage/duration routes
// This ensures bioavailability/half_life appear where the UI expects them
function mergeRouteDataIntoDosageDuration(article, pharmacology) {
  const { route_bioavailability, route_half_life, route_bioavailability_notes, route_half_life_notes } = pharmacology;

  // Helper to find matching route (case-insensitive)
  const findRoute = (routes, routeName) => {
    if (!routes || !Array.isArray(routes)) return null;
    return routes.find(r => r.route?.toLowerCase() === routeName.toLowerCase());
  };

  // Merge bioavailability into dosage routes
  if (route_bioavailability && article.dosage?.routes) {
    for (const [routeName, value] of Object.entries(route_bioavailability)) {
      const route = findRoute(article.dosage.routes, routeName);
      if (route && value) {
        route.bioavailability = value;
      }
    }
  }

  // Merge bioavailability_notes into dosage routes
  if (route_bioavailability_notes && article.dosage?.routes) {
    for (const [routeName, value] of Object.entries(route_bioavailability_notes)) {
      const route = findRoute(article.dosage.routes, routeName);
      if (route && value) {
        route.bioavailability_notes = value;
      }
    }
  }

  // Merge half_life into duration routes
  if (route_half_life && article.duration?.routes) {
    for (const [routeName, value] of Object.entries(route_half_life)) {
      const route = findRoute(article.duration.routes, routeName);
      if (route && value) {
        route.half_life = value;
      }
    }
  }

  // Merge half_life_notes into duration routes
  if (route_half_life_notes && article.duration?.routes) {
    for (const [routeName, value] of Object.entries(route_half_life_notes)) {
      const route = findRoute(article.duration.routes, routeName);
      if (route && value) {
        route.half_life_notes = value;
      }
    }
  }

  return article;
}

// Process a single article
async function processArticle(apiKey, article, systemPrompt, verbose) {
  const slug = titleToSlug(article.title);

  const quotes = await loadPharmacologyQuotes(slug);
  if (!quotes) {
    return { slug, status: "skipped", reason: "No pharmacology quotes in Convex", tokens: 0 };
  }

  const userMessage = buildUserMessage(article, quotes);

  const result = await callWithRetry(() =>
    callOpenRouter(apiKey, systemPrompt, userMessage)
  );

  const newPharmacology = parseGeneratedYaml(result.content);

  if (verbose) {
    console.log(`  Generated pharmacology for ${slug}:`);
    console.log(`    summary: ${newPharmacology.summary ? "yes" : "no"} (${newPharmacology.summary.length} chars)`);
    console.log(`    receptor_profile: ${newPharmacology.receptor_profile.length} entries`);
    console.log(`    pharmacokinetics: ${newPharmacology.pharmacokinetics ? "yes" : "no"} (${newPharmacology.pharmacokinetics.length} chars)`);
    console.log(`    metabolites: ${newPharmacology.metabolites.length} entries`);
    console.log(`    → dosage bioavailability: ${Object.keys(newPharmacology.route_bioavailability).length} routes`);
    console.log(`    → duration half_life: ${Object.keys(newPharmacology.route_half_life).length} routes`);
  }

  return {
    slug,
    status: "success",
    pharmacology: newPharmacology,
    tokens: result.usage.totalTokens,
    promptTokens: result.usage.promptTokens,
    completionTokens: result.usage.completionTokens,
  };
}

// Process all articles with concurrency
async function processAll(apiKey, articles, systemPrompt, options) {
  const { concurrency, verbose, dryRun } = options;

  let completed = 0;
  let failed = 0;
  let skipped = 0;
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  const failedItems = [];
  const successfulUpdates = [];

  const total = articles.length;

  for (let i = 0; i < articles.length; i += concurrency) {
    const batch = articles.slice(i, i + concurrency);

    const promises = batch.map(async (article) => {
      const slug = titleToSlug(article.title);

      if (verbose) {
        console.log(`  Processing: ${article.title}`);
      }

      if (dryRun) {
        const quotes = await loadPharmacologyQuotes(slug);
        return {
          slug,
          title: article.title,
          status: quotes ? "dry-run" : "would-skip",
          reason: quotes ? null : "No pharmacology quotes in Convex",
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
            pharmacology: result.pharmacology,
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

    const done = completed + failed + skipped;
    process.stdout.write(`\rProgress: ${done}/${total} (${completed} ok, ${failed} failed, ${skipped} skipped)`);
  }

  console.log();

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

  console.log("\nBatch Pharmacology Section Generation");
  console.log("=".repeat(50));
  console.log(`Model: ${CONFIG.model}`);
  console.log(`Reasoning Effort: ${CONFIG.reasoningEffort}`);
  console.log(`Concurrency: ${options.concurrency}`);

  initConvexClient(convexUrl);

  console.log("\nLoading prompt from Convex...");
  let systemPrompt;
  try {
    systemPrompt = await loadPromptFromConvex();
    console.log(`  Prompt loaded: ${systemPrompt.length.toLocaleString()} chars`);
  } catch (error) {
    console.error(`Error loading prompt: ${error.message}`);
    process.exit(1);
  }

  const allArticles = loadArticles();

  let articles = allArticles.filter(a =>
    a.priority === "high" || a.priority === "normal"
  );
  console.log(`\nPriority articles (high/normal): ${articles.length}`);

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
  } else if (!options.all) {
    const beforeCount = articles.length;
    articles = articles.filter(hasExistingPharmacology);
    console.log(`Filtered to articles with existing pharmacology: ${articles.length} (of ${beforeCount})`);
  }

  if (options.limit && articles.length > options.limit) {
    articles = articles.slice(0, options.limit);
    console.log(`Limited to: ${articles.length} items`);
  }

  if (articles.length === 0) {
    console.log("\nNo articles to process.");
    return;
  }

  if (options.dryRun) {
    console.log("\n[DRY RUN] Would process:");
    for (const article of articles.slice(0, 20)) {
      const slug = titleToSlug(article.title);
      const quotes = await loadPharmacologyQuotes(slug);
      const hasExisting = hasExistingPharmacology(article);
      const status = quotes ? "has quotes" : "NO QUOTES";
      const existing = hasExisting ? "(has content)" : "(no content)";
      console.log(`  - ${article.title} ${existing} [${status}]`);
    }
    if (articles.length > 20) {
      console.log(`  ... and ${articles.length - 20} more`);
    }
    return;
  }

  if (!options.skipBackup) {
    createBackup();
  }

  console.log(`\nProcessing ${articles.length} articles...\n`);

  const startTime = Date.now();
  const results = await processAll(apiKey, articles, systemPrompt, options);
  const endTime = Date.now();
  const duration = (endTime - startTime) / 1000;

  if (results.successfulUpdates.length > 0) {
    console.log(`\nApplying ${results.successfulUpdates.length} updates to SubstanceIndex.json...`);

    const articlesMap = new Map(allArticles.map(a => [a.title, a]));

    for (const update of results.successfulUpdates) {
      const article = articlesMap.get(update.title);
      if (article) {
        // Update core pharmacology fields
        const corePharmacology = {
          summary: update.pharmacology.summary,
          receptor_profile: update.pharmacology.receptor_profile,
          pharmacokinetics: update.pharmacology.pharmacokinetics,
          metabolites: update.pharmacology.metabolites,
        };
        article.pharmacology = { ...article.pharmacology, ...corePharmacology };

        // Merge route-specific data (bioavailability, half_life) into dosage/duration sections
        mergeRouteDataIntoDosageDuration(article, update.pharmacology);
      }
    }

    saveArticles(allArticles);
    console.log("Articles saved successfully.");

    console.log(`\nSyncing ${results.successfulUpdates.length} articles to Convex...`);
    try {
      const updatedArticles = results.successfulUpdates.map(u =>
        allArticles.find(a => a.title === u.title)
      ).filter(Boolean);

      const sanitizedArticles = updatedArticles.map(sanitizeObjectKeys);

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
    }
  }

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

  if (results.failed > 0) {
    console.log(`\nFailed articles:`);
    for (const item of results.failedItems) {
      console.log(`  - ${item.title}: ${item.error}`);
    }
  }

  if (results.successfulUpdates.length > 0) {
    console.log("\n" + "=".repeat(50));
    console.log("IMPORTANT: Sync to production:");
    console.log("  TARGET_CONVEX_URL=https://glad-minnow-656.convex.cloud node scripts/convex/sync-convex-to-production.mjs");
    console.log("=".repeat(50));
  }
}

main().catch(error => {
  console.error("Fatal error:", error);
  process.exit(1);
});
