import type { SubstanceRecord } from "./contentBuilder";
import type {
  EffectDetail,
  EffectSummary,
  MechanismDetail,
  MechanismQualifierDetail,
  MechanismSummary,
} from "./library";
import { buildCategoryGroupsForRecords, normalizeKey } from "./libraryBuilderCategories";
import type { NormalizedManualIndexConfig } from "./manualIndexLoader";

type EffectEntry = {
  name: string;
  records: Set<SubstanceRecord>;
};

type MechanismQualifierEntry = {
  key: string;
  label: string;
  qualifier?: string;
  records: Set<SubstanceRecord>;
};

type MechanismEntry = {
  name: string;
  records: Set<SubstanceRecord>;
  qualifierMap: Map<string, MechanismQualifierEntry>;
  qualifiers: MechanismQualifierEntry[];
  defaultQualifierKey: string;
};

type ManualCategoryPresentation = Parameters<typeof buildCategoryGroupsForRecords>[2] extends Map<
  string,
  infer TValue
>
  ? TValue
  : never;

type DetailContext = {
  manualSlugLookup: Map<string, { categoryKey: string; sectionKey?: string }[]>;
  manualCategoryPresentations: Map<string, ManualCategoryPresentation>;
  fallbackCategoryKey: string | null;
  psychoactiveIndexManualConfig: NormalizedManualIndexConfig;
};

export function createEffectDetailResolvers(
  effectMap: Map<string, EffectEntry>,
  effectSlugAliasMap: Map<string, string>,
  context: DetailContext,
) {
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
      context.manualSlugLookup,
      context.manualCategoryPresentations,
      context.fallbackCategoryKey,
      context.psychoactiveIndexManualConfig,
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

  return { getEffectDetail, getEffectSummary };
}

export function createMechanismDetailResolvers(
  mechanismMap: Map<string, MechanismEntry>,
  context: DetailContext,
) {
  const getMechanismDetail = (mechanismSlug: string, qualifierKey?: string): MechanismDetail | null => {
    const slug = normalizeKey(mechanismSlug);
    const entry = mechanismMap.get(slug);
    if (!entry) return null;
    if (qualifierKey !== undefined && !entry.qualifierMap.has(qualifierKey)) return null;

    const qualifierDetails: MechanismQualifierDetail[] = entry.qualifiers.map(
      (qualifierEntry) => {
        const records = Array.from(qualifierEntry.records);
        const groups = qualifierKey !== undefined && qualifierEntry.key !== qualifierKey ? [] : buildCategoryGroupsForRecords(
          records,
          context.manualSlugLookup,
          context.manualCategoryPresentations,
          context.fallbackCategoryKey,
          context.psychoactiveIndexManualConfig,
        );

        return {
          key: qualifierEntry.key,
          label: qualifierEntry.label,
          qualifier: qualifierEntry.qualifier,
          total: records.length,
          groups,
        } satisfies MechanismQualifierDetail;
      },
    );

    return {
      definition: { name: entry.name, slug, total: entry.records.size },
      qualifiers: qualifierDetails,
      defaultQualifierKey: entry.defaultQualifierKey,
    };
  };

  const getMechanismSummary = (mechanismSlug: string): MechanismSummary | undefined => {
    const slug = normalizeKey(mechanismSlug);
    const entry = mechanismMap.get(slug);
    if (!entry) return undefined;
    return { name: entry.name, slug, total: entry.records.size };
  };

  return { getMechanismDetail, getMechanismSummary };
}
