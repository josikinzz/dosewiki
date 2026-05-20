import {
  buildCategoryGroupsForRecords,
  buildCategorySystem,
  createManualIndexGroups,
  normalizeKey,
  type ManualCategoryPresentation,
} from "./libraryBuilderCategories";
import type {
  CategoryDefinition,
  CategoryDetail,
  CategoryDetailGroup,
  DosageCategoryGroup,
} from "./library";
import type { SubstanceRecord } from "./contentBuilder";
import type { IndexConfigs } from "./libraryBuilder";
import type { NormalizedManualIndexConfig } from "./manualIndexLoader";

export interface ManualIndexProjection {
  dosageCategoryGroups: DosageCategoryGroup[];
  chemicalClassIndexGroups: DosageCategoryGroup[];
  mechanismIndexGroups: DosageCategoryGroup[];
  manualSlugLookup: Map<string, { categoryKey: string; sectionKey?: string }[]>;
  manualCategoryPresentations: Map<string, ManualCategoryPresentation>;
  fallbackCategoryKey: string | null;
  psychoactiveIndexManualConfig: NormalizedManualIndexConfig;
  findCategoryByKey: (input: string) => CategoryDefinition | undefined;
  normalizeCategoryKey: (value: string) => string;
  getCategoryDetail: (categoryKey: string) => CategoryDetail | null;
  buildCategoryGroupsForRecords: (records: SubstanceRecord[]) => DosageCategoryGroup[];
}

interface ManualIndexProjectionInput {
  substanceBySlug: Map<string, SubstanceRecord>;
  configs: IndexConfigs;
  autoChemicalClassIndexGroups: DosageCategoryGroup[];
  autoMechanismIndexGroups: DosageCategoryGroup[];
}

export function projectManualIndexes({
  substanceBySlug,
  configs,
  autoChemicalClassIndexGroups,
  autoMechanismIndexGroups,
}: ManualIndexProjectionInput): ManualIndexProjection {
  const {
    categoryLookup,
    manualCategoryPresentations,
    manualSlugLookup,
    fallbackCategoryKey,
  } = buildCategorySystem(substanceBySlug, configs.psychoactive);

  const dosageCategoryGroups = createManualIndexGroups(configs.psychoactive, substanceBySlug);
  const manualChemicalIndexGroups = createManualIndexGroups(configs.chemical, substanceBySlug);
  const chemicalClassIndexGroups = manualChemicalIndexGroups.length > 0
    ? manualChemicalIndexGroups
    : autoChemicalClassIndexGroups;

  const manualMechanismIndexGroups = createManualIndexGroups(configs.mechanism, substanceBySlug);
  const mechanismIndexGroups = manualMechanismIndexGroups.length > 0
    ? manualMechanismIndexGroups
    : autoMechanismIndexGroups;

  const findCategoryByKey = (input: string): CategoryDefinition | undefined =>
    categoryLookup.get(normalizeKey(input));

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

  return {
    dosageCategoryGroups,
    chemicalClassIndexGroups,
    mechanismIndexGroups,
    manualSlugLookup,
    manualCategoryPresentations,
    fallbackCategoryKey,
    psychoactiveIndexManualConfig: configs.psychoactive,
    findCategoryByKey,
    normalizeCategoryKey: normalizeKey,
    getCategoryDetail,
    buildCategoryGroupsForRecords: (records) =>
      buildCategoryGroupsForRecords(
        records,
        manualSlugLookup,
        manualCategoryPresentations,
        fallbackCategoryKey,
        configs.psychoactive,
      ),
  };
}
