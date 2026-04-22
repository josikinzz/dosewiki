import { UNQUALIFIED_MECHANISM_QUALIFIER_KEY } from "../constants";
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
  qualifier?: string;
  records: Set<SubstanceRecord>;
};

type MechanismEntry = {
  name: string;
  records: Set<SubstanceRecord>;
  qualifierMap: Map<string, MechanismQualifierEntry>;
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
  const getMechanismDetail = (mechanismSlug: string): MechanismDetail | null => {
    const slug = normalizeKey(mechanismSlug);
    const entry = mechanismMap.get(slug);
    if (!entry) return null;

    const qualifierDetails: MechanismQualifierDetail[] = Array.from(entry.qualifierMap.entries()).map(
      ([key, qualifierEntry]) => {
        const records = Array.from(qualifierEntry.records);
        const groups = buildCategoryGroupsForRecords(
          records,
          context.manualSlugLookup,
          context.manualCategoryPresentations,
          context.fallbackCategoryKey,
          context.psychoactiveIndexManualConfig,
        );

        const label = qualifierEntry.qualifier ? qualifierEntry.qualifier : "General (no qualifier)";

        return {
          key,
          label,
          qualifier: qualifierEntry.qualifier,
          total: records.length,
          groups,
        } satisfies MechanismQualifierDetail;
      },
    );

    const sortedQualifiers = qualifierDetails.sort((left, right) => {
      if (left.key === UNQUALIFIED_MECHANISM_QUALIFIER_KEY) return -1;
      if (right.key === UNQUALIFIED_MECHANISM_QUALIFIER_KEY) return 1;
      return left.label.localeCompare(right.label);
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

  return { getMechanismDetail, getMechanismSummary };
}
