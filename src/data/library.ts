import { Cog, Hexagon } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import articles from "./articles";
import { buildSubstanceRecord, type SubstanceRecord } from "./contentBuilder";
import { slugify } from "../utils/slug";
import { getCategoryIcon } from "./categoryIcons";
import { psychoactiveIndexManualConfig } from "./psychoactiveIndexManual";
import { chemicalIndexManualConfig } from "./chemicalIndexManual";
import { mechanismIndexManualConfig } from "./mechanismIndexManual";
import type {
  NormalizedManualCategoryDefinition,
  NormalizedManualCategorySection,
  NormalizedManualIndexConfig,
} from "./manualIndexLoader";
import { INTERACTION_CLASSES, type InteractionClassDefinition } from "./interactionClasses";
import type {
  InteractionGroup,
  InteractionMatchType,
  InteractionTarget,
  NameVariantKind,
} from "../types/content";

export interface DrugListEntry {
  name: string;
  slug: string;
  alias?: string;
}

export interface CategoryDefinition {
  key: string;
  name: string;
  icon: LucideIcon;
  aliases?: string[];
  fallback?: boolean;
}

export interface DosageCategoryGroup {
  key: string;
  name: string;
  icon: LucideIcon;
  total: number;
  drugs: DrugListEntry[];
  sections?: CategoryDetailGroup[];
}

export interface CategoryDetailGroup {
  name: string;
  drugs: DrugListEntry[];
}

export interface CategoryDetail {
  definition: CategoryDefinition;
  total: number;
  groups: CategoryDetailGroup[];
}

export interface EffectSummary {
  name: string;
  slug: string;
  total: number;
}

export interface EffectDetail {
  definition: EffectSummary;
  groups: DosageCategoryGroup[];
}

export interface MechanismSummary {
  name: string;
  slug: string;
  total: number;
}

export interface MechanismDetail {
  definition: MechanismSummary;
  qualifiers: MechanismQualifierDetail[];
  defaultQualifierKey: string;
}

export interface MechanismQualifierDetail {
  key: string;
  label: string;
  qualifier?: string;
  total: number;
  groups: DosageCategoryGroup[];
}

export type ClassificationType = "chemical" | "psychoactive";

export interface ClassificationDetail {
  type: ClassificationType;
  label: string;
  slug: string;
  total: number;
  drugs: DrugListEntry[];
}

export const UNQUALIFIED_MECHANISM_QUALIFIER_KEY = "unqualified";

interface InteractionClassMatcher {
  definition: InteractionClassDefinition;
  slugs: Set<string>;
}

interface SubstanceMatchEntry {
  type: Extract<InteractionMatchType, "substance" | "alias">;
  slug: string;
  name: string;
}

export interface InteractionReference {
  sourceSlug: string;
  sourceName: string;
  severity: InteractionGroup["severity"];
  target: InteractionTarget;
}

export interface InteractionIndexEntry {
  slug: string;
  display: string;
  matchType: InteractionMatchType;
  matchedSubstanceSlug?: string;
  matchedSubstanceName?: string;
  classKey?: string;
  classLabel?: string;
  references: InteractionReference[];
}

export type InteractionIndex = Map<string, InteractionIndexEntry>;

const rawSubstanceRecords: SubstanceRecord[] = articles
  .map((article) => buildSubstanceRecord(article))
  .filter((record): record is SubstanceRecord => record !== null);

export const allSubstanceRecords: SubstanceRecord[] = rawSubstanceRecords;

export const substanceRecords: SubstanceRecord[] = rawSubstanceRecords.filter((record) => !record.isHidden);

export const allSubstancesBySlug = new Map<string, SubstanceRecord>(
  rawSubstanceRecords.map((record) => [record.slug, record]),
);

export const substanceBySlug = new Map<string, SubstanceRecord>(
  substanceRecords.map((record) => [record.slug, record]),
);

export const getInteractionsForSubstance = (
  slug: string,
): InteractionGroup[] | undefined => substanceBySlug.get(slug)?.content.interactions;

const normalizeKey = (value: string): string => slugify(value);

const preferredAliasKinds: NameVariantKind[] = ["botanical", "alternative", "substitutive"];

const formatAlias = (record: SubstanceRecord): string | undefined => {
  const variants = record.content?.nameVariants ?? [];

  for (const kind of preferredAliasKinds) {
    const variant = variants.find((entry) => entry.kind === kind);
    if (!variant) {
      continue;
    }

    const firstValue = variant.values.find((value) => value.trim().length > 0);
    if (!firstValue) {
      continue;
    }

    const trimmed = firstValue.trim();
    if (trimmed) {
      return trimmed;
    }
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
  if (!base) {
    return [];
  }

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

const createSubstanceMatchLookup = (records: SubstanceRecord[]): Map<string, SubstanceMatchEntry> => {
  const lookup = new Map<string, SubstanceMatchEntry>();

  const register = (
    record: SubstanceRecord,
    value: string | undefined,
    type: SubstanceMatchEntry["type"],
  ) => {
    if (!value) {
      return;
    }

    generateSlugVariants(value).forEach((variant) => {
      if (lookup.has(variant)) {
        return;
      }

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
};

const createClassMatchers = (definitions: InteractionClassDefinition[]): InteractionClassMatcher[] =>
  definitions.map((definition) => {
    const slugs = new Set<string>();
    const register = (value: string | undefined) => {
      if (!value) {
        return;
      }
      generateSlugVariants(value).forEach((variant) => {
        if (variant.length > 0) {
          slugs.add(variant);
        }
      });
    };

    register(definition.label);
    definition.matchers.forEach((matcher) => register(matcher));

    return {
      definition,
      slugs,
    } satisfies InteractionClassMatcher;
  });

const resolveInteractionTarget = (
  target: InteractionTarget,
  substanceLookup: Map<string, SubstanceMatchEntry>,
  classMatchers: InteractionClassMatcher[],
) => {
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
    if (!variant) {
      continue;
    }
    const classMatch = classMatchers.find((matcher) => matcher.slugs.has(variant));
    if (classMatch) {
      target.matchType = "class";
      target.classKey = classMatch.definition.key;
      target.classLabel = classMatch.definition.label;
      return;
    }
  }

  target.matchType = "unknown";
};

const selectDisplayLabel = (target: InteractionTarget): string => {
  if (target.matchType === "substance" || target.matchType === "alias") {
    return target.matchedSubstanceName ?? target.display;
  }

  if (target.matchType === "class") {
    return target.classLabel ?? target.display;
  }

  return target.display;
};

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
        if (!entry) {
          return;
        }

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

export const interactionIndex: InteractionIndex = buildInteractionIndex(substanceRecords);

const CATEGORY_DEFINITION_MAP = new Map<string, CategoryDefinition>();
const CATEGORY_LOOKUP = new Map<string, CategoryDefinition>();

interface ManualCategoryPresentation {
  definition: CategoryDefinition;
  sections?: CategoryDetailGroup[];
  flattened: DrugListEntry[];
  topLevel: DrugListEntry[];
  topLevelSlugs: string[];
  sectionSlugLookup: Map<string, string[]>;
  total: number;
}

const MANUAL_CATEGORY_PRESENTATIONS = new Map<string, ManualCategoryPresentation>();
const MANUAL_SLUG_LOOKUP = new Map<string, { categoryKey: string; sectionKey?: string }[]>();

const MECHANISM_OF_ACTION_LABEL = "Mechanism of Action";

function resolveMechanismOfAction(record: SubstanceRecord): string | undefined {
  const sections = record.content.infoSections ?? [];
  for (const section of sections) {
    const mechanismEntry = section.items.find(
      (item) => item.label === MECHANISM_OF_ACTION_LABEL && item.value,
    );
    if (mechanismEntry?.value) {
      const value = mechanismEntry.value.trim();
      if (value.length > 0) {
        return value;
      }
    }
  }
  return undefined;
}

const normalizeSlugValue = (value: string): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const normalized = slugify(trimmed);
  return normalized || null;
};

function resolveVisibleDrugEntry(slug: string, seenVisible: Set<string>): DrugListEntry | null {
  const normalized = normalizeSlugValue(slug);
  if (!normalized) {
    return null;
  }
  const record = substanceBySlug.get(normalized);
  if (!record) {
    return null;
  }
  if (seenVisible.has(record.slug)) {
    return null;
  }
  seenVisible.add(record.slug);
  return createDrugEntry(record);
}

function resolveManualSectionGroup(
  section: NormalizedManualCategorySection,
  seenVisible: Set<string>,
): { group: CategoryDetailGroup | null; slugs: string[] } {
  const entries: DrugListEntry[] = [];
  const slugs: string[] = [];

  section.drugs.forEach((slug) => {
    const entry = resolveVisibleDrugEntry(slug, seenVisible);
    if (entry) {
      entries.push(entry);
      slugs.push(entry.slug);
    }
  });

  if (entries.length === 0) {
    return { group: null, slugs };
  }

  return {
    group: {
      name: section.label,
      drugs: entries,
    },
    slugs,
  };
}

function buildManualCategoryPresentation(
  category: NormalizedManualCategoryDefinition,
  definition: CategoryDefinition,
): ManualCategoryPresentation {
  const seenVisible = new Set<string>();
  const sectionGroups: CategoryDetailGroup[] = [];

  const sectionSlugLookup = new Map<string, string[]>();

  category.sections.forEach((section) => {
    const { group, slugs } = resolveManualSectionGroup(section, seenVisible);
    if (group) {
      sectionGroups.push(group);
    }
    if (slugs.length > 0) {
      sectionSlugLookup.set(section.normalizedKey, slugs);
    }
  });

  const topLevel: DrugListEntry[] = [];
  const topLevelSlugs: string[] = [];
  category.drugs.forEach((slug) => {
    const entry = resolveVisibleDrugEntry(slug, seenVisible);
    if (entry) {
      topLevel.push(entry);
      topLevelSlugs.push(entry.slug);
    }
  });

  const flattened = [
    ...sectionGroups.flatMap((section) => section.drugs),
    ...topLevel,
  ];

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

function createManualIndexGroups(config: NormalizedManualIndexConfig): DosageCategoryGroup[] {
  return config.categories
    .map((category) => {
      const normalizedKey = normalizeKey(category.key);
      const definition: CategoryDefinition = {
        key: category.key,
        name: category.label,
        icon: getCategoryIcon(category.iconKey),
        fallback: normalizedKey === "miscellaneous",
      };

      const presentation = buildManualCategoryPresentation(category, definition);
      if (presentation.total === 0 && !definition.fallback) {
        return null;
      }

      const combinedSections = presentation.sections && presentation.sections.length > 0
        ? [
            ...(presentation.topLevel.length > 0
              ? [
                  {
                    name: "General",
                    drugs: presentation.topLevel,
                  } satisfies CategoryDetailGroup,
                ]
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

psychoactiveIndexManualConfig.categories.forEach((category) => {
  const normalizedKey = normalizeKey(category.key);
  const icon = getCategoryIcon(category.iconKey);
  const definition: CategoryDefinition = {
    key: category.key,
    name: category.label,
    icon,
    fallback: normalizedKey === "miscellaneous",
  };

  CATEGORY_DEFINITION_MAP.set(normalizedKey, definition);

  const aliasKeys = new Set<string>([
    normalizedKey,
    normalizeKey(category.label),
  ]);

  aliasKeys.forEach((alias) => {
    if (!CATEGORY_LOOKUP.has(alias)) {
      CATEGORY_LOOKUP.set(alias, definition);
    }
  });

  const presentation = buildManualCategoryPresentation(category, definition);
  MANUAL_CATEGORY_PRESENTATIONS.set(normalizedKey, presentation);

  const registerSlug = (slug: string, sectionKey?: string) => {
    if (!slug) {
      return;
    }
    const existing = MANUAL_SLUG_LOOKUP.get(slug);
    const candidate = { categoryKey: normalizedKey, sectionKey };
    if (!existing) {
      MANUAL_SLUG_LOOKUP.set(slug, [candidate]);
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

const FALLBACK_CATEGORY_DEFINITION = Array.from(CATEGORY_DEFINITION_MAP.values()).find(
  (definition) => definition.fallback,
) ?? null;
const FALLBACK_CATEGORY_KEY = FALLBACK_CATEGORY_DEFINITION
  ? normalizeKey(FALLBACK_CATEGORY_DEFINITION.key)
  : null;

export function normalizeCategoryKey(value: string): string {
  return normalizeKey(value);
}

export function findCategoryByKey(input: string): CategoryDefinition | undefined {
  return CATEGORY_LOOKUP.get(normalizeKey(input));
}

const sortRecordsAlphabetically = (records: SubstanceRecord[]): SubstanceRecord[] =>
  records.slice().sort((a, b) => a.name.localeCompare(b.name));

interface ClassificationAccumulator {
  label: string;
  slug: string;
  records: Set<SubstanceRecord>;
}

const registerClassificationValue = (
  map: Map<string, ClassificationAccumulator>,
  rawLabel: string,
  record: SubstanceRecord,
) => {
  if (!rawLabel) {
    return;
  }

  const label = rawLabel.trim();
  if (!label) {
    return;
  }

  const slug = normalizeKey(label);
  if (!slug) {
    return;
  }

  const accumulator = map.get(slug);
  if (accumulator) {
    accumulator.records.add(record);
    return;
  }

  map.set(slug, {
    label,
    slug,
    records: new Set([record]),
  });
};

const buildClassificationDetail = (
  accumulator: ClassificationAccumulator,
  type: ClassificationType,
): ClassificationDetail => {
  const sortedRecords = sortRecordsAlphabetically(Array.from(accumulator.records));

  return {
    type,
    label: accumulator.label,
    slug: accumulator.slug,
    total: sortedRecords.length,
    drugs: sortedRecords.map((record) => createDrugEntry(record)),
  };
};

const chemicalClassLookup = new Map<string, ClassificationAccumulator>();
const psychoactiveClassLookup = new Map<string, ClassificationAccumulator>();

substanceRecords.forEach((record) => {
  if (record.chemicalClasses && record.chemicalClasses.length > 0) {
    record.chemicalClasses.forEach((entry) => registerClassificationValue(chemicalClassLookup, entry, record));
  }

  if (record.psychoactiveClasses && record.psychoactiveClasses.length > 0) {
    record.psychoactiveClasses.forEach((entry) =>
      registerClassificationValue(psychoactiveClassLookup, entry, record),
    );
  }
});

const resolveClassificationDetail = (
  identifier: string,
  map: Map<string, ClassificationAccumulator>,
  type: ClassificationType,
): ClassificationDetail | null => {
  const key = normalizeKey(identifier);
  if (!key) {
    return null;
  }

  const accumulator = map.get(key);
  if (!accumulator) {
    return null;
  }

  return buildClassificationDetail(accumulator, type);
};

export const getChemicalClassDetail = (identifier: string): ClassificationDetail | null =>
  resolveClassificationDetail(identifier, chemicalClassLookup, "chemical");

export const getPsychoactiveClassDetail = (identifier: string): ClassificationDetail | null =>
  resolveClassificationDetail(identifier, psychoactiveClassLookup, "psychoactive");

const manualDosageCategoryGroups: DosageCategoryGroup[] = createManualIndexGroups(
  psychoactiveIndexManualConfig,
);

export const dosageCategoryGroups = manualDosageCategoryGroups;

interface ManualAggregationBucket {
  definition: CategoryDefinition;
  sectionOrder: NormalizedManualCategorySection[];
  sectionEntries: Map<string, DrugListEntry[]>;
  topLevel: DrugListEntry[];
}

const ensureAggregationBucket = (
  categoryKey: string,
  buckets: Map<string, ManualAggregationBucket>,
): ManualAggregationBucket | null => {
  const existing = buckets.get(categoryKey);
  if (existing) {
    return existing;
  }

  const manualDefinition = psychoactiveIndexManualConfig.categoryMap.get(categoryKey);
  const presentation = MANUAL_CATEGORY_PRESENTATIONS.get(categoryKey);
  if (!manualDefinition || !presentation) {
    return null;
  }

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
  buckets: Map<string, ManualAggregationBucket>,
) => {
  const bucket = ensureAggregationBucket(categoryKey, buckets);
  if (!bucket) {
    return;
  }

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

export function buildCategoryGroupsForRecords(records: SubstanceRecord[]): DosageCategoryGroup[] {
  const buckets = new Map<string, ManualAggregationBucket>();

  records.forEach((record) => {
    if (record.isHidden) {
      return;
    }

    const mappings = MANUAL_SLUG_LOOKUP.get(record.slug);
    if (!mappings || mappings.length === 0) {
      if (FALLBACK_CATEGORY_KEY) {
        addRecordToBucket(record, FALLBACK_CATEGORY_KEY, undefined, buckets);
      }
      return;
    }

    mappings.forEach(({ categoryKey, sectionKey }) => {
      addRecordToBucket(record, categoryKey, sectionKey, buckets);
    });
  });

  const groups: DosageCategoryGroup[] = [];

  psychoactiveIndexManualConfig.categories.forEach((category) => {
    const normalizedKey = normalizeKey(category.key);
    const bucket = buckets.get(normalizedKey);
    if (!bucket) {
      return;
    }

    const sections: CategoryDetailGroup[] = [];
    bucket.sectionOrder.forEach((section) => {
      const entries = bucket.sectionEntries.get(section.normalizedKey);
      if (entries && entries.length > 0) {
        sections.push({
          name: section.label,
          drugs: entries,
        });
      }
    });

    const flattened = [
      ...sections.flatMap((section) => section.drugs),
      ...bucket.topLevel,
    ];

    if (flattened.length === 0) {
      return;
    }

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

const DEFAULT_CHEMICAL_CLASS_ICON: LucideIcon = Hexagon;
const DEFAULT_MECHANISM_ICON: LucideIcon = Cog;

export function buildAutoChemicalClassIndexGroups(
  records: SubstanceRecord[],
): DosageCategoryGroup[] {
  const bucketMap = new Map<
    string,
    {
      name: string;
      drugs: Map<string, DrugListEntry>;
    }
  >();

  records.forEach((record) => {
    const classes = record.chemicalClasses?.length
      ? record.chemicalClasses.map((entry) => entry.trim()).filter((entry) => entry.length > 0)
      : ["Unspecified"];

    classes.forEach((entry) => {
      const name = entry.trim();
      if (name.length === 0) {
        return;
      }

      const key = slugify(name);
      if (!bucketMap.has(key)) {
        bucketMap.set(key, {
          name,
          drugs: new Map(),
        });
      }

      const bucket = bucketMap.get(key);
      if (!bucket) {
        return;
      }
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

const manualChemicalIndexGroups = createManualIndexGroups(chemicalIndexManualConfig);

export const chemicalClassIndexGroups = manualChemicalIndexGroups.length > 0
  ? manualChemicalIndexGroups
  : buildAutoChemicalClassIndexGroups(substanceRecords);

export function getCategoryDetail(categoryKey: string): CategoryDetail | null {
  const definition = findCategoryByKey(categoryKey);
  if (!definition) {
    return null;
  }

  const normalizedKey = normalizeKey(definition.key);
  const presentation = MANUAL_CATEGORY_PRESENTATIONS.get(normalizedKey);
  if (!presentation) {
    return {
      definition,
      total: 0,
      groups: [],
    };
  }

  const combinedSections = presentation.sections && presentation.sections.length > 0
    ? [
        ...(presentation.topLevel.length > 0
          ? [
              {
                name: "General",
                drugs: presentation.topLevel,
              } satisfies CategoryDetailGroup,
            ]
          : []),
        ...presentation.sections,
      ]
    : undefined;

  const groups = combinedSections
    ? combinedSections
    : [
        {
          name: definition.name,
          drugs: presentation.topLevel,
        },
      ];

  return {
    definition,
    total: groups.reduce((sum, group) => sum + group.drugs.length, 0),
    groups,
  };
}

const normalizeEffectSlug = (value: string): string => normalizeKey(value);

const normalizeMechanismSlug = (value: string): string => normalizeKey(value);

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

const mechanismMap = new Map<string, MechanismAccumulator>();

function parseMechanismEntryLabel(entry: string): { base: string; qualifier?: string } {
  const trimmed = entry.trim();
  if (trimmed.length === 0) {
    return { base: trimmed };
  }

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

substanceRecords.forEach((record) => {
  const mechanismValue = resolveMechanismOfAction(record);
  if (!mechanismValue) {
    return;
  }

  const entries = mechanismValue
    .split(";")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  const uniqueEntries = Array.from(new Set(entries));

  uniqueEntries.forEach((entry) => {
    const { base, qualifier } = parseMechanismEntryLabel(entry);
    const normalizedBase = base.trim();
    if (!normalizedBase) {
      return;
    }

    const slug = normalizeMechanismSlug(normalizedBase);
    if (!slug) {
      return;
    }

    if (!mechanismMap.has(slug)) {
      mechanismMap.set(slug, {
        name: normalizedBase,
        records: new Set(),
        qualifierMap: new Map(),
      });
    }

    const accumulator = mechanismMap.get(slug);
    if (!accumulator) {
      return;
    }

    accumulator.records.add(record);

    const qualifierKey = qualifier
      ? normalizeMechanismSlug(qualifier)
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

const effectMap = new Map<string, { name: string; records: SubstanceRecord[] }>();

substanceRecords.forEach((record) => {
  const effects = record.content.subjectiveEffects ?? [];
  effects.forEach((effect) => {
    const slug = normalizeEffectSlug(effect);
    if (!slug) {
      return;
    }

    if (!effectMap.has(slug)) {
      effectMap.set(slug, { name: effect, records: [] });
    }

    const entry = effectMap.get(slug);
    if (entry) {
      entry.records.push(record);
    }
  });
});

export const effectSummaries: EffectSummary[] = Array.from(effectMap.entries())
  .map(([slug, entry]) => ({
    name: entry.name,
    slug,
    total: entry.records.length,
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

export function buildAutoMechanismIndexGroups(): DosageCategoryGroup[] {
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

export const mechanismSummaries: MechanismSummary[] = Array.from(mechanismMap.entries())
  .map(([slug, entry]) => ({
    name: entry.name,
    slug,
    total: entry.records.size,
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

const autoMechanismIndexGroups = buildAutoMechanismIndexGroups();

const manualMechanismIndexGroups = createManualIndexGroups(mechanismIndexManualConfig);

export const mechanismIndexGroups = manualMechanismIndexGroups.length > 0
  ? manualMechanismIndexGroups
  : autoMechanismIndexGroups;

export function getEffectDetail(effectSlug: string): EffectDetail | null {
  const slug = normalizeEffectSlug(effectSlug);
  const entry = effectMap.get(slug);
  if (!entry) {
    return null;
  }

  const groups = buildCategoryGroupsForRecords(entry.records);

  return {
    definition: {
      name: entry.name,
      slug,
      total: entry.records.length,
    },
    groups,
  };
}

export function getEffectSummary(effectSlug: string): EffectSummary | undefined {
  const slug = normalizeEffectSlug(effectSlug);
  const entry = effectMap.get(slug);
  if (!entry) {
    return undefined;
  }
  return {
    name: entry.name,
    slug,
    total: entry.records.length,
  };
}

export function getMechanismDetail(mechanismSlug: string): MechanismDetail | null {
  const slug = normalizeMechanismSlug(mechanismSlug);
  const entry = mechanismMap.get(slug);
  if (!entry) {
    return null;
  }

  const qualifierDetails: MechanismQualifierDetail[] = Array.from(
    entry.qualifierMap.entries(),
  ).map(([key, qualifierEntry]) => {
    const records = Array.from(qualifierEntry.records);
    const groups = buildCategoryGroupsForRecords(records);

    const isDefault = key === UNQUALIFIED_MECHANISM_QUALIFIER_KEY;
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
    if (a.key === UNQUALIFIED_MECHANISM_QUALIFIER_KEY) {
      return -1;
    }
    if (b.key === UNQUALIFIED_MECHANISM_QUALIFIER_KEY) {
      return 1;
    }
    return a.label.localeCompare(b.label);
  });

  const defaultQualifierKey = sortedQualifiers.find(
    (qualifier) => qualifier.key === UNQUALIFIED_MECHANISM_QUALIFIER_KEY,
  )
    ? UNQUALIFIED_MECHANISM_QUALIFIER_KEY
    : sortedQualifiers[0]?.key ?? UNQUALIFIED_MECHANISM_QUALIFIER_KEY;

  return {
    definition: {
      name: entry.name,
      slug,
      total: entry.records.size,
    },
    qualifiers: sortedQualifiers,
    defaultQualifierKey,
  };
}

export function getMechanismSummary(mechanismSlug: string): MechanismSummary | undefined {
  const slug = normalizeMechanismSlug(mechanismSlug);
  const entry = mechanismMap.get(slug);
  if (!entry) {
    return undefined;
  }

  return {
    name: entry.name,
    slug,
    total: entry.records.size,
  };
}
