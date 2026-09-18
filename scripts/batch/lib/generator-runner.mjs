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

export async function runBatchLifecycle({
  items,
  options,
  getItemLabel = defaultItemLabel,
  getItemSlug = defaultItemSlug,
  getItemTitle = getItemLabel,
  processItem,
  createDryRunResult,
  persistSuccessfulResult,
  onResult,
  onBatchStart,
  onProgress,
  onFatalProgress,
  formatProgress = defaultProgressFormatter,
  log = console.log,
  errorLog = console.error,
  stdout = process.stdout,
  now = () => new Date().toISOString(),
}) {
  const concurrency = Math.max(1, options?.concurrency ?? 1);
  const dryRun = Boolean(options?.dryRun);
  const verbose = Boolean(options?.verbose);
  const startedAt = now();
  const state = createInitialLifecycleState(items.length, startedAt);

  try {
    await onProgress?.({ ...state, status: "running", currentBatch: [] });

    for (let index = 0; index < items.length; index += concurrency) {
      const batch = items.slice(index, index + concurrency);
      const batchLabels = batch.map((item) => getItemLabel(item));

      await onBatchStart?.({ batch, batchLabels, state: { ...state } });

      const results = await Promise.all(
        batch.map(async (item) => {
          const slug = getItemSlug(item);
          const title = getItemTitle(item);
          const label = getItemLabel(item);

          if (verbose) {
            log(`  Processing: ${label}`);
          }

          if (dryRun) {
            return normalizeLifecycleResult(await createDryRunResult(item), item, {
              slug,
              title,
            });
          }

          try {
            return normalizeLifecycleResult(await processItem(item), item, { slug, title });
          } catch (error) {
            errorLog(`  Failed: ${slug} - ${error.message}`);
            return { slug, title, status: "failed", error: error.message };
          }
        }),
      );

      for (const result of results) {
        await applyLifecycleResult({
          result,
          state,
          persistSuccessfulResult,
          onResult,
          errorLog,
        });
      }

      state.current = state.completed + state.failed + state.skipped;
      stdout.write(formatProgress(state));
      await onProgress?.({
        ...state,
        status: "running",
        currentBatch: [],
        currentSlug: results.at(-1)?.slug ?? null,
      });
    }

    log("");
    const finalState = {
      ...state,
      status: state.failed > 0 && state.completed === 0 ? "failed" : "completed",
      currentBatch: [],
    };
    await onProgress?.(finalState);
    return pickLifecycleResults(finalState);
  } catch (error) {
    const failedState = {
      ...state,
      status: "failed",
      currentBatch: [],
      fatalError: error.message,
    };
    await onFatalProgress?.(failedState, error);
    await onProgress?.(failedState);
    throw error;
  }
}

function defaultFailedItemFormatter(item) {
  const label = item?.slug ?? item?.title ?? "unknown";
  return `${label}: ${item?.error ?? "Unknown error"}`;
}

function createInitialLifecycleState(total, startedAt) {
  return {
    status: "running",
    current: 0,
    total,
    completed: 0,
    failed: 0,
    skipped: 0,
    totalPromptTokens: 0,
    totalCompletionTokens: 0,
    failedItems: [],
    successfulUpdates: [],
    startedAt,
  };
}

async function applyLifecycleResult({
  result,
  state,
  persistSuccessfulResult,
  onResult,
  errorLog,
}) {
  if (result.status === "success") {
    try {
      await persistSuccessfulResult?.(result);
      state.completed += 1;
      state.totalPromptTokens += result.promptTokens ?? 0;
      state.totalCompletionTokens += result.completionTokens ?? 0;
      state.successfulUpdates.push(result);
      await onResult?.(result, { persisted: true });
      return;
    } catch (error) {
      const failedResult = {
        slug: result.slug,
        title: result.title,
        status: "persist_failed",
        error: error.message,
      };
      state.failed += 1;
      state.failedItems.push(toFailedItem(failedResult));
      await onResult?.(failedResult, { persisted: false });
      errorLog(`  Failed to persist: ${result.slug} - ${error.message}`);
      return;
    }
  }

  if (result.status === "dry-run") {
    state.completed += 1;
    await onResult?.(result, { persisted: false });
    return;
  }

  if (result.status === "skipped" || result.status === "would-skip") {
    state.skipped += 1;
    await onResult?.(result, { persisted: false });
    return;
  }

  state.failed += 1;
  state.failedItems.push(toFailedItem(result));
  await onResult?.({ ...result, status: result.status || "failed" }, { persisted: false });
}

function normalizeLifecycleResult(result, item, fallback) {
  return {
    slug: result?.slug ?? fallback.slug,
    title: result?.title ?? fallback.title,
    status: result?.status ?? "failed",
    ...result,
  };
}

function toFailedItem(result) {
  return {
    slug: result.slug,
    title: result.title,
    error: result.error || result.reason || "Unknown error",
  };
}

function pickLifecycleResults(state) {
  return {
    completed: state.completed,
    failed: state.failed,
    skipped: state.skipped,
    totalPromptTokens: state.totalPromptTokens,
    totalCompletionTokens: state.totalCompletionTokens,
    failedItems: state.failedItems,
    successfulUpdates: state.successfulUpdates,
  };
}

function defaultProgressFormatter(state) {
  const done = state.completed + state.failed + state.skipped;
  return `\rProgress: ${done}/${state.total} (${state.completed} ok, ${state.failed} failed, ${state.skipped} skipped)`;
}

function defaultItemSlug(item) {
  return item?.slug ?? item?.title ?? "unknown";
}

function defaultItemLabel(item) {
  return item?.title ?? item?.slug ?? "unknown";
}
