import {
  applySuccessfulUpdates,
  copyLocalJsonBackup,
} from "../lib/persistence-artifacts.mjs";
import {
  createDryRunResultFromSourceMaterial,
  resolveQuoteSourceMaterial,
} from "../lib/source-material-resolver.mjs";
import { CONFIG } from "./cli.mjs";
import { loadHarmPotentialQuotes } from "./loader.mjs";
import { buildUserMessage, parseGeneratedYaml, titleToSlug } from "./lib.mjs";
import { callOpenRouter, callWithRetry } from "./openrouter.mjs";

export function createBackup() {
  return copyLocalJsonBackup(CONFIG);
}

export async function resolveHarmPotentialSourceMaterial(article) {
  const slug = titleToSlug(article.title);
  return resolveQuoteSourceMaterial({
    slug,
    loadQuotes: loadHarmPotentialQuotes,
    buildUserMessage: (quotes) => buildUserMessage(article, quotes),
    missingReason: "No harm potential quotes in Convex",
    emptyReason: "No harm potential quotes in Convex",
  });
}

export async function processArticle(apiKey, article, systemPrompt, verbose) {
  const slug = titleToSlug(article.title);
  const sourceMaterial = await resolveHarmPotentialSourceMaterial(article);
  if (sourceMaterial.status !== "ready") {
    return { slug, status: "skipped", reason: sourceMaterial.reason, tokens: 0 };
  }

  const result = await callWithRetry(() => callOpenRouter(apiKey, systemPrompt, sourceMaterial.userMessage));
  const harmPotential = parseGeneratedYaml(result.content);

  if (verbose) {
    console.log(`  Generated harm_potential for ${slug}:`);
    console.log(`    psychological addiction: ${harmPotential.addiction?.psychological?.description ? "yes" : "no"} (level: ${harmPotential.addiction?.psychological?.level || "null"})`);
    console.log(`    physical dependence: ${harmPotential.addiction?.physical_dependence?.description ? "yes" : "no"} (level: ${harmPotential.addiction?.physical_dependence?.level || "null"})`);
    console.log(`    lethal_dosage.ld50 entries: ${harmPotential.toxicity?.lethal_dosage?.ld50?.length || 0}`);
    console.log(`    organ toxicity entries: ${harmPotential.toxicity?.organ_toxicity?.length || 0}`);
    console.log(`    psychosis: ${harmPotential.psychosis?.description ? "yes" : "no"} (level: ${harmPotential.psychosis?.level || "null"})`);
    console.log(`    seizure: ${harmPotential.seizure?.description ? "yes" : "no"} (level: ${harmPotential.seizure?.level || "null"})`);
  }

  return {
    slug,
    status: "success",
    harm_potential: harmPotential,
    tokens: result.usage.totalTokens,
    promptTokens: result.usage.promptTokens,
    completionTokens: result.usage.completionTokens,
  };
}

export async function processAll(apiKey, articles, systemPrompt, options) {
  const { concurrency, verbose, dryRun } = options;
  let completed = 0;
  let failed = 0;
  let skipped = 0;
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  const failedItems = [];
  const successfulUpdates = [];
  const total = articles.length;

  for (let index = 0; index < articles.length; index += concurrency) {
    const batch = articles.slice(index, index + concurrency);
    const results = await Promise.all(
      batch.map(async (article) => {
        const slug = titleToSlug(article.title);
        if (verbose) {
          console.log(`  Processing: ${article.title}`);
        }

        if (dryRun) {
          const sourceMaterial = await resolveHarmPotentialSourceMaterial(article);
          return createDryRunResultFromSourceMaterial(sourceMaterial, article.title);
        }

        try {
          const result = await processArticle(apiKey, article, systemPrompt, verbose);
          if (result.status === "success") {
            totalPromptTokens += result.promptTokens;
            totalCompletionTokens += result.completionTokens;
            successfulUpdates.push({ title: article.title, harm_potential: result.harm_potential });
          }
          return { ...result, title: article.title };
        } catch (error) {
          console.error(`  Failed: ${slug} - ${error.message}`);
          return { slug, title: article.title, status: "failed", error: error.message };
        }
      }),
    );

    for (const result of results) {
      if (result.status === "success" || result.status === "dry-run") completed += 1;
      else if (result.status === "skipped" || result.status === "would-skip") skipped += 1;
      else {
        failed += 1;
        failedItems.push({ slug: result.slug, title: result.title, error: result.error });
      }
    }

    const done = completed + failed + skipped;
    process.stdout.write(`\rProgress: ${done}/${total} (${completed} ok, ${failed} failed, ${skipped} skipped)`);
  }

  console.log();
  return { completed, failed, skipped, totalPromptTokens, totalCompletionTokens, failedItems, successfulUpdates };
}

export function applyHarmPotentialUpdate(article, update) {
  article.harm_potential = update.harm_potential;
  return article;
}

export async function applyAndSyncUpdates(results, allArticles, convexClient, adminKey) {
  return applySuccessfulUpdates({
    results,
    allArticles,
    convexClient,
    adminKey,
    applyUpdate: applyHarmPotentialUpdate,
  });
}
