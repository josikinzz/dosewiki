import { join, dirname } from "path";
import { fileURLToPath } from "url";

import { parseBatchCliArgs } from "../lib/cli-options.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "../..", "..");

export const CONFIG = {
  model: "google/gemini-3-flash-preview",
  maxTokens: 16384,
  temperature: 0.3,
  concurrency: 5,
  retryAttempts: 3,
  retryDelayMs: 2000,
  largeFileThreshold: 100000,
  sourcesDir: join(PROJECT_ROOT, "src/data/article-sources"),
  promptsDir: join(PROJECT_ROOT, "scripts/prompts"),
  articlesFile: join(PROJECT_ROOT, "src/data/SubstanceIndex.json"),
  projectRoot: PROJECT_ROOT,
};

export function parseArgs() {
  return parseBatchCliArgs(process.argv.slice(2), {
    defaults: {
      category: null,
      concurrency: CONFIG.concurrency,
      sequential: false,
      dryRun: false,
      resume: false,
      slugs: null,
      limit: null,
      verbose: false,
      help: false,
    },
    booleanFlags: ["sequential", "dry-run", "resume", "verbose"],
    stringFlags: ["category"],
    csvFlags: ["slugs"],
    numberFlags: [
      { name: "concurrency", fallbackOnNaN: CONFIG.concurrency, bounds: { min: 1, max: 50 } },
      { name: "limit", fallbackOnNaN: null, bounds: { min: 1, max: 10000 } },
    ],
    aliases: {
      "dry-run": "dryRun",
    },
  });
}

export function printHelp() {
  console.log(`
Batch Quote Extraction Script

Usage:
  export OPENROUTER_API_KEY="sk-or-..."
  node scripts/batch/batch-extract-quotes.mjs --category=legality
`);
}
