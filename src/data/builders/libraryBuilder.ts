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

export interface IndexConfigs {
  psychoactive: NormalizedManualIndexConfig;
  chemical: NormalizedManualIndexConfig;
  mechanism: NormalizedManualIndexConfig;
}
import type { LibraryData } from "../SubstanceIndexProvider";

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
