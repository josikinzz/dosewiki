import { join, dirname } from "path";
import { fileURLToPath } from "url";

import { parseBatchCliArgs } from "../lib/cli-options.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "../..", "..");

export const CONFIG = {
  model: "anthropic/claude-haiku-4.5",
  maxTokens: 8192,
  temperature: 0.3,
  maxConcurrency: 5,
  retryAttempts: 3,
  retryDelayMs: 2000,
  reasoningEffort: "medium",
  articlesFile: join(PROJECT_ROOT, "src/data/SubstanceIndex.json"),
  quotesDir: join(PROJECT_ROOT, "quotes/dosage-duration-quotes"),
  backupFile: join(PROJECT_ROOT, "src/data/backups/articles.backup.json"),
  progressFile: join(PROJECT_ROOT, "notes-and-plans/exports/batch/batch-dosage-duration-progress.json"),
  promptFallbackFile: join(PROJECT_ROOT, "content/prompts/sections/dosageDuration.md"),
  skipArticles: ["dextromethorphan", "ketamine"],
};

export function parseArgs() {
  return parseBatchCliArgs(process.argv.slice(2), {
    defaults: {
      concurrency: CONFIG.maxConcurrency,
      dryRun: false,
      verbose: false,
      substance: null,
      slugs: null,
      limit: null,
      skipBackup: false,
      sourceUrl: null,
      targetUrl: null,
      all: false,
      newOnly: false,
      help: false,
    },
    booleanFlags: ["dry-run", "verbose", "skip-backup", "all", "new-only"],
    stringFlags: ["substance", "sourceUrl", "targetUrl"],
    csvFlags: ["slugs"],
    numberFlags: [
      { name: "concurrency", fallbackOnNaN: CONFIG.maxConcurrency, bounds: { min: 1, max: 50 } },
      { name: "limit", fallbackOnNaN: null, bounds: { min: 1, max: 10000 } },
    ],
    aliases: {
      "dry-run": "dryRun",
      "skip-backup": "skipBackup",
      "new-only": "newOnly",
      "source-url": "sourceUrl",
      "target": "targetUrl",
    },
  });
}

export function printHelp() {
  console.log(`
Batch Dosage & Duration Section Generation Script (Review Mode)

Regenerates dosage and duration sections using Claude Opus 4.5 via OpenRouter.
This script operates in REVIEW MODE - existing content is included in context
for improvement, not generated from scratch.

Pharmacology-owned fields (bioavailability, half_life) are PRESERVED.

Usage:
  export OPENROUTER_API_KEY="sk-or-..."
  export POSTGRES_POOLED_URL="postgresql://localhost/dosewiki"
  node scripts/batch/batch-generate-dosage-duration.mjs

Options:
  --dry-run              Preview without API calls or saving
  --verbose              Show detailed progress output
  --substance=<slug>     Process single substance only
  --slugs=<a,b,c>        Process a comma-separated list of slugs
  --concurrency=<n>      Number of parallel API requests (default: 5)
  --limit=<n>            Process at most N items then stop
  --skip-backup          Don't create backup file
  --source-url=<url>     Override the source Postgres deployment
  --target=<url>     Override the target Postgres deployment
  --all                  Process all articles with quotes (not just those with existing content)
  --new-only             Process only articles with quotes but WITHOUT existing content
  --help, -h             Show this help message
`);
}
