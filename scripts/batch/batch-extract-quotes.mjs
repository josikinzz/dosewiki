#!/usr/bin/env node
/**
 * Batch Quote Extraction Script
 *
 * Extracts legality, tolerance, subjective effects, or intro text quotes
 * from substance source files using OpenRouter's Gemini Flash 3 API.
 *
 * Usage:
 *   export OPENROUTER_API_KEY="sk-or-..."
 *   node scripts/batch-extract-quotes.mjs --category=legality
 *
 * Options:
 *   --category=<legality|tolerance|subjective-effects|intro-text>  (required)
 *   --concurrency=5        Parallel API requests (default: 5)
 *   --sequential           Process one file at a time (for large files)
 *   --dry-run              Preview without API calls or writing files
 *   --resume               Skip already completed items
 *   --slugs=lsd,mdma       Process specific slugs only (comma-separated)
 *   --limit=50             Process only N items then stop
 *   --verbose              Show detailed progress output
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { callOpenRouterChat } from "../lib/openrouter-sdk.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "../..");

// Configuration
const CONFIG = {
  model: "google/gemini-3-flash-preview",
  maxTokens: 16384,
  temperature: 0.3,
  concurrency: 5,
  retryAttempts: 3,
  retryDelayMs: 2000,
  largeFileThreshold: 100000, // 100KB - files larger than this get special handling
  sourcesDir: join(PROJECT_ROOT, "src/data/article-sources"),
  promptsDir: join(PROJECT_ROOT, "scripts/prompts"),
  articlesFile: join(PROJECT_ROOT, "src/data/SubstanceIndex.json"),
};

// Category configurations
const CATEGORIES = {
  legality: {
    promptFile: "legality-extraction.md",
    outputDir: "quotes/legality-quotes",
    outputSuffix: "-legality.md",
    title: "Legality Quotes",
    excludedSources: [],
  },
  tolerance: {
    promptFile: "tolerance-extraction.md",
    outputDir: "quotes/tolerance-quotes",
    outputSuffix: "-tolerance.md",
    title: "Tolerance Quotes",
    excludedSources: [],
  },
  "subjective-effects": {
    promptFile: "subjective-effects-extraction.md",
    outputDir: "quotes/subjective-effects-quotes",
    outputSuffix: "-subjective-effects.md",
    title: "Subjective Effects Quotes",
    excludedSources: ["psychonautwiki", "disregardeverythingisay"],
  },
  "intro-text": {
    promptFile: "intro-text-extraction.md",
    outputDir: "quotes/intro-text-quotes",
    outputSuffix: "-intro-text.md",
    title: "Intro Text Quotes",
    excludedSources: [],
  },
};

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    category: null,
    concurrency: CONFIG.concurrency,
    sequential: false,
    dryRun: false,
    resume: false,
    slugs: null,
    limit: null,
    verbose: false,
  };

  for (const arg of args) {
    if (arg.startsWith("--category=")) {
      options.category = arg.split("=")[1];
    } else if (arg.startsWith("--concurrency=")) {
      options.concurrency = parseInt(arg.split("=")[1], 10);
    } else if (arg === "--sequential") {
      options.sequential = true;
      options.concurrency = 1;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--resume") {
      options.resume = true;
    } else if (arg.startsWith("--slugs=")) {
      options.slugs = arg.split("=")[1].split(",").map(s => s.trim());
    } else if (arg.startsWith("--limit=")) {
      options.limit = parseInt(arg.split("=")[1], 10);
    } else if (arg === "--verbose") {
      options.verbose = true;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
  }

  return options;
}

function printHelp() {
  console.log(`
Batch Quote Extraction Script

Usage:
  export OPENROUTER_API_KEY="sk-or-..."
  node scripts/batch-extract-quotes.mjs --category=legality

Options:
  --category=<category>   Required. One of: legality, tolerance, subjective-effects, intro-text
  --concurrency=<n>       Number of parallel API requests (default: 5)
  --sequential            Process one file at a time (recommended for large files)
  --dry-run               Preview what would be processed without making API calls
  --resume                Skip already completed items
  --slugs=<list>          Process only specific slugs (comma-separated)
  --limit=<n>             Process at most N items then stop
  --verbose               Show detailed progress output
  --help, -h              Show this help message

Examples:
  node scripts/batch-extract-quotes.mjs --category=legality --resume
  node scripts/batch-extract-quotes.mjs --category=tolerance --sequential
  node scripts/batch-extract-quotes.mjs --category=intro-text --dry-run
`);
}

// Load extraction prompt for category
function loadPrompt(category) {
  const config = CATEGORIES[category];
  const promptPath = join(CONFIG.promptsDir, config.promptFile);

  if (!existsSync(promptPath)) {
    throw new Error(`Prompt file not found: ${promptPath}`);
  }

  return readFileSync(promptPath, "utf-8");
}

// Convert title to slug
function titleToSlug(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Get slugs from SubstanceIndex.json filtered by priority (high/normal only)
function getPrioritySlugs() {
  if (!existsSync(CONFIG.articlesFile)) {
    console.error("Error: SubstanceIndex.json not found at", CONFIG.articlesFile);
    process.exit(1);
  }

  const articles = JSON.parse(readFileSync(CONFIG.articlesFile, "utf-8"));
  return articles
    .filter(a => a.priority === "high" || a.priority === "normal")
    .map(a => titleToSlug(a.title))
    .sort();
}

// Get source file size in bytes
function getSourceFileSize(slug) {
  const filePath = join(CONFIG.sourcesDir, `${slug}.ts`);
  if (!existsSync(filePath)) return 0;
  return statSync(filePath).size;
}

// Check for large files and warn
function checkForLargeFiles(slugs, verbose) {
  const largeFiles = [];
  for (const slug of slugs) {
    const size = getSourceFileSize(slug);
    if (size > CONFIG.largeFileThreshold) {
      largeFiles.push({ slug, size: Math.round(size / 1024) });
    }
  }

  if (largeFiles.length > 0 && verbose) {
    console.log(`\nLarge files detected (>${Math.round(CONFIG.largeFileThreshold / 1024)}KB):`);
    for (const f of largeFiles.slice(0, 5)) {
      console.log(`  - ${f.slug}: ${f.size}KB`);
    }
    if (largeFiles.length > 5) {
      console.log(`  ... and ${largeFiles.length - 5} more`);
    }
    console.log(`Consider using --sequential for these files.\n`);
  }

  return largeFiles;
}

// Load and parse a source file
function loadSourceFile(slug) {
  const filePath = join(CONFIG.sourcesDir, `${slug}.ts`);

  if (!existsSync(filePath)) {
    return null;
  }

  const content = readFileSync(filePath, "utf-8");

  // Match substanceName
  const nameMatch = content.match(/export const substanceName\s*=\s*["']([^"']+)["']/);
  const substanceName = nameMatch ? nameMatch[1] : slug;

  // Match sources array
  const sourcesMatch = content.match(/export const sources\s*=\s*(\[[\s\S]*?\]);/);
  let sources = [];
  if (sourcesMatch) {
    try {
      sources = JSON.parse(sourcesMatch[1]);
    } catch (e) {
      console.error(`Failed to parse sources for ${slug}:`, e.message);
    }
  }

  // Match contents object
  const contentsStart = content.indexOf("export const contents");
  if (contentsStart === -1) {
    return { substanceName, sources, contents: {} };
  }

  const contents = {};
  const contentsSection = content.slice(contentsStart);

  for (const source of sources) {
    const key = source.id;
    const keyPattern = new RegExp(`["']${key}["']\\s*:\\s*\`([\\s\\S]*?)\`(?=,\\s*["']|\\s*\\})`);
    const match = contentsSection.match(keyPattern);
    if (match) {
      contents[key] = match[1];
    }
  }

  return { substanceName, sources, contents };
}

// Build user message with source content
function buildUserMessage(substanceName, sources, contents, category) {
  const config = CATEGORIES[category];
  const excludedSources = config.excludedSources || [];

  let message = `# Substance: ${substanceName}\n\n`;
  message += `Please extract ${category.replace("-", " ")} content from the following sources.\n\n`;

  for (const source of sources) {
    const sourceContent = contents[source.id];
    const isExcluded = excludedSources.includes(source.id);

    message += `---\n\n`;
    message += `## Source: ${source.displayName}\n`;
    message += `Source ID: ${source.id}\n\n`;

    if (isExcluded) {
      message += `*This source is EXCLUDED from ${category} extraction - skip it.*\n\n`;
    } else if (sourceContent) {
      message += `\`\`\`markdown\n${sourceContent}\n\`\`\`\n\n`;
    } else {
      message += `*No content available for this source.*\n\n`;
    }
  }

  return message;
}

// Call OpenRouter API (non-streaming)
async function callOpenRouter(apiKey, systemPrompt, userMessage) {
  return callOpenRouterChat({
    apiKey,
    appTitle: "Dose.wiki Batch Quote Extraction",
    model: CONFIG.model,
    systemPrompt,
    userMessage,
    temperature: CONFIG.temperature,
    maxTokens: CONFIG.maxTokens,
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

// Format output markdown file
function formatOutputFile(substanceName, category, extractedContent) {
  const config = CATEGORIES[category];
  const date = new Date().toISOString().split("T")[0];

  return `# ${substanceName} - ${config.title}

> Verbatim extractions from source articles. Generated ${date}.

${extractedContent}
`;
}

// Save output file
function saveOutput(slug, category, content) {
  const config = CATEGORIES[category];
  const outputDir = join(PROJECT_ROOT, config.outputDir);

  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  const outputPath = join(outputDir, `${slug}${config.outputSuffix}`);
  writeFileSync(outputPath, content, "utf-8");
  return outputPath;
}

// Check if output file already exists
function outputExists(slug, category) {
  const config = CATEGORIES[category];
  const outputDir = join(PROJECT_ROOT, config.outputDir);
  return existsSync(join(outputDir, `${slug}${config.outputSuffix}`));
}

// Process a single substance - returns only status info, clears data after save
async function processSubstance(apiKey, slug, category, systemPrompt, verbose) {
  // Load source file
  let sourceData = loadSourceFile(slug);

  if (!sourceData) {
    return { slug, status: "skipped", reason: "No source file", tokens: 0 };
  }

  if (sourceData.sources.length === 0) {
    return { slug, status: "skipped", reason: "No sources in file", tokens: 0 };
  }

  // Build user message
  const userMessage = buildUserMessage(
    sourceData.substanceName,
    sourceData.sources,
    sourceData.contents,
    category
  );

  // Clear source data from memory immediately
  const substanceName = sourceData.substanceName;
  sourceData = null;

  // Call API with retry
  const result = await callWithRetry(() =>
    callOpenRouter(apiKey, systemPrompt, userMessage)
  );

  // Format and save output immediately
  const formattedContent = formatOutputFile(substanceName, category, result.content);
  saveOutput(slug, category, formattedContent);

  // Return only minimal info needed for tracking
  return {
    slug,
    status: "success",
    tokens: result.usage.totalTokens,
    promptTokens: result.usage.promptTokens,
    completionTokens: result.usage.completionTokens,
  };
}

// Process substances with controlled concurrency
async function processAll(apiKey, slugs, category, systemPrompt, options) {
  const { concurrency, verbose, dryRun } = options;

  // Track progress without storing full results
  let completed = 0;
  let failed = 0;
  let skipped = 0;
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  const failedItems = [];

  const total = slugs.length;

  // Process in batches to control memory
  for (let i = 0; i < slugs.length; i += concurrency) {
    const batch = slugs.slice(i, i + concurrency);

    const promises = batch.map(async (slug) => {
      if (verbose) {
        console.log(`  Processing: ${slug}`);
      }

      if (dryRun) {
        return { slug, status: "dry-run", tokens: 0 };
      }

      try {
        const result = await processSubstance(apiKey, slug, category, systemPrompt, verbose);

        if (result.status === "success") {
          totalPromptTokens += result.promptTokens;
          totalCompletionTokens += result.completionTokens;
          if (verbose) {
            console.log(`  Completed: ${slug} (${result.tokens} tokens)`);
          }
        } else if (result.status === "skipped" && verbose) {
          console.log(`  Skipped: ${slug} - ${result.reason}`);
        }

        return result;
      } catch (error) {
        console.error(`  Failed: ${slug} - ${error.message}`);
        return { slug, status: "failed", error: error.message };
      }
    });

    const results = await Promise.all(promises);

    // Update counts immediately, don't store results
    for (const result of results) {
      if (result.status === "success" || result.status === "dry-run") {
        completed++;
      } else if (result.status === "skipped") {
        skipped++;
      } else if (result.status === "failed") {
        failed++;
        failedItems.push({ slug: result.slug, error: result.error });
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
  };
}

// Main function
async function main() {
  const options = parseArgs();

  if (!options.category || !CATEGORIES[options.category]) {
    console.error("Error: --category is required. Valid options: legality, tolerance, subjective-effects, intro-text");
    process.exit(1);
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey && !options.dryRun) {
    console.error("Error: OPENROUTER_API_KEY environment variable is required");
    process.exit(1);
  }

  const category = options.category;
  const config = CATEGORIES[category];

  console.log(`\nBatch Quote Extraction: ${category}`);
  console.log("=".repeat(50));

  console.log(`Loading prompt from: ${config.promptFile}`);
  const systemPrompt = loadPrompt(category);

  // Get slugs to process
  let slugs;
  if (options.slugs) {
    slugs = options.slugs;
    console.log(`Processing specific slugs: ${slugs.length}`);
  } else {
    slugs = getPrioritySlugs();
    console.log(`Priority substances (high/normal): ${slugs.length}`);
  }

  // Filter completed items
  if (options.resume) {
    const alreadyDone = slugs.filter(slug => outputExists(slug, category));
    slugs = slugs.filter(slug => !outputExists(slug, category));
    console.log(`Already completed: ${alreadyDone.length}`);
    console.log(`Remaining to process: ${slugs.length}`);
  }

  // Apply limit
  if (options.limit && slugs.length > options.limit) {
    slugs = slugs.slice(0, options.limit);
    console.log(`Limited to: ${slugs.length} items`);
  }

  if (slugs.length === 0) {
    console.log("\nNo substances to process. All done!");
    return;
  }

  // Check for large files
  checkForLargeFiles(slugs, options.verbose);

  // Dry run preview
  if (options.dryRun) {
    console.log("\n[DRY RUN] Would process:");
    for (const slug of slugs.slice(0, 20)) {
      const size = getSourceFileSize(slug);
      const sizeStr = size > 0 ? ` (${Math.round(size / 1024)}KB)` : " (no file)";
      console.log(`  - ${slug}${sizeStr}`);
    }
    if (slugs.length > 20) {
      console.log(`  ... and ${slugs.length - 20} more`);
    }
    return;
  }

  const mode = options.sequential ? "sequential" : `${options.concurrency} concurrent`;
  console.log(`\nProcessing ${slugs.length} items (${mode})...`);
  console.log(`Output: ${config.outputDir}/\n`);

  const startTime = Date.now();

  const results = await processAll(apiKey, slugs, category, systemPrompt, options);

  const endTime = Date.now();
  const duration = (endTime - startTime) / 1000;

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

  if (results.failed > 0) {
    console.log(`\nFailed:`);
    for (const item of results.failedItems) {
      console.log(`  - ${item.slug}: ${item.error}`);
    }
  }

  // JSON output for programmatic use
  console.log(`\n[JSON]`);
  console.log(JSON.stringify({
    category,
    successful: results.completed,
    failed: results.failed,
    skipped: results.skipped,
    tokens: { input: results.totalPromptTokens, output: results.totalCompletionTokens },
    duration: duration,
    failedItems: results.failedItems,
  }, null, 2));
}

main().catch(error => {
  console.error("Fatal error:", error);
  process.exit(1);
});
