/**
 * Library builder - factory function to build all library data from articles.
 *
 * This module converts the module-level execution from library.ts into a
 * factory function that can be called lazily after articles are loaded.
 */

import { Cog, Hexagon } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { buildSubstanceRecord, type SubstanceRecord } from "./contentBuilder";
import { slugify } from "../../utils/slug";
import { getCategoryIcon } from "../config/categoryIcons";
import { psychoactiveIndexManualConfig } from "../psychoactiveIndexManual";
import { chemicalIndexManualConfig } from "../chemicalIndexManual";
import { mechanismIndexManualConfig } from "../mechanismIndexManual";
import type {
  NormalizedManualCategoryDefinition,
  NormalizedManualCategorySection,
  NormalizedManualIndexConfig,
} from "./manualIndexLoader";
import { INTERACTION_CLASSES, type InteractionClassDefinition } from "../config/interactionClasses";
import type {
  InteractionGroup,
  InteractionMatchType,
  InteractionTarget,
  NameVariantKind,
} from "../../types/content";
import type { SubstanceArticle } from "../../schema";
import type { LibraryData } from "../ArticlesProvider";
import { UNQUALIFIED_MECHANISM_QUALIFIER_KEY } from "../constants";

// Re-export types from library.ts for convenience
export type {
  DrugListEntry,
  CategoryDefinition,
  DosageCategoryGroup,
  CategoryDetailGroup,
  CategoryDetail,
  EffectSummary,
  EffectDetail,
  MechanismSummary,
  MechanismDetail,
  MechanismQualifierDetail,
  ClassificationType,
  ClassificationDetail,
  InteractionReference,
  InteractionIndexEntry,
  InteractionIndex,
} from "./library";

import type {
  DrugListEntry,
  CategoryDefinition,
  DosageCategoryGroup,
  CategoryDetailGroup,
  CategoryDetail,
  EffectSummary,
  EffectDetail,
  MechanismSummary,
  MechanismDetail,
  MechanismQualifierDetail,
  ClassificationType,
  ClassificationDetail,
  InteractionIndex,
} from "./library";


// Internal types
interface InteractionClassMatcher {
  definition: InteractionClassDefinition;
  slugs: Set<string>;
}

interface SubstanceMatchEntry {
  type: Extract<InteractionMatchType, "substance" | "alias">;
  slug: string;
  name: string;
}

interface ManualCategoryPresentation {
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

interface ClassificationAccumulator {
  label: string;
  slug: string;
  records: Set<SubstanceRecord>;
}

interface MechanismQualifierAccumulator {
  label: string;
  qualifier?: string;
  records: Set<SubstanceRecord>;
}

interface MechanismAccumulator {
  name: string;
  records: Set<SubstanceRecord>;
  qualifierMap: Map<string, MechanismQualifierAccumulator>;
}

interface EffectAccumulator {
  name: string;
  records: Set<SubstanceRecord>;
}

// Utility functions
const normalizeKey = (value: string): string => slugify(value);

const OBSCURE_INDEX_KEY = "obscure";
const MECHANISM_OF_ACTION_LABEL = "Mechanism of Action";
const DEFAULT_CHEMICAL_CLASS_ICON: LucideIcon = Hexagon;
const DEFAULT_MECHANISM_ICON: LucideIcon = Cog;

const isObscureRecord = (record: SubstanceRecord): boolean =>
  record.indexCategories.some((category) => normalizeKey(category) === OBSCURE_INDEX_KEY);

const preferredAliasKinds: NameVariantKind[] = ["botanical", "alternative", "substitutive"];

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

const generateSlugVariants = (value: string): string[] => {
  const variants = new Set<string>();
  const base = slugify(value);
  if (!base) return [];

  variants.add(base);

  if (base.includes("-")) {
    variants.add(base.replace(/-/g, ""));
  }

  if (base.endsWith("s")) {
    variants.add(base.slice(0, -1));
  }

  const collapsed = base.replace(/-/g, "");
  if (collapsed.endsWith("s")) {
    variants.add(collapsed.slice(0, -1));
  }

  return Array.from(variants).filter((entry) => entry.length > 0);
};

const normalizeSlugValue = (value: string): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = slugify(trimmed);
  return normalized || null;
};

const sortRecordsAlphabetically = (records: SubstanceRecord[]): SubstanceRecord[] =>
  records.slice().sort((a, b) => a.name.localeCompare(b.name));

function parseMechanismEntryLabel(entry: string): { base: string; qualifier?: string } {
  const trimmed = entry.trim();
  if (trimmed.length === 0) return { base: trimmed };

  const match = trimmed.match(/^(.*?)(?:\s*\(([^()]+)\))$/);
  if (match) {
    const base = match[1]?.trim() ?? "";
    const qualifier = match[2]?.trim();
    if (base.length > 0) {
      return {
        base,
        qualifier: qualifier && qualifier.length > 0 ? qualifier : undefined,
      };
    }
  }

  return { base: trimmed };
}

function parseEffectEntryLabel(entry: string): { base: string; qualifier?: string } {
  return parseMechanismEntryLabel(entry); // Same logic
}

/**
 * Build all library data from articles.
 *
 * This is the main factory function that computes all indexes and lookups
 * from the raw articles array.
 */
export function buildLibrary(articles: SubstanceArticle[]): LibraryData {
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
  } = buildCategorySystem(substanceBySlug);

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

  const resolveEffectSlug = (value: string): string => {
    const normalized = normalizeKey(value);
    return effectSlugAliasMap.get(normalized) ?? normalized;
  };

  const getEffectDetail = (effectSlug: string): EffectDetail | null => {
    const slug = resolveEffectSlug(effectSlug);
    const entry = effectMap.get(slug);
    if (!entry) return null;

    const records = Array.from(entry.records);
    const groups = buildCategoryGroupsForRecords(
      records,
      manualSlugLookup,
      manualCategoryPresentations,
      fallbackCategoryKey,
    );

    return {
      definition: { name: entry.name, slug, total: records.length },
      groups,
    };
  };

  const getEffectSummary = (effectSlug: string): EffectSummary | undefined => {
    const slug = resolveEffectSlug(effectSlug);
    const entry = effectMap.get(slug);
    if (!entry) return undefined;
    return { name: entry.name, slug, total: entry.records.size };
  };

  const getMechanismDetail = (mechanismSlug: string): MechanismDetail | null => {
    const slug = normalizeKey(mechanismSlug);
    const entry = mechanismMap.get(slug);
    if (!entry) return null;

    const qualifierDetails: MechanismQualifierDetail[] = Array.from(
      entry.qualifierMap.entries(),
    ).map(([key, qualifierEntry]) => {
      const records = Array.from(qualifierEntry.records);
      const groups = buildCategoryGroupsForRecords(
        records,
        manualSlugLookup,
        manualCategoryPresentations,
        fallbackCategoryKey,
      );

      const label = qualifierEntry.qualifier
        ? qualifierEntry.qualifier
        : "General (no qualifier)";

      return {
        key,
        label,
        qualifier: qualifierEntry.qualifier,
        total: records.length,
        groups,
      } satisfies MechanismQualifierDetail;
    });

    const sortedQualifiers = qualifierDetails.sort((a, b) => {
      if (a.key === UNQUALIFIED_MECHANISM_QUALIFIER_KEY) return -1;
      if (b.key === UNQUALIFIED_MECHANISM_QUALIFIER_KEY) return 1;
      return a.label.localeCompare(b.label);
    });

    const defaultQualifierKey = sortedQualifiers.find(
      (qualifier) => qualifier.key === UNQUALIFIED_MECHANISM_QUALIFIER_KEY,
    )
      ? UNQUALIFIED_MECHANISM_QUALIFIER_KEY
      : sortedQualifiers[0]?.key ?? UNQUALIFIED_MECHANISM_QUALIFIER_KEY;

    return {
      definition: { name: entry.name, slug, total: entry.records.size },
      qualifiers: sortedQualifiers,
      defaultQualifierKey,
    };
  };

  const getMechanismSummary = (mechanismSlug: string): MechanismSummary | undefined => {
    const slug = normalizeKey(mechanismSlug);
    const entry = mechanismMap.get(slug);
    if (!entry) return undefined;
    return { name: entry.name, slug, total: entry.records.size };
  };

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

// Helper functions

function createSubstanceMatchLookup(records: SubstanceRecord[]): Map<string, SubstanceMatchEntry> {
  const lookup = new Map<string, SubstanceMatchEntry>();

  const register = (
    record: SubstanceRecord,
    value: string | undefined,
    type: SubstanceMatchEntry["type"],
  ) => {
    if (!value) return;

    generateSlugVariants(value).forEach((variant) => {
      if (lookup.has(variant)) return;

      lookup.set(variant, {
        type,
        slug: record.slug,
        name: record.name,
      });
    });
  };

  records.forEach((record) => {
    register(record, record.slug, "substance");
    register(record, record.name, "substance");
    (record.aliases ?? []).forEach((alias) => register(record, alias, "alias"));
  });

  return lookup;
}

function createClassMatchers(definitions: InteractionClassDefinition[]): InteractionClassMatcher[] {
  return definitions.map((definition) => {
    const slugs = new Set<string>();
    const register = (value: string | undefined) => {
      if (!value) return;
      generateSlugVariants(value).forEach((variant) => {
        if (variant.length > 0) slugs.add(variant);
      });
    };

    register(definition.label);
    definition.matchers.forEach((matcher) => register(matcher));

    return { definition, slugs };
  });
}

function resolveInteractionTarget(
  target: InteractionTarget,
  substanceLookup: Map<string, SubstanceMatchEntry>,
  classMatchers: InteractionClassMatcher[],
) {
  const variants = new Set<string>(generateSlugVariants(target.slug));
  variants.add(target.slug);

  for (const variant of variants) {
    const substanceMatch = variant ? substanceLookup.get(variant) : undefined;
    if (substanceMatch) {
      target.matchType = substanceMatch.type;
      target.matchedSubstanceSlug = substanceMatch.slug;
      target.matchedSubstanceName = substanceMatch.name;
      return;
    }
  }

  for (const variant of variants) {
    if (!variant) continue;
    const classMatch = classMatchers.find((matcher) => matcher.slugs.has(variant));
    if (classMatch) {
      target.matchType = "class";
      target.classKey = classMatch.definition.key;
      target.classLabel = classMatch.definition.label;
      return;
    }
  }

  target.matchType = "unknown";
}

function selectDisplayLabel(target: InteractionTarget): string {
  if (target.matchType === "substance" || target.matchType === "alias") {
    return target.matchedSubstanceName ?? target.display;
  }
  if (target.matchType === "class") {
    return target.classLabel ?? target.display;
  }
  return target.display;
}

function buildInteractionIndex(records: SubstanceRecord[]): InteractionIndex {
  const index: InteractionIndex = new Map();
  const substanceLookup = createSubstanceMatchLookup(records);
  const classMatchers = createClassMatchers(INTERACTION_CLASSES);

  records.forEach((record) => {
    record.content.interactions.forEach((group) => {
      group.items.forEach((target) => {
        resolveInteractionTarget(target, substanceLookup, classMatchers);

        const key = target.slug;
        if (!index.has(key)) {
          index.set(key, {
            slug: key,
            display: selectDisplayLabel(target),
            matchType: target.matchType,
            matchedSubstanceSlug: target.matchedSubstanceSlug,
            matchedSubstanceName: target.matchedSubstanceName,
            classKey: target.classKey,
            classLabel: target.classLabel,
            references: [],
          });
        }

        const entry = index.get(key);
        if (!entry) return;

        if (entry.matchType === "unknown" && target.matchType !== "unknown") {
          entry.matchType = target.matchType;
        }

        if (!entry.matchedSubstanceSlug && target.matchedSubstanceSlug) {
          entry.matchedSubstanceSlug = target.matchedSubstanceSlug;
          entry.matchedSubstanceName = target.matchedSubstanceName;
        }

        if (!entry.classKey && target.classKey) {
          entry.classKey = target.classKey;
          entry.classLabel = target.classLabel;
        }

        entry.display = selectDisplayLabel(target);

        entry.references.push({
          sourceSlug: record.slug,
          sourceName: record.name,
          severity: group.severity,
          target,
        });
      });
    });
  });

  return index;
}

function buildCategorySystem(substanceBySlug: Map<string, SubstanceRecord>) {
  const categoryDefinitionMap = new Map<string, CategoryDefinition>();
  const categoryLookup = new Map<string, CategoryDefinition>();
  const manualCategoryPresentations = new Map<string, ManualCategoryPresentation>();
  const manualSlugLookup = new Map<string, { categoryKey: string; sectionKey?: string }[]>();

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

    const aliasKeys = new Set<string>([normalizedKey, normalizeKey(category.label)]);

    aliasKeys.forEach((alias) => {
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
        (entry) => entry.categoryKey === candidate.categoryKey && entry.sectionKey === candidate.sectionKey,
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

  const fallbackCategoryDefinition = Array.from(categoryDefinitionMap.values()).find(
    (definition) => definition.fallback,
  ) ?? null;
  const fallbackCategoryKey = fallbackCategoryDefinition
    ? normalizeKey(fallbackCategoryDefinition.key)
    : null;

  return {
    categoryDefinitionMap,
    categoryLookup,
    manualCategoryPresentations,
    manualSlugLookup,
    fallbackCategoryKey,
  };
}

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

function createManualIndexGroups(
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

      const combinedSections = presentation.sections && presentation.sections.length > 0
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
      } satisfies DosageCategoryGroup;
    })
    .filter((group): group is DosageCategoryGroup => group !== null);
}

function buildClassificationLookups(substanceRecords: SubstanceRecord[]) {
  const chemicalClassLookup = new Map<string, ClassificationAccumulator>();
  const psychoactiveClassLookup = new Map<string, ClassificationAccumulator>();

  const registerValue = (
    map: Map<string, ClassificationAccumulator>,
    rawLabel: string,
    record: SubstanceRecord,
  ) => {
    if (!rawLabel) return;
    const label = rawLabel.trim();
    if (!label) return;
    const slug = normalizeKey(label);
    if (!slug) return;

    const accumulator = map.get(slug);
    if (accumulator) {
      accumulator.records.add(record);
      return;
    }

    map.set(slug, { label, slug, records: new Set([record]) });
  };

  substanceRecords.forEach((record) => {
    if (isObscureRecord(record)) return;

    if (record.chemicalClasses?.length) {
      record.chemicalClasses.forEach((entry) => registerValue(chemicalClassLookup, entry, record));
    }

    if (record.psychoactiveClasses?.length) {
      record.psychoactiveClasses.forEach((entry) =>
        registerValue(psychoactiveClassLookup, entry, record),
      );
    }
  });

  return { chemicalClassLookup, psychoactiveClassLookup };
}

function resolveClassificationDetail(
  identifier: string,
  map: Map<string, ClassificationAccumulator>,
  type: ClassificationType,
): ClassificationDetail | null {
  const key = normalizeKey(identifier);
  if (!key) return null;

  const accumulator = map.get(key);
  if (!accumulator) return null;

  const sortedRecords = sortRecordsAlphabetically(Array.from(accumulator.records));

  return {
    type,
    label: accumulator.label,
    slug: accumulator.slug,
    total: sortedRecords.length,
    drugs: sortedRecords.map((record) => createDrugEntry(record)),
  };
}

function buildAutoChemicalClassIndexGroups(records: SubstanceRecord[]): DosageCategoryGroup[] {
  const bucketMap = new Map<string, { name: string; drugs: Map<string, DrugListEntry> }>();

  records.forEach((record) => {
    const classes = record.chemicalClasses?.length
      ? record.chemicalClasses.map((entry) => entry.trim()).filter((entry) => entry.length > 0)
      : ["Unspecified"];

    classes.forEach((entry) => {
      const name = entry.trim();
      if (name.length === 0) return;

      const key = slugify(name);
      if (!bucketMap.has(key)) {
        bucketMap.set(key, { name, drugs: new Map() });
      }

      const bucket = bucketMap.get(key);
      if (!bucket) return;
      if (!bucket.drugs.has(record.slug)) {
        bucket.drugs.set(record.slug, createDrugEntry(record));
      }
    });
  });

  return Array.from(bucketMap.entries())
    .map(([key, bucket]) => {
      const drugs = Array.from(bucket.drugs.values()).sort((a, b) =>
        a.name.localeCompare(b.name),
      );

      return {
        key,
        name: bucket.name,
        icon: DEFAULT_CHEMICAL_CLASS_ICON,
        total: drugs.length,
        drugs,
      } satisfies DosageCategoryGroup;
    })
    .filter((group) => group.total > 0)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function resolveMechanismOfAction(record: SubstanceRecord): string | undefined {
  const sections = record.content.infoSections ?? [];
  for (const section of sections) {
    const mechanismEntry = section.items.find(
      (item) => item.label === MECHANISM_OF_ACTION_LABEL && item.value,
    );
    if (mechanismEntry?.value) {
      const value = mechanismEntry.value.trim();
      if (value.length > 0) return value;
    }
  }
  return undefined;
}

function buildMechanismData(substanceRecords: SubstanceRecord[]) {
  const mechanismMap = new Map<string, MechanismAccumulator>();

  substanceRecords.forEach((record) => {
    if (isObscureRecord(record)) return;
    const mechanismValue = resolveMechanismOfAction(record);
    if (!mechanismValue) return;

    const entries = mechanismValue
      .split(";")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);

    const uniqueEntries = Array.from(new Set(entries));

    uniqueEntries.forEach((entry) => {
      const { base, qualifier } = parseMechanismEntryLabel(entry);
      const normalizedBase = base.trim();
      if (!normalizedBase) return;

      const slug = normalizeKey(normalizedBase);
      if (!slug) return;

      if (!mechanismMap.has(slug)) {
        mechanismMap.set(slug, {
          name: normalizedBase,
          records: new Set(),
          qualifierMap: new Map(),
        });
      }

      const accumulator = mechanismMap.get(slug);
      if (!accumulator) return;

      accumulator.records.add(record);

      const qualifierKey = qualifier
        ? normalizeKey(qualifier)
        : UNQUALIFIED_MECHANISM_QUALIFIER_KEY;
      if (!accumulator.qualifierMap.has(qualifierKey)) {
        accumulator.qualifierMap.set(qualifierKey, {
          label: qualifier ?? "general",
          qualifier: qualifier ?? undefined,
          records: new Set(),
        });
      }

      const qualifierBucket = accumulator.qualifierMap.get(qualifierKey);
      qualifierBucket?.records.add(record);
    });
  });

  const mechanismSummaries: MechanismSummary[] = Array.from(mechanismMap.entries())
    .map(([slug, entry]) => ({
      name: entry.name,
      slug,
      total: entry.records.size,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return { mechanismMap, mechanismSummaries };
}

function buildAutoMechanismIndexGroups(
  mechanismMap: Map<string, MechanismAccumulator>,
): DosageCategoryGroup[] {
  return Array.from(mechanismMap.entries())
    .map(([key, entry]) => {
      const drugs = Array.from(entry.records)
        .map((record) => ({ name: record.name, slug: record.slug }))
        .sort((a, b) => a.name.localeCompare(b.name));

      return {
        key,
        name: entry.name,
        icon: DEFAULT_MECHANISM_ICON,
        total: drugs.length,
        drugs,
      } satisfies DosageCategoryGroup;
    })
    .filter((group) => group.total > 0)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function buildEffectData(substanceRecords: SubstanceRecord[]) {
  const effectMap = new Map<string, EffectAccumulator>();
  const effectSlugAliasMap = new Map<string, string>();

  substanceRecords.forEach((record) => {
    const effects = record.content.subjectiveEffects ?? [];
    const seenSlugs = new Set<string>();

    effects.forEach((effect) => {
      const trimmed = effect.trim();
      if (trimmed.length === 0) return;

      const { base } = parseEffectEntryLabel(trimmed);
      const baseName = base.length > 0 ? base : trimmed;
      const slug = normalizeKey(baseName);
      if (!slug) return;

      const variantSlug = normalizeKey(trimmed);
      if (variantSlug && !effectSlugAliasMap.has(variantSlug)) {
        effectSlugAliasMap.set(variantSlug, slug);
      }

      if (!effectSlugAliasMap.has(slug)) {
        effectSlugAliasMap.set(slug, slug);
      }

      if (!effectMap.has(slug)) {
        effectMap.set(slug, { name: baseName, records: new Set() });
      }

      const entry = effectMap.get(slug);
      if (!entry) return;

      if (trimmed === baseName && entry.name !== trimmed) {
        entry.name = trimmed;
      }

      if (seenSlugs.has(slug)) return;

      entry.records.add(record);
      seenSlugs.add(slug);
    });
  });

  const effectSummaries: EffectSummary[] = Array.from(effectMap.entries())
    .map(([slug, entry]) => ({
      name: entry.name,
      slug,
      total: entry.records.size,
    }))
    .sort((a, b) => {
      if (a.total !== b.total) return b.total - a.total;
      return a.name.localeCompare(b.name);
    });

  return { effectMap, effectSummaries, effectSlugAliasMap };
}

function buildCategoryGroupsForRecords(
  records: SubstanceRecord[],
  manualSlugLookup: Map<string, { categoryKey: string; sectionKey?: string }[]>,
  manualCategoryPresentations: Map<string, ManualCategoryPresentation>,
  fallbackCategoryKey: string | null,
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

    const flattened = [
      ...sections.flatMap((section) => section.drugs),
      ...bucket.topLevel,
    ];

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
