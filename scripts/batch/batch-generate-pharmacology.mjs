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
 *   --all                  Process all priority levels with quotes
 */

import { readFileSync, writeFileSync, existsSync, copyFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api.js";
import { normalizePharmacologySection } from "../../lib/article/normalization.js";
import { callOpenRouterChat } from "../lib/openrouter-sdk.mjs";
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
  model: process.env.OPENROUTER_MODEL || "anthropic/claude-opus-4-6",
  maxTokens: 16384,
  temperature: 0.3,
  maxConcurrency: 3,
  retryAttempts: 3,
  retryDelayMs: 2000,
  reasoningEffort: "high",
  articlesFile: join(PROJECT_ROOT, "src/data/SubstanceIndex.json"),
  quotesDir: join(PROJECT_ROOT, "quotes/pharmacology-quotes"),
  backupFile: join(PROJECT_ROOT, "src/data/backups/articles.backup.json"),
  debugDir: join(PROJECT_ROOT, "tmp"),
};

const COMPLETE_PHARMACOLOGY_FIELD_THRESHOLD = 5;

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
    includeComplete: false,
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
    } else if (arg === "--include-complete") {
      options.includeComplete = true;
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
  --all                  Process all priority levels with quotes
  --include-complete     Rebuild articles even if pharmacology already looks complete
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

function getArticleSlug(article) {
  return article.slug || titleToSlug(article.title);
}

function stripConvexMetadata(article) {
  const { _id, _creationTime, ...cleanArticle } = article;
  return cleanArticle;
}

async function loadArticlesFromConvex() {
  const articles = await convexClient.query(api.substanceIndex.getAll, {});
  return articles.map(stripConvexMetadata);
}

async function loadPharmacologyQuoteSlugs() {
  const metadata = await convexClient.query(api.quotes.getAllMetadata, {});
  return new Set(
    metadata
      .filter((quote) => quote.section === "pharmacology")
      .map((quote) => quote.slug),
  );
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

function ensureDebugDir() {
  if (!existsSync(CONFIG.debugDir)) {
    mkdirSync(CONFIG.debugDir, { recursive: true });
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
    p.pharmacodynamics?.trim() ||
    p.summary?.trim() ||
    p.pharmacokinetics?.trim() ||
    p.metabolites?.length > 0 ||
    Object.keys(p.route_bioavailability || {}).length > 0 ||
    Object.keys(p.route_half_life || {}).length > 0
  );
}

function countPopulatedPharmacologyFields(article) {
  const pharmacology = normalizePharmacologySection(article?.pharmacology);
  return [
    pharmacology.pharmacodynamics.trim().length > 0,
    (pharmacology.summary ?? "").trim().length > 0,
    pharmacology.receptor_profile.length > 0,
    pharmacology.pharmacokinetics.trim().length > 0,
    pharmacology.metabolites.length > 0,
    Object.keys(pharmacology.route_bioavailability ?? {}).length > 0,
    Object.keys(pharmacology.route_half_life ?? {}).length > 0,
  ].filter(Boolean).length;
}

function hasCompletePharmacology(article) {
  return countPopulatedPharmacologyFields(article) >= COMPLETE_PHARMACOLOGY_FIELD_THRESHOLD;
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
async function callOpenRouter(apiKey, systemPrompt, userMessage, debugContext = null, options = {}) {
  const response = await callOpenRouterChat({
    apiKey,
    appTitle: "Dose.wiki Batch Pharmacology Generator",
    model: CONFIG.model,
    systemPrompt,
    userMessage,
    temperature: CONFIG.temperature,
    maxTokens: CONFIG.maxTokens,
    reasoningEffort: CONFIG.reasoningEffort,
    disableReasoning: options.disableReasoning,
  });

  if (!response.content.trim()) {
    writeOpenRouterDebugArtifact({
      debugContext,
      suffix: "openrouter-empty-content",
      payload: JSON.stringify(response.response, null, 2),
      metadata: {
        message: "OpenRouter response contained no extractable message content",
      },
    });

    if (!options.disableReasoning && response.reasoning && response.finishReason === "length") {
      return await callOpenRouter(apiKey, systemPrompt, userMessage, debugContext, {
        ...options,
        disableReasoning: true,
      });
    }
  }

  return {
    content: response.content,
    usage: response.usage,
  };
}

function writeOpenRouterDebugArtifact({ debugContext, suffix, payload, metadata = {} }) {
  if (!debugContext?.slug) {
    return;
  }

  ensureDebugDir();
  const baseName = `${debugContext.slug.replace(/[^a-z0-9_-]+/gi, "_")}-${suffix}`;
  const payloadPath = join(CONFIG.debugDir, `${baseName}.txt`);
  const metaPath = join(CONFIG.debugDir, `${baseName}-meta.json`);
  writeFileSync(payloadPath, `${payload ?? ""}`, "utf8");
  writeFileSync(
    metaPath,
    JSON.stringify(
      {
        slug: debugContext.slug,
        title: debugContext.title,
        payloadPath,
        ...metadata,
      },
      null,
      2,
    ),
    "utf8",
  );
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
function parseGeneratedYaml(response, debugContext = null) {
  const yamlContent = extractPharmacologyYaml(response);
  const parseAttempts = [yamlContent, repairCommonYamlIssues(yamlContent)].filter(
    (content, index, arr) => content && arr.indexOf(content) === index,
  );

  let lastError = null;
  for (const content of parseAttempts) {
    try {
      const parsed = yaml.parse(content, { uniqueKeys: false });
      const pharmacology = extractParsedPharmacology(parsed);
      if (pharmacology) {
        return normalizePharmacology(pharmacology);
      }
      lastError = new Error("Invalid pharmacology structure - missing expected fields");
    } catch (error) {
      lastError = error;
    }
  }

  writeParseDebugArtifacts({
    debugContext,
    response,
    yamlContent,
    repairedYamlContent: parseAttempts[1] && parseAttempts[1] !== yamlContent ? parseAttempts[1] : null,
    errorMessage: lastError?.message ?? "Unknown parse failure",
  });

  throw new Error(`Failed to parse YAML: ${lastError?.message ?? "Unknown parse failure"}`);
}

function writeParseDebugArtifacts({ debugContext, response, yamlContent, repairedYamlContent, errorMessage }) {
  if (!debugContext?.slug) {
    return;
  }

  ensureDebugDir();
  const baseName = `${debugContext.slug.replace(/[^a-z0-9_-]+/gi, "_")}-pharmacology-parse-failure`;
  const rawPath = join(CONFIG.debugDir, `${baseName}-raw.txt`);
  const yamlPath = join(CONFIG.debugDir, `${baseName}-yaml.txt`);
  const metaPath = join(CONFIG.debugDir, `${baseName}-meta.json`);

  writeFileSync(rawPath, `${response ?? ""}`, "utf8");
  writeFileSync(yamlPath, `${repairedYamlContent || yamlContent || ""}`, "utf8");
  writeFileSync(
    metaPath,
    JSON.stringify(
      {
        slug: debugContext.slug,
        title: debugContext.title,
        errorMessage,
        rawPath,
        yamlPath,
      },
      null,
      2,
    ),
    "utf8",
  );
}

function extractParsedPharmacology(parsed) {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }

  const root =
    parsed.pharmacology && typeof parsed.pharmacology === "object" && !Array.isArray(parsed.pharmacology)
      ? parsed.pharmacology
      : parsed;

  if (!root || typeof root !== "object" || Array.isArray(root)) {
    return null;
  }

  if (
    root.receptor_profile !== undefined ||
    root.pharmacodynamics !== undefined ||
    root.summary !== undefined ||
    root.pharmacokinetics !== undefined ||
    root.metabolites !== undefined ||
    root.route_bioavailability !== undefined ||
    root.route_half_life !== undefined
  ) {
    return root;
  }

  return null;
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

function extractPharmacologyYaml(response) {
  const withoutThinkBlocks = response.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  const yamlMatch = withoutThinkBlocks.match(/```ya?ml\s*([\s\S]*?)```/i);
  if (yamlMatch) {
    return yamlMatch[1].trim();
  }

  const lines = withoutThinkBlocks.split(/\r?\n/);
  const firstRelevantLine = lines.findIndex((line) =>
    /^(pharmacology|pharmacodynamics|summary|mechanism_of_action|receptor_profile|receptor_binding|pharmacokinetics|metabolism|metabolites|route_bioavailability|route_half_life|route_half_life_notes|route_bioavailability_notes)\s*:/i.test(line.trim())
  );

  if (firstRelevantLine === -1) {
    return withoutThinkBlocks;
  }

  return lines.slice(firstRelevantLine).join("\n").trim();
}

// Normalize pharmacology to ensure all required fields exist
function normalizePharmacology(p) {
  return normalizePharmacologySection(p);
}

// Merge route-specific pharmacokinetic data into dosage/duration routes
// This ensures bioavailability/half_life appear where the UI expects them
function mergeRouteDataIntoDosageDuration(article, pharmacology) {
  const { route_bioavailability, route_half_life, route_bioavailability_notes, route_half_life_notes } = pharmacology;

  function normalizeRouteName(routeName) {
    const normalized = routeName
      .toLowerCase()
      .replace(/\./g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();

    const aliases = {
      "oral": "oral",
      "insufflated": "insufflated",
      "intranasal": "insufflated",
      "nasal": "insufflated",
      "snorted": "insufflated",
      "rectal": "rectal",
      "intramuscular": "intramuscular",
      "im": "intramuscular",
      "i m": "intramuscular",
      "intravenous": "intravenous",
      "iv": "intravenous",
      "i v": "intravenous",
      "sublingual": "sublingual",
    };

    return aliases[normalized] || normalized;
  }

  // Helper to find matching route with alias support
  const findRoute = (routes, routeName) => {
    if (!routes || !Array.isArray(routes)) return null;
    const targetRoute = normalizeRouteName(routeName);
    return routes.find((route) => normalizeRouteName(route.route || "") === targetRoute);
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
  const slug = getArticleSlug(article);

  const quotes = await loadPharmacologyQuotes(slug);
  if (!quotes) {
    return { slug, status: "skipped", reason: "No pharmacology quotes in Convex", tokens: 0 };
  }

  const userMessage = buildUserMessage(article, quotes);

  const result = await callWithRetry(() =>
    callOpenRouter(apiKey, systemPrompt, userMessage, {
      slug,
      title: article.title,
    })
  );

  const newPharmacology = parseGeneratedYaml(result.content, {
    slug,
    title: article.title,
  });

  if (verbose) {
    console.log(`  Generated pharmacology for ${slug}:`);
    console.log(`    pharmacodynamics: ${newPharmacology.pharmacodynamics ? "yes" : "no"} (${newPharmacology.pharmacodynamics.length} chars)`);
    console.log(`    receptor_profile: ${newPharmacology.receptor_profile.length} entries`);
    console.log(`    pharmacokinetics: ${newPharmacology.pharmacokinetics ? "yes" : "no"} (${newPharmacology.pharmacokinetics.length} chars)`);
    console.log(`    metabolites: ${newPharmacology.metabolites.length} entries`);
    console.log(`    → dosage bioavailability: ${Object.keys(newPharmacology.route_bioavailability || {}).length} routes`);
    console.log(`    → duration half_life: ${Object.keys(newPharmacology.route_half_life || {}).length} routes`);
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

async function persistSuccessfulUpdate(result, persistenceContext) {
  const { articlesMap, allArticles, adminKey } = persistenceContext;
  const article = articlesMap.get(result.title);

  if (!article) {
    throw new Error(`Article not found in persistence map: ${result.title}`);
  }

  article.pharmacology = { ...result.pharmacology };
  mergeRouteDataIntoDosageDuration(article, article.pharmacology);

  const sanitizedArticle = sanitizeObjectKeys(article);

  await convexClient.mutation(api.substanceIndex.saveSubstances, {
    apiKey: adminKey,
    articles: [sanitizedArticle],
  });

  saveArticles(allArticles);
}

// Process all articles with concurrency
async function processAll(apiKey, articles, systemPrompt, options, persistenceContext) {
  const { concurrency, verbose, dryRun } = options;

  let completed = 0;
  let failed = 0;
  let skipped = 0;
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  const failedItems = [];

  const total = articles.length;

  for (let i = 0; i < articles.length; i += concurrency) {
    const batch = articles.slice(i, i + concurrency);

    const promises = batch.map(async (article) => {
      const articleSlug = getArticleSlug(article);

      if (verbose) {
        console.log(`  Processing: ${article.title}`);
      }

      if (dryRun) {
        const quotes = await loadPharmacologyQuotes(articleSlug);
        return {
          slug: articleSlug,
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
          if (verbose) {
            console.log(`  Completed: ${articleSlug} (${result.tokens} tokens)`);
          }
        } else if (verbose) {
          console.log(`  Skipped: ${articleSlug} - ${result.reason}`);
        }

        return { ...result, title: article.title };
      } catch (error) {
        console.error(`  Failed: ${articleSlug} - ${error.message}`);
        return { slug: articleSlug, title: article.title, status: "failed", error: error.message };
      }
    });

    const results = await Promise.all(promises);

    for (const result of results) {
      if (result.status === "success") {
        try {
          await persistSuccessfulUpdate(result, persistenceContext);
          completed++;
        } catch (error) {
          failed++;
          failedItems.push({ slug: result.slug, title: result.title, error: error.message });
          console.error(`  Failed to persist: ${result.slug} - ${error.message}`);
        }
      } else if (result.status === "dry-run") {
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

  console.log("\nLoading authoritative articles from Convex...");
  let allArticles;
  let pharmacologyQuoteSlugs;
  try {
    [allArticles, pharmacologyQuoteSlugs] = await Promise.all([
      loadArticlesFromConvex(),
      loadPharmacologyQuoteSlugs(),
    ]);
    console.log(`  Articles loaded: ${allArticles.length}`);
    console.log(`  Pharmacology quote docs: ${pharmacologyQuoteSlugs.size}`);
  } catch (error) {
    console.error(`Error loading Convex data: ${error.message}`);
    process.exit(1);
  }

  let articles = allArticles.filter(a =>
    options.all ? true : a.priority === "high" || a.priority === "normal"
  );
  console.log(`\nCandidate articles: ${articles.length}${options.all ? " (all priorities)" : " (high/normal)"}`);

  if (options.substance) {
    articles = articles.filter(a =>
      getArticleSlug(a) === options.substance
    );
    if (articles.length === 0) {
      console.error(`Error: No article found for slug "${options.substance}"`);
      process.exit(1);
    }
    console.log(`Filtered to substance: ${options.substance}`);
  } else if (options.slugs) {
    articles = articles.filter(a =>
      options.slugs.includes(getArticleSlug(a))
    );
    if (articles.length === 0) {
      console.error(`Error: No articles found for slugs: ${options.slugs.join(", ")}`);
      process.exit(1);
    }
    const notFound = options.slugs.filter(slug =>
      !articles.some(a => getArticleSlug(a) === slug)
    );
    if (notFound.length > 0) {
      console.warn(`Warning: Slugs not found: ${notFound.join(", ")}`);
    }
    console.log(`Filtered to ${articles.length} substances from ${options.slugs.length} slugs`);
  }

  const quoteBackedCount = articles.length;
  articles = articles.filter((article) => pharmacologyQuoteSlugs.has(getArticleSlug(article)));
  console.log(`Filtered to quote-backed articles: ${articles.length} (of ${quoteBackedCount})`);

  if (!options.includeComplete) {
    const incompleteCount = articles.length;
    articles = articles.filter((article) => !hasCompletePharmacology(article));
    console.log(
      `Filtered to incomplete pharmacology (<${COMPLETE_PHARMACOLOGY_FIELD_THRESHOLD} populated fields): ${articles.length} (of ${incompleteCount})`,
    );
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
      const slug = getArticleSlug(article);
      const fieldCount = countPopulatedPharmacologyFields(article);
      console.log(`  - ${article.title} (${slug}) [fields=${fieldCount}] [quote-backed]`);
    }
    if (articles.length > 20) {
      console.log(`  ... and ${articles.length - 20} more`);
    }
    return;
  }

  const adminKey = process.env.CONVEX_ADMIN_KEY;
  if (!adminKey) {
    console.error("Error: CONVEX_ADMIN_KEY environment variable is required for Convex sync");
    process.exit(1);
  }

  if (!options.skipBackup) {
    createBackup();
  }

  console.log(`\nProcessing ${articles.length} articles...\n`);

  const startTime = Date.now();
  const results = await processAll(apiKey, articles, systemPrompt, options, {
    adminKey,
    allArticles,
    articlesMap: new Map(allArticles.map((article) => [article.title, article])),
  });
  const endTime = Date.now();
  const duration = (endTime - startTime) / 1000;

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
}

main().catch(error => {
  console.error("Fatal error:", error);
  process.exit(1);
});
