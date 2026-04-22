/**
 * Library builder - factory function to build all library data from articles.
 *
 * This module converts the module-level execution from library.ts into a
 * factory function that can be called lazily after articles are loaded.
 */

import { buildSubstanceRecord, type SubstanceRecord } from "./contentBuilder";
import { buildInteractionIndex } from "./libraryBuilderInteractions";
import {
  buildCategoryGroupsForRecords,
  buildCategorySystem,
  createManualIndexGroups,
  normalizeKey,
} from "./libraryBuilderCategories";
import {
  createEffectDetailResolvers,
  createMechanismDetailResolvers,
} from "./libraryBuilderDetails";
import {
  buildAutoChemicalClassIndexGroups,
  buildAutoMechanismIndexGroups,
  buildClassificationLookups,
  buildEffectData,
  buildMechanismData,
  resolveClassificationDetail,
} from "./libraryBuilderTaxonomy";
import type {
  NormalizedManualIndexConfig,
} from "./manualIndexLoader";

/**
 * Index configs required by buildLibrary.
 * These are loaded from Convex at runtime via useIndexLayouts hook.
 */
export interface IndexConfigs {
  psychoactive: NormalizedManualIndexConfig;
  chemical: NormalizedManualIndexConfig;
  mechanism: NormalizedManualIndexConfig;
}
import type {
  InteractionGroup,
} from "../../types/content";
import type { SubstanceArticle } from "../../schema";
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

import type {
  CategoryDefinition,
  DosageCategoryGroup,
  CategoryDetailGroup,
  CategoryDetail,
  ClassificationDetail,
} from "./library";


/**
 * Build all library data from articles.
 *
 * This is the main factory function that computes all indexes and lookups
 * from the raw articles array.
 *
 * @param articles - The substance articles to build the library from
 * @param configs - Index configs loaded from Convex via useIndexLayouts hook.
 */
export function buildLibrary(articles: SubstanceArticle[], configs: IndexConfigs): LibraryData {
  const psychoactiveIndexManualConfig = configs.psychoactive;
  const chemicalIndexManualConfig = configs.chemical;
  const mechanismIndexManualConfig = configs.mechanism;
  // Build substance records
  const rawSubstanceRecords: SubstanceRecord[] = articles
    .map((article) => buildSubstanceRecord(article))
    .filter((record): record is SubstanceRecord => record !== null);

  const allSubstanceRecords = rawSubstanceRecords;
  const substanceRecords = rawSubstanceRecords.filter(
    (record) => !record.isHidden && !record.isLowPriority
  );

  const allSubstancesBySlug = new Map<string, SubstanceRecord>(
    rawSubstanceRecords.map((record) => [record.slug, record]),
  );

  const substanceBySlug = new Map<string, SubstanceRecord>(
    substanceRecords.map((record) => [record.slug, record]),
  );

  // Build interaction index
  const interactionIndex = buildInteractionIndex(substanceRecords);

  // Build category system
  const {
    categoryDefinitionMap: _categoryDefinitionMap,
    categoryLookup,
    manualCategoryPresentations,
    manualSlugLookup,
    fallbackCategoryKey,
  } = buildCategorySystem(substanceBySlug, psychoactiveIndexManualConfig);

  // Build classification lookups
  const { chemicalClassLookup, psychoactiveClassLookup } = buildClassificationLookups(
    substanceRecords,
  );

  // Build dosage category groups
  const dosageCategoryGroups = createManualIndexGroups(psychoactiveIndexManualConfig, substanceBySlug);

  // Build chemical class index groups
  const manualChemicalIndexGroups = createManualIndexGroups(chemicalIndexManualConfig, substanceBySlug);
  const chemicalClassIndexGroups = manualChemicalIndexGroups.length > 0
    ? manualChemicalIndexGroups
    : buildAutoChemicalClassIndexGroups(substanceRecords);

  // Build mechanism data
  const { mechanismMap, mechanismSummaries } = buildMechanismData(substanceRecords);

  // Build mechanism index groups
  const autoMechanismIndexGroups = buildAutoMechanismIndexGroups(mechanismMap);
  const manualMechanismIndexGroups = createManualIndexGroups(mechanismIndexManualConfig, substanceBySlug);
  const mechanismIndexGroups = manualMechanismIndexGroups.length > 0
    ? manualMechanismIndexGroups
    : autoMechanismIndexGroups;

  // Build effect data
  const { effectMap, effectSummaries, effectSlugAliasMap } = buildEffectData(substanceRecords);

  // Create lookup functions
  const findCategoryByKey = (input: string): CategoryDefinition | undefined =>
    categoryLookup.get(normalizeKey(input));

  const normalizeCategoryKey = (value: string): string => normalizeKey(value);

  const getCategoryDetail = (categoryKey: string): CategoryDetail | null => {
    const definition = findCategoryByKey(categoryKey);
    if (!definition) return null;

    const normalizedKey = normalizeKey(definition.key);
    const presentation = manualCategoryPresentations.get(normalizedKey);
    if (!presentation) {
      return { definition, total: 0, groups: [] };
    }

    const combinedSections = presentation.sections && presentation.sections.length > 0
      ? [
          ...(presentation.topLevel.length > 0
            ? [{ name: "General", drugs: presentation.topLevel } satisfies CategoryDetailGroup]
            : []),
          ...presentation.sections,
        ]
      : undefined;

    const groups = combinedSections
      ? combinedSections
      : [{ name: definition.name, drugs: presentation.topLevel }];

    return {
      definition,
      total: groups.reduce((sum, group) => sum + group.drugs.length, 0),
      groups,
    };
  };

  const detailContext = {
    manualSlugLookup,
    manualCategoryPresentations,
    fallbackCategoryKey,
    psychoactiveIndexManualConfig,
  };
  const { getEffectDetail, getEffectSummary } = createEffectDetailResolvers(
    effectMap,
    effectSlugAliasMap,
    detailContext,
  );
  const { getMechanismDetail, getMechanismSummary } = createMechanismDetailResolvers(
    mechanismMap,
    detailContext,
  );

  const getChemicalClassDetail = (identifier: string): ClassificationDetail | null =>
    resolveClassificationDetail(identifier, chemicalClassLookup, "chemical");

  const getPsychoactiveClassDetail = (identifier: string): ClassificationDetail | null =>
    resolveClassificationDetail(identifier, psychoactiveClassLookup, "psychoactive");

  const getInteractionsForSubstance = (
    slug: string,
  ): InteractionGroup[] | undefined => substanceBySlug.get(slug)?.content.interactions;

  const buildCategoryGroupsForRecordsFn = (records: SubstanceRecord[]): DosageCategoryGroup[] =>
    buildCategoryGroupsForRecords(
      records,
      manualSlugLookup,
      manualCategoryPresentations,
      fallbackCategoryKey,
      psychoactiveIndexManualConfig,
    );

  return {
    articles,
    allSubstanceRecords,
    substanceRecords,
    allSubstancesBySlug,
    substanceBySlug,
    interactionIndex,
    dosageCategoryGroups,
    chemicalClassIndexGroups,
    mechanismIndexGroups,
    effectSummaries,
    mechanismSummaries,
    findCategoryByKey,
    normalizeCategoryKey,
    getCategoryDetail,
    getEffectDetail,
    getEffectSummary,
    getMechanismDetail,
    getMechanismSummary,
    getChemicalClassDetail,
    getPsychoactiveClassDetail,
    getInteractionsForSubstance,
    buildCategoryGroupsForRecords: buildCategoryGroupsForRecordsFn,
  };
}
