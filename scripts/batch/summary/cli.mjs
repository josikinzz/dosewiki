export function createDefaultOptions(config) {
  return {
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
  };
}

export function parseArgsFromArgv(argv, config, inputBounds) {
  const options = createDefaultOptions(config);

  for (const arg of argv) {
    if (arg.startsWith("--concurrency=")) {
      const value = parseInt(arg.split("=")[1], 10);
      options.concurrency = Math.min(
        Math.max(Number.isNaN(value) ? config.maxConcurrency : value, inputBounds.concurrency.min),
        inputBounds.concurrency.max,
      );
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--verbose") {
      options.verbose = true;
    } else if (arg.startsWith("--substance=")) {
      options.substance = arg.split("=")[1];
    } else if (arg.startsWith("--slugs=")) {
      options.slugs = arg
        .split("=")[1]
        .split(",")
        .map((slug) => slug.trim())
        .filter(Boolean);
    } else if (arg.startsWith("--limit=")) {
      const value = parseInt(arg.split("=")[1], 10);
      if (Number.isNaN(value)) {
        options.limit = null;
      } else {
        options.limit = Math.min(
          Math.max(value, inputBounds.limit.min),
          inputBounds.limit.max,
        );
      }
    } else if (arg === "--all") {
      options.all = true;
    } else if (arg === "--include-existing") {
      options.includeExisting = true;
    } else if (arg === "--skip-backup") {
      options.skipBackup = true;
    } else if (arg.startsWith("--source-url=")) {
      options.sourceUrl = arg.split("=")[1];
    } else if (arg.startsWith("--target-url=")) {
      options.targetUrl = arg.split("=")[1];
    } else if (arg.startsWith("--reasoning-effort=")) {
      options.reasoningEffort = arg.split("=")[1];
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    }
  }

  return options;
}

export function parseArgs(config, inputBounds, argv = process.argv.slice(2)) {
  return parseArgsFromArgv(argv, config, inputBounds);
}

export function formatHelpText() {
  return `
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
  --source-url=<url>        Override the source Convex deployment
  --target-url=<url>        Override the target Convex deployment
  --reasoning-effort=<lvl>  minimal|low|medium|high|xhigh (default: high)
  --help, -h                Show this help message
`;
}

export function printHelp(log = console.log) {
  log(formatHelpText());
}

export function getSourceUrl(options, env = process.env) {
  return (
    options.sourceUrl ||
    env.SOURCE_CONVEX_URL ||
    env.CONVEX_PUBLIC_READ_URL ||
    env.CONVEX_URL ||
    env.VITE_CONVEX_URL ||
    env.NEXT_PUBLIC_CONVEX_URL ||
    null
  );
}

export function getTargetUrl(options, sourceUrl, env = process.env) {
  return options.targetUrl || env.TARGET_CONVEX_URL || sourceUrl || null;
}
