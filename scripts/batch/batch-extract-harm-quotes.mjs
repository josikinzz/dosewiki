#!/usr/bin/env node
/**
 * Batch Harm Potential Quote Extraction Script
 *
 * Extracts harm-related quotes from article sources using Google Flash 3 via OpenRouter.
 * Saves extracted quotes to Convex for use by the batch generation script.
 *
 * Usage:
 *   export OPENROUTER_API_KEY="sk-or-..."
 *   export VITE_CONVEX_URL="https://..."
 *   node scripts/batch-extract-harm-quotes.mjs
 *
 * Options:
 *   --dry-run              Preview without API calls or saving
 *   --verbose              Show detailed progress output
 *   --substance=lsd        Process single substance
 *   --concurrency=5        Parallel requests (default: 5)
 *   --limit=10             Process only N substances
 *   --overwrite            Overwrite existing quotes (default: skip existing)
 */

import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api.js";

// Configuration
const CONFIG = {
  model: process.env.OPENROUTER_MODEL || "google/gemini-3-flash-preview",
  maxTokens: 16384,
  temperature: 0.1, // Low temperature for extraction accuracy
  maxConcurrency: 5,
  retryAttempts: 3,
  retryDelayMs: 2000,
};

// Pricing for cost estimation (per 1M tokens)
const PRICING = {
  "google/gemini-3-flash-preview": { input: 0.15, output: 0.60 },
  "anthropic/claude-opus-4.5": { input: 15.00, output: 75.00 },
};

// Extraction prompt - matches updated schema
const EXTRACTION_PROMPT = `You are extracting verbatim harm-related text from source articles about a substance.

## WHAT TO EXTRACT

Look for ANY text related to:
- Addiction potential / abuse potential / habit-forming
- Dependence (physical or psychological)
- LD50 / lethal dose / fatal dose / overdose deaths
- Organ toxicity (liver, kidney, heart, brain, bladder damage)
- Carcinogenicity / cancer risk / mutagenicity
- Neurotoxicity
- Psychosis / psychotic episodes
- Seizures / convulsions
- Antibiotic / antimicrobial properties
- Any other notable health risks

## HOW TO EXTRACT

Extract COMPLETE SECTIONS verbatim. Do not break paragraphs or sentences.
- If you find a section header like "## Toxicity and harm potential", extract the ENTIRE section
- If you find relevant paragraphs within a larger section, extract the FULL paragraphs
- ERR ON THE SIDE OF TAKING MORE TEXT, not less
- Include the section headers in your extraction
- Preserve all markdown formatting (headers, lists, bold, links)

## OUTPUT FORMAT

For each source that contains harm-related content, output:

## Source: [Source Name]

[Verbatim extracted text with markdown preserved]

---

If a source has NO harm-related content, skip it entirely (don't mention it).

Do NOT summarize or paraphrase. Extract VERBATIM text only.`;

// Convex client
let convexClient = null;

function initConvexClient(convexUrl) {
  convexClient = new ConvexHttpClient(convexUrl);
  return convexClient;
}

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    concurrency: CONFIG.maxConcurrency,
    dryRun: false,
    verbose: false,
    substance: null,
    limit: null,
    overwrite: false,
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
    } else if (arg === "--overwrite") {
      options.overwrite = true;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
  }

  return options;
}

function printHelp() {
  console.log(`
Batch Harm Potential Quote Extraction Script

Extracts harm-related quotes from article sources using Google Flash 3 via OpenRouter.

Usage:
  export OPENROUTER_API_KEY="sk-or-..."
  export VITE_CONVEX_URL="https://..."
  node scripts/batch-extract-harm-quotes.mjs

Options:
  --dry-run              Preview without API calls or saving
  --verbose              Show detailed progress output
  --substance=<slug>     Process single substance only
  --concurrency=<n>      Number of parallel API requests (default: 5)
  --limit=<n>            Process at most N substances
  --overwrite            Overwrite existing quotes (default: skip)
  --help, -h             Show this help message

Examples:
  node scripts/batch-extract-harm-quotes.mjs --substance=ketamine --verbose
  node scripts/batch-extract-harm-quotes.mjs --limit=10 --dry-run
  node scripts/batch-extract-harm-quotes.mjs --concurrency=10 --overwrite
`);
}

// Call OpenRouter API
async function callOpenRouter(apiKey, systemPrompt, userMessage) {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://dose.wiki",
      "X-Title": "Dose.wiki Batch Quote Extractor",
    },
    body: JSON.stringify({
      model: CONFIG.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: CONFIG.temperature,
      max_tokens: CONFIG.maxTokens,
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

// Build user message with all source content
function buildUserMessage(substanceName, sources, contents) {
  let message = `# ${substanceName}\n\nExtract all harm-related content from the following sources:\n\n`;

  for (const source of sources) {
    const content = contents[source.id];
    if (!content) continue;

    // Truncate very long sources to avoid token limits
    const maxChars = 50000;
    const truncated = content.length > maxChars
      ? content.slice(0, maxChars) + "\n\n[... content truncated ...]"
      : content;

    message += `---\n\n## SOURCE: ${source.displayName} (${source.id})\n\n${truncated}\n\n`;
  }

  return message;
}

// Process a single substance
async function processSubstance(apiKey, articleSource, verbose) {
  const { slug, substanceName, sources, contents } = articleSource;

  if (!contents || Object.keys(contents).length === 0) {
    return { slug, status: "skipped", reason: "No source content", tokens: 0 };
  }

  // Build the extraction request
  const userMessage = buildUserMessage(substanceName, sources, contents);

  if (verbose) {
    console.log(`  Sources: ${sources.map(s => s.id).join(", ")}`);
    console.log(`  Content size: ${userMessage.length.toLocaleString()} chars`);
  }

  // Call API
  const result = await callWithRetry(() =>
    callOpenRouter(apiKey, EXTRACTION_PROMPT, userMessage)
  );

  // Format the output
  const header = `# ${substanceName} - Harm Potential Quotes\n\n> Verbatim extractions from source articles. Generated ${new Date().toISOString().split("T")[0]}.\n\n---\n\n`;
  const extractedContent = header + result.content;

  return {
    slug,
    status: "success",
    content: extractedContent,
    tokens: result.usage.totalTokens,
    promptTokens: result.usage.promptTokens,
    completionTokens: result.usage.completionTokens,
  };
}

// Calculate cost
function calculateCost(promptTokens, completionTokens) {
  const pricing = PRICING[CONFIG.model] || { input: 0, output: 0 };
  return (promptTokens / 1_000_000) * pricing.input +
         (completionTokens / 1_000_000) * pricing.output;
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

  console.log("\nBatch Harm Potential Quote Extraction");
  console.log("=".repeat(50));
  console.log(`Model: ${CONFIG.model}`);
  console.log(`Concurrency: ${options.concurrency}`);
  console.log(`Overwrite existing: ${options.overwrite}`);

  // Initialize Convex client
  initConvexClient(convexUrl);

  // Get list of substances with article sources
  console.log("\nLoading article sources from Convex...");

  let articleSources = [];
  if (options.substance) {
    // Single substance
    const source = await convexClient.query(api.articleSources.getBySlug, { slug: options.substance });
    if (!source) {
      console.error(`Error: No article sources found for "${options.substance}"`);
      process.exit(1);
    }
    articleSources = [source];
    console.log(`  Loaded: ${options.substance}`);
  } else {
    // Get list of slugs first (lightweight), then load each individually
    let cursor = undefined;
    let slugs = [];
    let isDone = false;

    while (!isDone) {
      const queryArgs = { limit: 100 };
      if (cursor) queryArgs.cursor = cursor;

      const result = await convexClient.query(api.articleSources.getSubstanceList, queryArgs);
      slugs.push(...result.items.map(s => s.slug));
      cursor = result.cursor;
      isDone = result.isDone;
    }

    console.log(`  Found ${slugs.length} substances with sources`);

    // Filter to high/normal priority only (exclude low priority)
    console.log("  Filtering to high/normal priority...");
    const allSubstances = await convexClient.query(api.substanceIndex.getAll);
    const prioritySlugs = new Set(
      allSubstances
        .filter(s => s.priority === "high" || s.priority === "normal")
        .map(s => s.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""))
    );

    slugs = slugs.filter(slug => prioritySlugs.has(slug));
    console.log(`  Filtered to ${slugs.length} high/normal priority substances`);

    articleSources = slugs; // Store slugs, will load full content on-demand
  }

  // Filter out substances that already have quotes (unless --overwrite)
  // Note: articleSources is now an array of slugs (strings) for batch mode
  const isSlugArray = articleSources.length > 0 && typeof articleSources[0] === 'string';

  if (!options.overwrite && isSlugArray) {
    console.log("\nChecking existing quotes...");
    const existingQuotes = await convexClient.query(api.quotes.getAllMetadata);
    const existingSlugs = new Set(existingQuotes.filter(q => q.section === "harm_potential").map(q => q.slug));

    const beforeCount = articleSources.length;
    articleSources = articleSources.filter(slug => !existingSlugs.has(slug));
    console.log(`  Skipping ${beforeCount - articleSources.length} with existing quotes`);
    console.log(`  Remaining: ${articleSources.length}`);
  }

  // Apply limit
  if (options.limit && articleSources.length > options.limit) {
    articleSources = articleSources.slice(0, options.limit);
    console.log(`  Limited to: ${articleSources.length}`);
  }

  if (articleSources.length === 0) {
    console.log("\nNo substances to process.");
    return;
  }

  // Dry run preview
  if (options.dryRun) {
    console.log("\n[DRY RUN] Would process:");
    for (const item of articleSources.slice(0, 20)) {
      const slug = typeof item === 'string' ? item : item.slug;
      console.log(`  - ${slug}`);
    }
    if (articleSources.length > 20) {
      console.log(`  ... and ${articleSources.length - 20} more`);
    }
    return;
  }

  console.log(`\nProcessing ${articleSources.length} substances...\n`);

  const startTime = Date.now();
  let completed = 0;
  let failed = 0;
  let skipped = 0;
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  const failedItems = [];

  // Process in batches
  for (let i = 0; i < articleSources.length; i += options.concurrency) {
    const batch = articleSources.slice(i, i + options.concurrency);

    const promises = batch.map(async (item) => {
      // Handle both slug strings and full source objects
      const slug = typeof item === 'string' ? item : item.slug;

      try {
        // Load full source if we only have a slug
        let source = typeof item === 'string'
          ? await convexClient.query(api.articleSources.getBySlug, { slug })
          : item;

        if (!source) {
          return { slug, status: "skipped", reason: "No source data found" };
        }

        if (options.verbose) {
          console.log(`  Processing: ${source.substanceName}`);
        }

        const result = await processSubstance(apiKey, source, options.verbose);

        if (result.status === "success") {
          // Save to Convex
          await convexClient.mutation(api.quotes.save, {
            slug: result.slug,
            section: "harm_potential",
            content: result.content,
            updatedBy: "batch-extract-script",
          });

          totalPromptTokens += result.promptTokens;
          totalCompletionTokens += result.completionTokens;

          if (options.verbose) {
            console.log(`  Saved: ${result.slug} (${result.tokens} tokens)`);
          }
        } else if (options.verbose) {
          console.log(`  Skipped: ${result.slug} - ${result.reason}`);
        }

        return result;
      } catch (error) {
        console.error(`  Failed: ${slug} - ${error.message}`);
        return { slug, status: "failed", error: error.message };
      }
    });

    const results = await Promise.all(promises);

    for (const result of results) {
      if (result.status === "success") {
        completed++;
      } else if (result.status === "skipped") {
        skipped++;
      } else if (result.status === "failed") {
        failed++;
        failedItems.push({ slug: result.slug, error: result.error });
      }
    }

    const done = completed + failed + skipped;
    process.stdout.write(`\rProgress: ${done}/${articleSources.length} (${completed} ok, ${failed} failed, ${skipped} skipped)`);
  }

  console.log();

  const duration = (Date.now() - startTime) / 1000;
  const estimatedCost = calculateCost(totalPromptTokens, totalCompletionTokens);

  console.log("\n" + "=".repeat(50));
  console.log("Complete!");
  console.log("=".repeat(50));

  console.log(`\nResults:`);
  console.log(`  Successful: ${completed}`);
  console.log(`  Failed: ${failed}`);
  console.log(`  Skipped: ${skipped}`);
  console.log(`  Duration: ${duration.toFixed(1)}s`);

  console.log(`\nTokens:`);
  console.log(`  Input: ${totalPromptTokens.toLocaleString()}`);
  console.log(`  Output: ${totalCompletionTokens.toLocaleString()}`);
  console.log(`  Estimated Cost: $${estimatedCost.toFixed(4)}`);
  console.log(`  Avg Cost/Substance: $${(estimatedCost / Math.max(completed, 1)).toFixed(4)}`);

  if (failed > 0) {
    console.log(`\nFailed substances:`);
    for (const item of failedItems) {
      console.log(`  - ${item.slug}: ${item.error}`);
    }
  }
}

main().catch(error => {
  console.error("Fatal error:", error);
  process.exit(1);
});
