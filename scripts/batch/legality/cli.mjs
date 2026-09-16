import { join, dirname } from "path";
import { fileURLToPath } from "url";

import { parseBatchCliArgs } from "../lib/cli-options.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "../..", "..");

export const CONFIG = {
  model: "anthropic/claude-opus-4.5",
  maxTokens: 16384,
  temperature: 0.3,
  maxConcurrency: 3,
  retryAttempts: 3,
  retryDelayMs: 2000,
  reasoningEffort: "high",
  articlesFile: join(PROJECT_ROOT, "src/data/SubstanceIndex.json"),
  backupFile: join(PROJECT_ROOT, "src/data/backups/articles.backup.json"),
};

export function parseArgs() {
  const bounds = { concurrency: { min: 1, max: 50 }, limit: { min: 1, max: 10000 } };
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
      help: false,
    },
    booleanFlags: ["dry-run", "verbose", "skip-backup"],
    stringFlags: ["substance", "sourceUrl", "targetUrl"],
    csvFlags: ["slugs"],
    numberFlags: [
      { name: "concurrency", fallbackOnNaN: CONFIG.maxConcurrency, bounds: bounds.concurrency },
      { name: "limit", fallbackOnNaN: null, bounds: bounds.limit },
    ],
    aliases: {
      "dry-run": "dryRun",
      "skip-backup": "skipBackup",
      "source-url": "sourceUrl",
      "target": "targetUrl",
    },
  });
}

export function printHelp() {
  console.log(`
Batch Legality Section Generation Script

Regenerates legality sections using Claude Opus 4.5 via OpenRouter.
`);
}
