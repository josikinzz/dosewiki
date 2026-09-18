import type { InteractionGroup } from "../../types/content";
import type { LibraryData } from "../SubstanceIndexProvider";
import type {
  ArticleNormalizationProjection,
  LibraryArticleInput,
} from "./articleNormalization";
import type { ManualIndexProjection } from "./manualIndexProjection";
import type { TaxonomyProjection } from "./taxonomyProjection";
import { createEffectDetailResolvers, createMechanismDetailResolvers } from "./libraryBuilderDetails";
import type {
  CategoryDetail,
  ClassificationDetail,
  EffectDetail,
  InteractionIndex,
  MechanismDetail,
} from "./library";
import {
  createTaxonomyIdentifier,
  normalizeTaxonomyKey,
  type TaxonomyRouteSurface,
} from "./taxonomy";

type PublicTaxonomyDetail =
  | CategoryDetail
  | ClassificationDetail
  | MechanismDetail
  | EffectDetail;

interface PublicLibraryFacadeInput<
  TArticle extends LibraryArticleInput,
> {
  articleProjection: ArticleNormalizationProjection<TArticle>;
  taxonomyProjection: TaxonomyProjection;
  manualIndexProjection: ManualIndexProjection;
  interactionIndex: InteractionIndex;
}

export function createPublicLibraryFacade<
  TArticle extends LibraryArticleInput,
>({
  articleProjection,
  taxonomyProjection,
  manualIndexProjection,
  interactionIndex,
}: PublicLibraryFacadeInput<TArticle>): LibraryData<TArticle> {
  const { getEffectDetail, getEffectSummary } = createEffectDetailResolvers(
    taxonomyProjection.effectMap,
    taxonomyProjection.effectSlugAliasMap,
    manualIndexProjection,
  );
  const { getMechanismDetail, getMechanismSummary } = createMechanismDetailResolvers(
    taxonomyProjection.mechanismMap,
    manualIndexProjection,
  );

  const getInteractionsForSubstance = (
    slug: string,
  ): InteractionGroup[] | undefined => articleProjection.substanceBySlug.get(slug)?.content.interactions;

  const getTaxonomyRouteDetail = (
    surface: TaxonomyRouteSurface,
    identifier: string,
  ): PublicTaxonomyDetail | null => {
    switch (surface) {
      case "category":
        return manualIndexProjection.getCategoryDetail(identifier);
      case "chemical":
        return taxonomyProjection.getChemicalClassDetail(identifier);
      case "psychoactive":
        return taxonomyProjection.getPsychoactiveClassDetail(identifier);
      case "mechanism":
        return getMechanismDetail(identifier);
      case "effect":
        return getEffectDetail(identifier);
      default:
        return null;
    }
  };

  const getTaxonomyRoutePath = (
    surface: TaxonomyRouteSurface,
    identifier: string,
  ): string | null => {
    const detail = getTaxonomyRouteDetail(surface, identifier);
    if (!detail) {
      return null;
    }

    const label = "definition" in detail ? detail.definition.name : detail.label;
    let pathKey = identifier;
    if ("slug" in detail) {
      pathKey = detail.slug;
    } else if ("definition" in detail && "slug" in detail.definition) {
      pathKey = detail.definition.slug;
    } else if ("definition" in detail && "key" in detail.definition) {
      pathKey = detail.definition.key;
    }
    const routePrefix = surface === "category" ? "/category" : `/${surface}`;
    return createTaxonomyIdentifier(surface, pathKey, routePrefix, [
      label,
      normalizeTaxonomyKey(identifier),
    ])
      .routeIntent?.pathname ?? null;
  };

  return {
    articles: articleProjection.articles,
    allSubstanceRecords: articleProjection.allSubstanceRecords,
    substanceRecords: articleProjection.substanceRecords,
    allSubstancesBySlug: articleProjection.allSubstancesBySlug,
    substanceBySlug: articleProjection.substanceBySlug,
    interactionIndex,
    dosageCategoryGroups: manualIndexProjection.dosageCategoryGroups,
    chemicalClassIndexGroups: manualIndexProjection.chemicalClassIndexGroups,
    mechanismIndexGroups: manualIndexProjection.mechanismIndexGroups,
    effectSummaries: taxonomyProjection.effectSummaries,
    mechanismSummaries: taxonomyProjection.mechanismSummaries,
    findCategoryByKey: manualIndexProjection.findCategoryByKey,
    normalizeCategoryKey: manualIndexProjection.normalizeCategoryKey,
    getCategoryDetail: manualIndexProjection.getCategoryDetail,
    getEffectDetail,
    getEffectSummary,
    getMechanismDetail,
    getMechanismSummary,
    getChemicalClassDetail: taxonomyProjection.getChemicalClassDetail,
    getPsychoactiveClassDetail: taxonomyProjection.getPsychoactiveClassDetail,
    getTaxonomyRouteDetail,
    getTaxonomyRoutePath,
    getInteractionsForSubstance,
    buildCategoryGroupsForRecords: manualIndexProjection.buildCategoryGroupsForRecords,
  };
}
