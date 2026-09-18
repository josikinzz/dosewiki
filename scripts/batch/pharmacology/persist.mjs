import {
  copyLocalJsonBackup,
  createArticlePersistence,
} from "../lib/persistence-artifacts.mjs";
import {
  assertNoPublicProseArtifactLanguage,
  assertNoPublicProseNamedSourceAttribution,
} from "../../analyze/public-prose-artifact-language-core.mjs";
import { CONFIG } from "./cli.mjs";
import { getPostgresClient, loadPharmacologyQuotes } from "./loader.mjs";
import { callOpenRouter, callWithRetry } from "./openrouter.mjs";
import { buildUserMessage, parseGeneratedYaml } from "./parser.mjs";
import {
  assertNonRegressivePharmacologyReplacement,
  getArticleSlug,
  mergeRouteDataIntoDosageDuration,
} from "./lib.mjs";

export function createBackup() {
  return copyLocalJsonBackup(CONFIG);
}

export async function processArticle(apiKey, article, systemPrompt, verbose) {
  const slug = getArticleSlug(article);
  const quotes = await loadPharmacologyQuotes(slug);

  if (!quotes) {
    return { slug, status: "skipped", reason: "No pharmacology quotes in Postgres", tokens: 0 };
  }

  const result = await callWithRetry(() =>
    callOpenRouter(apiKey, systemPrompt, buildUserMessage(article, quotes), {
      slug,
      title: article.title,
    }),
  );

  const newPharmacology = parseGeneratedYaml(result.content, {
    slug,
    title: article.title,
  });
  assertNonRegressivePharmacologyReplacement(article, newPharmacology);
  assertNoPublicProseArtifactLanguage(
    { slug, title: article.title, pharmacology: newPharmacology },
    { sections: ["pharmacology"], sourcePath: `batch:pharmacology:${slug}` },
  );
  assertNoPublicProseNamedSourceAttribution(
    { slug, title: article.title, pharmacology: newPharmacology },
    { sections: ["pharmacology"], sourcePath: `batch:pharmacology:${slug}` },
  );

  if (verbose) {
    console.log(`  Generated pharmacology for ${slug}:`);
    console.log(`    pharmacodynamics: ${newPharmacology.pharmacodynamics ? "yes" : "no"} (${newPharmacology.pharmacodynamics.length} chars)`);
    console.log(`    binding_sites: ${newPharmacology.binding_sites.length} entries`);
    console.log(`    pharmacokinetics: ${newPharmacology.pharmacokinetics ? "yes" : "no"} (${newPharmacology.pharmacokinetics.length} chars)`);
    console.log(`    metabolites: ${newPharmacology.metabolites.length} entries`);
    console.log(`    → dosage bioavailability: ${Object.keys(newPharmacology.route_bioavailability || {}).length} routes`);
    console.log(`    → duration half_life: ${Object.keys(newPharmacology.route_half_life || {}).length} routes`);
  }

  return {
    slug,
    status: "success",
    pharmacology: newPharmacology,
    tokens: result.usage.totalTokens,
    promptTokens: result.usage.promptTokens,
    completionTokens: result.usage.completionTokens,
  };
}

export async function persistSuccessfulUpdate(result, persistenceContext) {
  const persist = createArticlePersistence({
    adminKey: persistenceContext.adminKey,
    postgresClient: persistenceContext.postgresClient ?? getPostgresClient(),
    sourceArticlesBySlug: persistenceContext.sourceArticlesBySlug ?? new Map(),
    targetArticlesBySlug: persistenceContext.targetArticlesBySlug ?? new Map(),
    applyUpdate: applyPharmacologyUpdate,
  });
  return persist(result);
}

function applyPharmacologyUpdate(article, result) { article.pharmacology = { ...result.pharmacology };
mergeRouteDataIntoDosageDuration(article, article.pharmacology);
assertNoPublicProseArtifactLanguage(article, {
  sections: ["pharmacology", "dosage", "duration"],
  sourcePath: `batch:pharmacology:${result.slug || getArticleSlug(article)}`,
});
assertNoPublicProseNamedSourceAttribution(article, {
  sections: ["pharmacology", "dosage", "duration"],
  sourcePath: `batch:pharmacology:${result.slug || getArticleSlug(article)}`,
});
return article; }

export async function processAll(apiKey, articles, systemPrompt, options, persistenceContext) {
  const { concurrency, verbose, dryRun } = options;
  let completed = 0;
  let failed = 0;
  let skipped = 0;
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  const failedItems = [];
  const total = articles.length;

  for (let i = 0; i < articles.length; i += concurrency) {
    const batch = articles.slice(i, i + concurrency);
    const results = await Promise.all(
      batch.map(async (article) => {
        const articleSlug = getArticleSlug(article);

        if (verbose) {
          console.log(`  Processing: ${article.title}`);
        }

        if (dryRun) {
          const quotes = await loadPharmacologyQuotes(articleSlug);
          return {
            slug: articleSlug,
            title: article.title,
            status: quotes ? "dry-run" : "would-skip",
            reason: quotes ? null : "No pharmacology quotes in Postgres",
            tokens: 0,
          };
        }

        try {
          const result = await processArticle(apiKey, article, systemPrompt, verbose);
          if (result.status === "success") {
            totalPromptTokens += result.promptTokens;
            totalCompletionTokens += result.completionTokens;
            if (verbose) {
              console.log(`  Completed: ${articleSlug} (${result.tokens} tokens)`);
            }
          } else if (verbose) {
            console.log(`  Skipped: ${articleSlug} - ${result.reason}`);
          }

          return { ...result, title: article.title };
        } catch (error) {
          console.error(`  Failed: ${articleSlug} - ${error.message}`);
          return { slug: articleSlug, title: article.title, status: "failed", error: error.message };
        }
      }),
    );

    for (const result of results) {
      if (result.status === "success") {
        try {
          await persistSuccessfulUpdate(result, persistenceContext);
          completed++;
        } catch (error) {
          failed++;
          failedItems.push({ slug: result.slug, title: result.title, error: error.message });
          console.error(`  Failed to persist: ${result.slug} - ${error.message}`);
        }
      } else if (result.status === "dry-run") {
        completed++;
      } else if (result.status === "skipped" || result.status === "would-skip") {
        skipped++;
      } else if (result.status === "failed") {
        failed++;
        failedItems.push({ slug: result.slug, title: result.title, error: result.error });
      }
    }

    const done = completed + failed + skipped;
    process.stdout.write(`\rProgress: ${done}/${total} (${completed} ok, ${failed} failed, ${skipped} skipped)`);
  }

  console.log();

  return {
    completed,
    failed,
    skipped,
    totalPromptTokens,
    totalCompletionTokens,
    failedItems,
  };
}
