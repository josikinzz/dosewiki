import { getCategoryIcon } from "../config/categoryIcons";
import type {
  NormalizedManualCategoryDefinition,
  NormalizedManualCategorySection,
  NormalizedManualIndexConfig,
} from "./manualIndexLoader";
import type {
  CategoryDefinition,
  CategoryDetailGroup,
  DosageCategoryGroup,
  DrugListEntry,
} from "./library";
import type { SubstanceRecord } from "./contentBuilder";
import {
  createManualLayoutTaxonomy,
  normalizeTaxonomyKey,
} from "./taxonomy";

export interface ManualCategoryPresentation {
  definition: CategoryDefinition;
  sections?: CategoryDetailGroup[];
  flattened: DrugListEntry[];
  topLevel: DrugListEntry[];
  topLevelSlugs: string[];
  sectionSlugLookup: Map<string, string[]>;
  total: number;
}

interface ManualAggregationBucket {
  definition: CategoryDefinition;
  sectionOrder: NormalizedManualCategorySection[];
  sectionEntries: Map<string, DrugListEntry[]>;
  topLevel: DrugListEntry[];
}

type NameVariantKind = "botanical" | "alternative" | "substitutive";

const preferredAliasKinds: NameVariantKind[] = ["botanical", "alternative", "substitutive"];
const OBSCURE_INDEX_KEY = "obscure";

export const normalizeKey = (value: string): string => normalizeTaxonomyKey(value);

const isObscureRecord = (record: SubstanceRecord): boolean =>
  record.indexCategories.some((category) => normalizeKey(category) === OBSCURE_INDEX_KEY);

const formatAlias = (record: SubstanceRecord): string | undefined => {
  const variants = record.content?.nameVariants ?? [];

  for (const kind of preferredAliasKinds) {
    const variant = variants.find((entry) => entry.kind === kind);
    if (!variant) continue;

    const firstValue = variant.values.find((value) => value.trim().length > 0);
    if (!firstValue) continue;

    const trimmed = firstValue.trim();
    if (trimmed) return trimmed;
  }

  return undefined;
};

const createDrugEntry = (record: SubstanceRecord): DrugListEntry => ({
  name: record.name,
  slug: record.slug,
  alias: formatAlias(record),
});

const normalizeSlugValue = (value: string): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = normalizeKey(trimmed);
  return normalized || null;
};

function resolveVisibleDrugEntry(
  slug: string,
  seenVisible: Set<string>,
  substanceBySlug: Map<string, SubstanceRecord>,
): DrugListEntry | null {
  const normalized = normalizeSlugValue(slug);
  if (!normalized) return null;

  const record = substanceBySlug.get(normalized);
  if (!record) return null;
  if (isObscureRecord(record)) return null;
  if (seenVisible.has(record.slug)) return null;

  seenVisible.add(record.slug);
  return createDrugEntry(record);
}

function resolveManualSectionGroup(
  section: NormalizedManualCategorySection,
  seenVisible: Set<string>,
  substanceBySlug: Map<string, SubstanceRecord>,
): { group: CategoryDetailGroup | null; slugs: string[] } {
  const entries: DrugListEntry[] = [];
  const slugs: string[] = [];

  section.drugs.forEach((slug) => {
    const entry = resolveVisibleDrugEntry(slug, seenVisible, substanceBySlug);
    if (entry) {
      entries.push(entry);
      slugs.push(entry.slug);
    }
  });

  if (entries.length === 0) {
    return { group: null, slugs };
  }

  return {
    group: { name: section.label, drugs: entries },
    slugs,
  };
}

function buildManualCategoryPresentation(
  category: NormalizedManualCategoryDefinition,
  definition: CategoryDefinition,
  substanceBySlug: Map<string, SubstanceRecord>,
): ManualCategoryPresentation {
  const seenVisible = new Set<string>();
  const sectionGroups: CategoryDetailGroup[] = [];
  const sectionSlugLookup = new Map<string, string[]>();

  category.sections.forEach((section) => {
    const { group, slugs } = resolveManualSectionGroup(section, seenVisible, substanceBySlug);
    if (group) sectionGroups.push(group);
    if (slugs.length > 0) sectionSlugLookup.set(section.normalizedKey, slugs);
  });

  const topLevel: DrugListEntry[] = [];
  const topLevelSlugs: string[] = [];
  category.drugs.forEach((slug) => {
    const entry = resolveVisibleDrugEntry(slug, seenVisible, substanceBySlug);
    if (entry) {
      topLevel.push(entry);
      topLevelSlugs.push(entry.slug);
    }
  });

  const flattened = [...sectionGroups.flatMap((section) => section.drugs), ...topLevel];

  return {
    definition,
    sections: sectionGroups.length > 0 ? sectionGroups : undefined,
    flattened,
    topLevel,
    topLevelSlugs,
    sectionSlugLookup,
    total: flattened.length,
  };
}

export function buildCategorySystem(
  substanceBySlug: Map<string, SubstanceRecord>,
  psychoactiveIndexManualConfig: NormalizedManualIndexConfig,
) {
  const categoryDefinitionMap = new Map<string, CategoryDefinition>();
  const categoryLookup = new Map<string, CategoryDefinition>();
  const manualCategoryPresentations = new Map<string, ManualCategoryPresentation>();
  const manualSlugLookup = new Map<string, { categoryKey: string; sectionKey?: string }[]>();
  const manualTaxonomy = createManualLayoutTaxonomy(psychoactiveIndexManualConfig);

  psychoactiveIndexManualConfig.categories.forEach((category) => {
    const normalizedKey = normalizeKey(category.key);
    const icon = getCategoryIcon(category.iconKey);
    const definition: CategoryDefinition = {
      key: category.key,
      name: category.label,
      icon,
      fallback: normalizedKey === "miscellaneous",
    };

    categoryDefinitionMap.set(normalizedKey, definition);

    const identifier = manualTaxonomy.identifiers.find((entry) => entry.key === normalizedKey);
    identifier?.aliases.forEach((alias) => {
      if (!categoryLookup.has(alias)) {
        categoryLookup.set(alias, definition);
      }
    });

    const presentation = buildManualCategoryPresentation(category, definition, substanceBySlug);
    manualCategoryPresentations.set(normalizedKey, presentation);

    const registerSlug = (slug: string, sectionKey?: string) => {
      if (!slug) return;
      const existing = manualSlugLookup.get(slug);
      const candidate = { categoryKey: normalizedKey, sectionKey };
      if (!existing) {
        manualSlugLookup.set(slug, [candidate]);
        return;
      }

      const alreadyPresent = existing.some(
        (entry) =>
          entry.categoryKey === candidate.categoryKey && entry.sectionKey === candidate.sectionKey,
      );
      if (!alreadyPresent) {
        existing.push(candidate);
      }
    };

    presentation.sectionSlugLookup.forEach((slugs, sectionKey) => {
      slugs.forEach((slug) => registerSlug(slug, sectionKey));
    });
    presentation.topLevelSlugs.forEach((slug) => registerSlug(slug));
  });

  const fallbackCategoryKey = manualTaxonomy.fallbackCategoryKey;

  return {
    categoryDefinitionMap,
    categoryLookup,
    manualCategoryPresentations,
    manualSlugLookup,
    fallbackCategoryKey,
  };
}

export function createManualIndexGroups(
  config: NormalizedManualIndexConfig,
  substanceBySlug: Map<string, SubstanceRecord>,
): DosageCategoryGroup[] {
  return config.categories
    .map((category) => {
      const normalizedKey = normalizeKey(category.key);
      const definition: CategoryDefinition = {
        key: category.key,
        name: category.label,
        icon: getCategoryIcon(category.iconKey),
        fallback: normalizedKey === "miscellaneous",
      };

      const presentation = buildManualCategoryPresentation(category, definition, substanceBySlug);
      if (presentation.total === 0 && !definition.fallback) return null;

      const combinedSections =
        presentation.sections && presentation.sections.length > 0
          ? [
              ...(presentation.topLevel.length > 0
                ? [{ name: "General", drugs: presentation.topLevel } satisfies CategoryDetailGroup]
                : []),
              ...presentation.sections,
            ]
          : undefined;

      const flattened = combinedSections
        ? combinedSections.flatMap((section) => section.drugs)
        : [...presentation.topLevel];

      return {
        key: definition.key,
        name: definition.name,
        icon: definition.icon,
        total: flattened.length,
        drugs: flattened,
        sections: combinedSections,
        column: category.column,
        columns: category.columns,
      } satisfies DosageCategoryGroup;
    })
    .filter((group) => group !== null) as DosageCategoryGroup[];
}

export function buildCategoryGroupsForRecords(
  records: SubstanceRecord[],
  manualSlugLookup: Map<string, { categoryKey: string; sectionKey?: string }[]>,
  manualCategoryPresentations: Map<string, ManualCategoryPresentation>,
  fallbackCategoryKey: string | null,
  psychoactiveIndexManualConfig: NormalizedManualIndexConfig,
): DosageCategoryGroup[] {
  const buckets = new Map<string, ManualAggregationBucket>();

  const ensureBucket = (categoryKey: string): ManualAggregationBucket | null => {
    const existing = buckets.get(categoryKey);
    if (existing) return existing;

    const manualDefinition = psychoactiveIndexManualConfig.categoryMap.get(categoryKey);
    const presentation = manualCategoryPresentations.get(categoryKey);
    if (!manualDefinition || !presentation) return null;

    const bucket: ManualAggregationBucket = {
      definition: presentation.definition,
      sectionOrder: manualDefinition.sections,
      sectionEntries: new Map(),
      topLevel: [],
    };

    buckets.set(categoryKey, bucket);
    return bucket;
  };

  const addRecordToBucket = (
    record: SubstanceRecord,
    categoryKey: string,
    sectionKey: string | undefined,
  ) => {
    const bucket = ensureBucket(categoryKey);
    if (!bucket) return;

    const entry = createDrugEntry(record);
    if (sectionKey) {
      const existing = bucket.sectionEntries.get(sectionKey);
      if (existing) {
        if (!existing.some((item) => item.slug === entry.slug)) {
          existing.push(entry);
        }
      } else {
        bucket.sectionEntries.set(sectionKey, [entry]);
      }
      return;
    }

    if (!bucket.topLevel.some((item) => item.slug === entry.slug)) {
      bucket.topLevel.push(entry);
    }
  };

  records.forEach((record) => {
    if (record.isHidden) return;

    const mappings = manualSlugLookup.get(record.slug);
    if (!mappings || mappings.length === 0) {
      if (fallbackCategoryKey) {
        addRecordToBucket(record, fallbackCategoryKey, undefined);
      }
      return;
    }

    mappings.forEach(({ categoryKey, sectionKey }) => {
      addRecordToBucket(record, categoryKey, sectionKey);
    });
  });

  const groups: DosageCategoryGroup[] = [];

  psychoactiveIndexManualConfig.categories.forEach((category) => {
    const normalizedKey = normalizeKey(category.key);
    const bucket = buckets.get(normalizedKey);
    if (!bucket) return;

    const sections: CategoryDetailGroup[] = [];
    bucket.sectionOrder.forEach((section) => {
      const entries = bucket.sectionEntries.get(section.normalizedKey);
      if (entries && entries.length > 0) {
        sections.push({ name: section.label, drugs: entries });
      }
    });

    const flattened = [...sections.flatMap((section) => section.drugs), ...bucket.topLevel];
    if (flattened.length === 0) return;

    groups.push({
      key: bucket.definition.key,
      name: bucket.definition.name,
      icon: bucket.definition.icon,
      total: flattened.length,
      drugs: flattened,
      sections: sections.length > 0 ? sections : undefined,
    });
  });

  return groups;
}
