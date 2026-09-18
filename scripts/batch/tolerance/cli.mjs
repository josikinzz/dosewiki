import { join, dirname } from "path";
import { fileURLToPath } from "url";

import { parseBatchCliArgs } from "../lib/cli-options.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "../..", "..");

export const CONFIG = {
  model: process.env.OPENROUTER_MODEL || "anthropic/claude-opus-4.5",
  maxTokens: 4096,
  temperature: 0.3,
  maxConcurrency: 3,
  retryAttempts: 3,
  retryDelayMs: 2000,
  reasoningEffort: "high",
  articlesFile: join(PROJECT_ROOT, "src/data/SubstanceIndex.json"),
  backupFile: join(PROJECT_ROOT, "src/data/backups/articles.backup.json"),
  promptFallbackFile: join(PROJECT_ROOT, "content/prompts/sections/tolerance.md"),
};

const INPUT_BOUNDS = {
  concurrency: { min: 1, max: 50 },
  limit: { min: 1, max: 10000 },
}

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
      includeExisting: false,
      help: false,
    },
    booleanFlags: ["dry-run", "verbose", "skip-backup", "all", "include-existing"],
    stringFlags: ["substance", "sourceUrl", "targetUrl"],
    csvFlags: ["slugs"],
    numberFlags: [
      { name: "concurrency", fallbackOnNaN: CONFIG.maxConcurrency, bounds: INPUT_BOUNDS.concurrency },
      { name: "limit", fallbackOnNaN: null, bounds: INPUT_BOUNDS.limit },
    ],
    aliases: {
      "dry-run": "dryRun",
      "skip-backup": "skipBackup",
      "include-existing": "includeExisting",
      "source-url": "sourceUrl",
      "target": "targetUrl",
    },
  });
}

export function printHelp() {
  console.log(`
Batch Tolerance Section Generation Script

Regenerates tolerance sections using Claude Opus 4.5 via OpenRouter.
`);
}
