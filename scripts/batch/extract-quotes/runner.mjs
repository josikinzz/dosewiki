import { buildUserMessage, formatOutputFile, saveOutput } from "./formatter.mjs";
import { loadSourceFile } from "./loader.mjs";
import { callOpenRouter, callWithRetry } from "./openrouter.mjs";
import {
  createDryRunResultFromSourceMaterial,
  resolveLocalSourceFileMaterial,
} from "../lib/source-material-resolver.mjs";

export function resolveExtractQuotesSourceMaterial(slug, category) {
  return resolveLocalSourceFileMaterial({
    slug,
    loadSourceFile,
    buildUserMessage: (sourceData) =>
      buildUserMessage(sourceData.substanceName, sourceData.sources, sourceData.contents, category),
  });
}

export async function processSubstance(apiKey, slug, category, systemPrompt) {
  const sourceMaterial = resolveExtractQuotesSourceMaterial(slug, category);
  if (sourceMaterial.status !== "ready") {
    return { slug, status: "skipped", reason: sourceMaterial.reason, tokens: 0 };
  }

  const substanceName = sourceMaterial.sourceData.substanceName;
  const result = await callWithRetry(() => callOpenRouter(apiKey, systemPrompt, sourceMaterial.userMessage));
  saveOutput(slug, category, formatOutputFile(substanceName, category, result.content));

  return {
    slug,
    status: "success",
    tokens: result.usage.totalTokens,
    promptTokens: result.usage.promptTokens,
    completionTokens: result.usage.completionTokens,
  };
}

export async function processAll(apiKey, slugs, category, systemPrompt, options) {
  const { concurrency, verbose, dryRun } = options;
  let completed = 0;
  let failed = 0;
  let skipped = 0;
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  const failedItems = [];
  const total = slugs.length;

  for (let index = 0; index < slugs.length; index += concurrency) {
    const batch = slugs.slice(index, index + concurrency);
    const results = await Promise.all(
      batch.map(async (slug) => {
        if (verbose) {
          console.log(`  Processing: ${slug}`);
        }

        if (dryRun) {
          const sourceMaterial = resolveExtractQuotesSourceMaterial(slug, category);
          return createDryRunResultFromSourceMaterial(sourceMaterial);
        }

        try {
          const result = await processSubstance(apiKey, slug, category, systemPrompt);
          if (result.status === "success") {
            totalPromptTokens += result.promptTokens;
            totalCompletionTokens += result.completionTokens;
            if (verbose) {
              console.log(`  Completed: ${slug} (${result.tokens} tokens)`);
            }
          } else if (result.status === "skipped" && verbose) {
            console.log(`  Skipped: ${slug} - ${result.reason}`);
          }
          return result;
        } catch (error) {
          console.error(`  Failed: ${slug} - ${error.message}`);
          return { slug, status: "failed", error: error.message };
        }
      }),
    );

    for (const result of results) {
      if (result.status === "success" || result.status === "dry-run") completed += 1;
      else if (result.status === "skipped") skipped += 1;
      else {
        failed += 1;
        failedItems.push({ slug: result.slug, error: result.error });
      }
    }

    const done = completed + failed + skipped;
    process.stdout.write(`\rProgress: ${done}/${total} (${completed} ok, ${failed} failed, ${skipped} skipped)`);
  }

  console.log();
  return { completed, failed, skipped, totalPromptTokens, totalCompletionTokens, failedItems };
}
