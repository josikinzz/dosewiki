import { join, dirname } from "path";
import { fileURLToPath } from "url";

import { INPUT_BOUNDS, parseArgs as parsePharmacologyArgs } from "./lib.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "../..", "..");

export const CONFIG = {
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

export function parseArgs() {
  return parsePharmacologyArgs(process.argv.slice(2), CONFIG, INPUT_BOUNDS);
}

export function printHelp() {
  console.log(`
Batch Pharmacology Section Generation Script

Generates pharmacology sections using Claude Opus 4.5 via OpenRouter.

Usage:
  export OPENROUTER_API_KEY="sk-or-..."
  export POSTGRES_POOLED_URL="postgresql://localhost/dosewiki"
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
