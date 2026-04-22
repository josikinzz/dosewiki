const DIVIDER = "=".repeat(50);

export function printBatchBanner({ title, config, options, details = [], log = console.log }) {
  log(`\n${title}`);
  log(DIVIDER);

  if (config?.model) {
    log(`Model: ${config.model}`);
  }
  if (config?.reasoningEffort) {
    log(`Reasoning Effort: ${config.reasoningEffort}`);
  }
  if (typeof options?.concurrency === "number") {
    log(`Concurrency: ${options.concurrency}`);
  }

  for (const detail of details) {
    if (!detail || detail.value === undefined || detail.value === null) {
      continue;
    }
    log(`${detail.label}: ${detail.value}`);
  }
}

export function printBatchSummary({
  results,
  durationSeconds,
  artifacts = [],
  failedItems = [],
  formatFailedItem = defaultFailedItemFormatter,
  extraSections = [],
  log = console.log,
}) {
  log(`\n${DIVIDER}`);
  log("Complete!");
  log(DIVIDER);

  log(`\nResults:`);
  log(`  Successful: ${results.completed ?? 0}`);
  log(`  Failed: ${results.failed ?? 0}`);
  log(`  Skipped: ${results.skipped ?? 0}`);
  log(`  Duration: ${durationSeconds.toFixed(1)}s`);

  if (
    typeof results.totalPromptTokens === "number" ||
    typeof results.totalCompletionTokens === "number"
  ) {
    log(`\nTokens:`);
    log(`  Input: ${(results.totalPromptTokens ?? 0).toLocaleString()}`);
    log(`  Output: ${(results.totalCompletionTokens ?? 0).toLocaleString()}`);
  }

  if (artifacts.length > 0) {
    log(`\nArtifacts:`);
    for (const artifact of artifacts) {
      if (!artifact || !artifact.path) {
        continue;
      }
      log(`  ${artifact.label}: ${artifact.path}`);
    }
  }

  for (const section of extraSections) {
    if (!section?.lines?.length) {
      continue;
    }
    log(`\n${section.title}:`);
    for (const line of section.lines) {
      log(`  ${line}`);
    }
  }

  if (failedItems.length > 0) {
    log(`\nFailed articles:`);
    for (const item of failedItems) {
      log(`  - ${formatFailedItem(item)}`);
    }
  }
}

export async function runBatchGenerator({
  parseOptions,
  printHelp,
  execute,
  handleFatal,
  errorLog = console.error,
  exit = process.exit,
}) {
  const options = parseOptions();

  if (options?.help) {
    printHelp();
    exit(0);
    return null;
  }

  try {
    return await execute(options);
  } catch (error) {
    errorLog("Fatal error:", error);
    await handleFatal?.(error, options);
    exit(1);
    return null;
  }
}

function defaultFailedItemFormatter(item) {
  const label = item?.slug ?? item?.title ?? "unknown";
  return `${label}: ${item?.error ?? "Unknown error"}`;
}
