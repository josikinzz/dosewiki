import { join, dirname } from "path";
import { fileURLToPath } from "url";

import { parseBatchCliArgs } from "../lib/cli-options.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "../..", "..");

export const CONFIG = {
  model: process.env.OPENROUTER_MODEL || "google/gemini-3-flash-preview",
  maxTokens: 16384,
  temperature: 0.3,
  reasoningEffort: process.env.OPENROUTER_REASONING_EFFORT || "high",
  concurrency: 5,
  retryAttempts: 3,
  retryDelayMs: 2000,
  largeFileThreshold: 100000,
  sourcesDir: join(PROJECT_ROOT, "src/data/article-sources"),
  promptsDir: join(PROJECT_ROOT, "content/prompts/extraction"),
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
      overwrite: false,
      source: "local",
      save: "local",
      sourceUrl: null,
      targetUrl: null,
      reasoningEffort: CONFIG.reasoningEffort,
      slugs: null,
      limit: null,
      verbose: false,
      help: false,
    },
    booleanFlags: ["sequential", "dry-run", "resume", "overwrite", "verbose"],
    stringFlags: ["category", "source", "save", "sourceUrl", "targetUrl", "reasoningEffort"],
    csvFlags: ["slugs"],
    numberFlags: [
      { name: "concurrency", fallbackOnNaN: CONFIG.concurrency, bounds: { min: 1, max: 50 } },
      { name: "limit", fallbackOnNaN: null, bounds: { min: 1, max: 10000 } },
    ],
    aliases: {
      "dry-run": "dryRun",
      "source-url": "sourceUrl",
      "target": "targetUrl",
      "reasoning-effort": "reasoningEffort",
    },
  });
}
