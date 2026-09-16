import { parseBatchCliArgs } from "../lib/cli-options.mjs";

function createDefaultOptions(config) { return {
  concurrency: config.maxConcurrency,
  dryRun: false,
  verbose: false,
  substance: null,
  slugs: null,
  limit: null,
  all: false,
  includeExisting: false,
  skipBackup: false,
  sourceUrl: null,
  targetUrl: null,
  reasoningEffort: config.reasoningEffort,
  help: false,
}; }

export function parseArgsFromArgv(argv, config, inputBounds) {
  return parseBatchCliArgs(argv, {
    defaults: createDefaultOptions(config),
    booleanFlags: ["dry-run", "verbose", "all", "include-existing", "skip-backup"],
    stringFlags: ["substance", "sourceUrl", "targetUrl", "reasoningEffort"],
    csvFlags: ["slugs"],
    numberFlags: [
      { name: "concurrency", fallbackOnNaN: config.maxConcurrency, bounds: inputBounds.concurrency },
      { name: "limit", fallbackOnNaN: null, bounds: inputBounds.limit },
    ],
    aliases: {
      "dry-run": "dryRun",
      "include-existing": "includeExisting",
      "skip-backup": "skipBackup",
      "source-url": "sourceUrl",
      "target": "targetUrl",
      "reasoning-effort": "reasoningEffort",
    },
  });
}

export function parseArgs(config, inputBounds, argv = process.argv.slice(2)) {
  return parseArgsFromArgv(argv, config, inputBounds);
}

function formatHelpText() { return `
Batch Summary Section Generation Script

Usage:
node scripts/batch/batch-generate-summary.mjs [options]

Options:
--dry-run                 Preview selection without generation or saving
--verbose                 Show detailed progress output
--substance=<slug>        Process a single substance
--slugs=<a,b,c>           Process a comma-separated list of slugs
--concurrency=<n>         Number of parallel generations (default: 2)
--limit=<n>               Process at most N substances
--all                     Include low-priority articles (default is high/normal only)
--include-existing        Regenerate articles that already have a summary
--skip-backup             Skip backup export for target articles
--source-url=<url>        Override the source Postgres deployment
--target=<url>        Override the target Postgres deployment
--reasoning-effort=<lvl>  minimal|low|medium|high|xhigh (default: high)
--help, -h                Show this help message
`; }

export function printHelp(log = console.log) {
  log(formatHelpText());
}
