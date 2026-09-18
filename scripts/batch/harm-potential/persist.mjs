import { copyLocalJsonBackup } from "../lib/persistence-artifacts.mjs";
import {
  assertNoPublicProseArtifactLanguage,
  assertNoPublicProseNamedSourceAttribution,
} from "../../analyze/public-prose-artifact-language-core.mjs";
import { api } from "../../../lib/postgres/runtime/api.ts"
import { getAllSubstanceDocuments } from "../../lib/data-pagination.mjs";
import { normalizeArticleInput } from "../../../src/features/dev/tools/substance-editor/yamlParser.ts";
import { sanitizeObjectKeys, stripDataMetadata } from "../summary/articles.mjs";
import {
  createDryRunResultFromSourceMaterial,
  resolveQuoteSourceMaterial,
} from "../lib/source-material-resolver.mjs";
import { CONFIG } from "./cli.mjs";
import { loadHarmPotentialQuotes } from "./loader.mjs";
import { buildUserMessage, getArticleSlug, parseGeneratedYaml, titleToSlug } from "./lib.mjs";
import { callOpenRouter, callWithRetry } from "./openrouter.mjs";

export function createBackup() {
  return copyLocalJsonBackup(CONFIG);
}

async function resolveHarmPotentialSourceMaterial(article) { const slug = getArticleSlug(article);
return resolveQuoteSourceMaterial({
  slug,
  loadQuotes: loadHarmPotentialQuotes,
  buildUserMessage: (quotes) => buildUserMessage(article, quotes),
  missingReason: "No harm potential quotes in Postgres",
  emptyReason: "No harm potential quotes in Postgres",
}); }

async function processArticle(apiKey, article, systemPrompt, verbose) {
  const slug = getArticleSlug(article);
  const sourceMaterial = await resolveHarmPotentialSourceMaterial(article);
  if (sourceMaterial.status !== "ready") {
    return { slug, status: "skipped", reason: sourceMaterial.reason, tokens: 0 };
  }

  const result = await callWithRetry(() => callOpenRouter(apiKey, systemPrompt, sourceMaterial.userMessage));
  const harmPotential = parseGeneratedYaml(result.content);
  assertNoPublicProseArtifactLanguage(
    { slug, title: article.title, harm_potential: harmPotential },
    { sections: ["harm_potential"], sourcePath: `batch:harm_potential:${slug}` },
  );
  assertNoPublicProseNamedSourceAttribution(
    { slug, title: article.title, harm_potential: harmPotential },
    { sections: ["harm_potential"], sourcePath: `batch:harm_potential:${slug}` },
  );

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
        const slug = getArticleSlug(article);
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
            successfulUpdates.push({ title: article.title, slug: result.slug, harm_potential: result.harm_potential });
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
  const sourceSlug = update.slug || titleToSlug(update.title || article.title);
  assertNoPublicProseArtifactLanguage(article, {
    sections: ["harm_potential"],
    sourcePath: `batch:harm_potential:${sourceSlug}`,
  });
  assertNoPublicProseNamedSourceAttribution(article, {
    sections: ["harm_potential"],
    sourcePath: `batch:harm_potential:${sourceSlug}`,
  });
  return article;
}

function assertSuccessfulSync(slug, syncResult) {
  const errors = syncResult.errors ?? [];
  const skipped = syncResult.skipped ?? 0;
  if (errors.length === 0 && skipped === 0) return;

  const skippedOutcomes = (syncResult.outcomes ?? [])
    .filter((outcome) => outcome.action === "skipped")
    .map((outcome) => {
      const details = [
        outcome.title ? `title=${outcome.title}` : null,
        outcome.requestedSlug ? `requestedSlug=${outcome.requestedSlug}` : null,
        outcome.canonicalSlug ? `canonicalSlug=${outcome.canonicalSlug}` : null,
        outcome.error ? `error=${outcome.error}` : null,
      ].filter(Boolean);
      return details.join(", ");
    })
    .filter(Boolean);

  const reason = [...errors, ...skippedOutcomes].join("; ") || `${skipped} skipped ingestion outcome(s)`;
  throw new Error(`Postgres sync failed for ${slug}: ${reason}`);
}

export async function applyAndSyncUpdates(results, _allArticles, postgresClient, adminKey) {
  const targetArticles = await getAllSubstanceDocuments(postgresClient, api.substanceIndex.getFullDocumentPage);
  const targetArticlesBySlug = new Map(
    targetArticles.map((article) => [article.slug || titleToSlug(article.title), article]),
  );
  const aggregate = {
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [],
    outcomes: [],
    affectedPaths: [],
  };

  for (const update of results.successfulUpdates) {
    const slug = update.slug || titleToSlug(update.title);
    const baseArticle = targetArticlesBySlug.get(slug);
    if (!baseArticle) {
      throw new Error(`No target Postgres article found for slug "${slug}"`);
    }

    const nextArticle = applyHarmPotentialUpdate(
      normalizeArticleInput(stripDataMetadata(baseArticle)),
      update,
    );
    const syncResult = await postgresClient.mutation(api.substanceIndex.saveSubstances, {
      apiKey: adminKey,
      articles: [sanitizeObjectKeys(nextArticle)],
    });
    assertSuccessfulSync(slug, syncResult);

    aggregate.created += syncResult.created ?? 0;
    aggregate.updated += syncResult.updated ?? 0;
    aggregate.skipped += syncResult.skipped ?? 0;
    aggregate.errors.push(...(syncResult.errors ?? []));
    aggregate.outcomes.push(...(syncResult.outcomes ?? []));
    aggregate.affectedPaths.push(...(syncResult.affectedPaths ?? []));
    targetArticlesBySlug.set(slug, nextArticle);
  }

  return aggregate;
}
