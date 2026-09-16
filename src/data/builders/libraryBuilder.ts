/**
 * Library builder - factory function to build all library data from articles.
 *
 * This module converts the module-level execution from library.ts into a
 * factory function that can be called lazily after articles are loaded.
 */

import { buildInteractionIndex } from "./libraryBuilderInteractions";
import type {
  NormalizedManualIndexConfig,
} from "./manualIndexLoader";
import {
  projectArticleNormalization,
  type LibraryArticleInput,
} from "./articleNormalization";
import { projectTaxonomy } from "./taxonomyProjection";
import { projectManualIndexes } from "./manualIndexProjection";
import { createPublicLibraryFacade } from "./publicLibraryFacade";

/**
 * Index configs required by buildLibrary.
 * These are loaded from Postgres at runtime via useIndexLayouts hook.
 */
export interface IndexConfigs {
  psychoactive: NormalizedManualIndexConfig;
  chemical: NormalizedManualIndexConfig;
  mechanism: NormalizedManualIndexConfig;
}
import type { LibraryData } from "../SubstanceIndexProvider";

// Re-export types from library.ts for convenience
export type {
  CategoryDefinition,
  DosageCategoryGroup,
  CategoryDetailGroup,
  CategoryDetail,
  ClassificationType,
  ClassificationDetail,
  InteractionReference,
  InteractionIndexEntry,
  InteractionIndex,
} from "./library";

/**
 * Build all library data from articles.
 *
 * This is the main factory function that computes all indexes and lookups
 * from the raw articles array.
 *
 * @param articles - The substance articles to build the library from
 * @param configs - Index configs loaded from Postgres via useIndexLayouts hook.
 */
export function buildLibrary<TArticle extends LibraryArticleInput>(
  articles: TArticle[],
  configs: IndexConfigs,
): LibraryData<TArticle> {
  const articleProjection = projectArticleNormalization(articles);
  const taxonomyProjection = projectTaxonomy(articleProjection.substanceRecords);
  const manualIndexProjection = projectManualIndexes({
    substanceBySlug: articleProjection.substanceBySlug,
    configs,
    autoChemicalClassIndexGroups: taxonomyProjection.autoChemicalClassIndexGroups,
    autoMechanismIndexGroups: taxonomyProjection.autoMechanismIndexGroups,
  });

  return createPublicLibraryFacade({
    articleProjection,
    taxonomyProjection,
    manualIndexProjection,
    interactionIndex: buildInteractionIndex(articleProjection.substanceRecords),
  });
}
