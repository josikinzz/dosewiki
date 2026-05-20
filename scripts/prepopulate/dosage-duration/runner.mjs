import { selectBestDosagePerRoute, transformDosage } from "./dosage.mjs";
import { selectBestDurationPerRoute, transformDuration } from "./duration.mjs";
import {
  countPopulatedArticles,
  createStats,
  incrementSourceCounts,
} from "./stats.mjs";
import {
  hasExistingDosage,
  hasExistingDuration,
  slugify,
} from "./normalize.mjs";

export function processArticles({ articles, parsed, targetSubstances, verbose = false, logger = console }) {
  const beforeStats = countPopulatedArticles(articles);
  const stats = createStats();

  const modifiedArticles = articles.map((article) => {
    const slug = slugify(article.title);
    const parsedData = parsed.substances[slug];

    stats.articlesProcessed += 1;
    const updated = JSON.parse(JSON.stringify(article));

    if (targetSubstances && !targetSubstances.includes(slug)) {
      stats.skippedNotTargeted.push(article.title);
      return updated;
    }

    if (!parsedData) {
      stats.noData.push(article.title);
      return updated;
    }

    const newDosage = transformDosage(parsedData.dosage);
    const existingDosage = hasExistingDosage(article);

    if (newDosage.routes.length > 0) {
      updated.dosage = newDosage;
      stats.withDosage += 1;
      stats.dosageRoutes += newDosage.routes.length;

      if (existingDosage) {
        stats.overwrittenDosage.push(article.title);
        if (verbose) {
          logger.log(`  🔄 ${article.title}: REPLACED dosage (${article.dosage.routes.length} → ${newDosage.routes.length} routes)`);
        }
      } else {
        stats.populatedDosage.push(article.title);
        if (verbose) {
          logger.log(`  ✅ ${article.title}: populated ${newDosage.routes.length} dosage routes`);
        }
      }

      if (parsedData.dosage) {
        incrementSourceCounts(stats.dosageSources, selectBestDosagePerRoute(parsedData.dosage));
      }
    }

    const newDuration = transformDuration(parsedData.duration);
    const existingDuration = hasExistingDuration(article);

    if (newDuration.routes.length > 0) {
      updated.duration = newDuration;
      stats.withDuration += 1;
      stats.durationRoutes += newDuration.routes.length;

      if (existingDuration) {
        stats.overwrittenDuration.push(article.title);
        if (verbose) {
          logger.log(`  🔄 ${article.title}: REPLACED duration (${article.duration.routes.length} → ${newDuration.routes.length} routes)`);
        }
      } else {
        stats.populatedDuration.push(article.title);
        if (verbose) {
          logger.log(`  ✅ ${article.title}: populated ${newDuration.routes.length} duration routes`);
        }
      }

      if (parsedData.duration) {
        incrementSourceCounts(stats.durationSources, selectBestDurationPerRoute(parsedData.duration));
      }
    }

    return updated;
  });

  return {
    modifiedArticles,
    beforeStats,
    afterStats: countPopulatedArticles(modifiedArticles),
    stats,
  };
}
