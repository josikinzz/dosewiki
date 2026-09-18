import type { IconName } from "@/components/common/Icon";
import { icons } from "@/utils/iconNames";
import type { SubstanceRecord } from "./contentBuilder";
import type {
  ClassificationDetail,
  ClassificationType,
  DosageCategoryGroup,
  EffectSummary,
} from "./library";
import {
  deriveMechanismRouteData,
  type MechanismAccumulator as DerivedMechanismAccumulator,
} from "./mechanismRouteDerivation";
import { normalizeTaxonomyKey, parseQualifiedTaxonomyLabel } from "./taxonomy";
const DEFAULT_CHEMICAL_CLASS_ICON: IconName = icons.hexagon;
const DEFAULT_MECHANISM_ICON: IconName = icons.cog;
const OBSCURE_INDEX_KEY = "obscure";

export interface ClassificationAccumulator {
  label: string;
  slug: string;
  records: Set<SubstanceRecord>;
}

export type MechanismAccumulator =
  DerivedMechanismAccumulator<SubstanceRecord>;

interface EffectAccumulator {
  name: string;
  records: Set<SubstanceRecord>;
}

const normalizeKey = (value: string): string => normalizeTaxonomyKey(value);

const isObscureRecord = (record: SubstanceRecord): boolean =>
  record.indexCategories.some((category) => normalizeKey(category) === OBSCURE_INDEX_KEY);

const sortRecordsAlphabetically = (records: SubstanceRecord[]): SubstanceRecord[] =>
  records.slice().sort((a, b) => a.name.localeCompare(b.name));

function createDrugEntry(record: SubstanceRecord) {
  return {
    name: record.name,
    slug: record.slug,
    alias: record.aliases[0],
  };
}

function parseEffectEntryLabel(entry: string): { base: string; qualifier?: string } {
  return parseQualifiedTaxonomyLabel(entry);
}

export function buildClassificationLookups(substanceRecords: SubstanceRecord[]) {
  const chemicalClassLookup = new Map<string, ClassificationAccumulator>();
  const psychoactiveClassLookup = new Map<string, ClassificationAccumulator>();

  const registerValue = (
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

    map.set(slug, { label, slug, records: new Set([record]) });
  };

  substanceRecords.forEach((record) => {
    if (isObscureRecord(record)) {
      return;
    }

    record.chemicalClasses?.forEach((entry) => registerValue(chemicalClassLookup, entry, record));
    record.psychoactiveClasses?.forEach((entry) => registerValue(psychoactiveClassLookup, entry, record));
  });

  return { chemicalClassLookup, psychoactiveClassLookup };
}

export function resolveClassificationDetail(
  identifier: string,
  map: Map<string, ClassificationAccumulator>,
  type: ClassificationType,
): ClassificationDetail | null {
  const key = normalizeKey(identifier);
  if (!key) {
    return null;
  }

  const accumulator = map.get(key);
  if (!accumulator) {
    return null;
  }

  const sortedRecords = sortRecordsAlphabetically(Array.from(accumulator.records));

  return {
    type,
    label: accumulator.label,
    slug: accumulator.slug,
    total: sortedRecords.length,
    drugs: sortedRecords.map((record) => createDrugEntry(record)),
  };
}

export function buildAutoChemicalClassIndexGroups(records: SubstanceRecord[]): DosageCategoryGroup[] {
  const bucketMap = new Map<string, { name: string; drugs: Map<string, ReturnType<typeof createDrugEntry>> }>();

  records.forEach((record) => {
    const classes = record.chemicalClasses?.length
      ? record.chemicalClasses.map((entry) => entry.trim()).filter((entry) => entry.length > 0)
      : ["Unspecified"];

    classes.forEach((entry) => {
      const name = entry.trim();
      if (name.length === 0) {
        return;
      }

      const key = normalizeKey(name);
      if (!bucketMap.has(key)) {
        bucketMap.set(key, { name, drugs: new Map() });
      }

      const bucket = bucketMap.get(key);
      if (!bucket || bucket.drugs.has(record.slug)) {
        return;
      }

      bucket.drugs.set(record.slug, createDrugEntry(record));
    });
  });

  return Array.from(bucketMap.entries())
    .map(([key, bucket]) => ({
      key,
      name: bucket.name,
      icon: DEFAULT_CHEMICAL_CLASS_ICON,
      total: bucket.drugs.size,
      drugs: Array.from(bucket.drugs.values()).sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .filter((group) => group.total > 0)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function buildMechanismData(substanceRecords: SubstanceRecord[]) {
  return deriveMechanismRouteData(
    substanceRecords.map((record) => ({
      record,
      displayName: record.name,
      priority: record.priority,
      indexCategories: record.indexCategories,
      mechanisms: record.mechanisms,
    })),
  );
}

export function buildAutoMechanismIndexGroups(
  mechanismMap: Map<string, MechanismAccumulator>,
): DosageCategoryGroup[] {
  return Array.from(mechanismMap.entries())
    .map(([key, entry]) => ({
      key,
      name: entry.name,
      icon: DEFAULT_MECHANISM_ICON,
      total: entry.records.size,
      drugs: Array.from(entry.records)
        .map((record) => ({ name: record.name, slug: record.slug }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .filter((group) => group.total > 0)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function buildEffectData(substanceRecords: SubstanceRecord[]) {
  const effectMap = new Map<string, EffectAccumulator>();
  const effectSlugAliasMap = new Map<string, string>();

  substanceRecords.forEach((record) => {
    const effects = record.content.subjectiveEffects ?? [];
    const resolvedSlugs = record.content.subjectiveEffectSlugs ?? [];
    const seenSlugs = new Set<string>();

    effects.forEach((effect, index) => {
      const trimmed = effect.trim();
      if (trimmed.length === 0) {
        return;
      }

      const { base } = parseEffectEntryLabel(trimmed);
      const baseName = base.length > 0 ? base : trimmed;

      // A name the alias table deliberately resolves to nothing (a removed effect,
      // or shorthand naming two at once) has no effect page to be listed on.
      const resolved = index < resolvedSlugs.length ? resolvedSlugs[index] : undefined;
      if (resolved === null) {
        return;
      }

      const slug = resolved ?? normalizeKey(baseName);
      if (!slug) {
        return;
      }

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
      if (!entry) {
        return;
      }

      if (trimmed === baseName && entry.name !== trimmed) {
        entry.name = trimmed;
      }

      if (seenSlugs.has(slug)) {
        return;
      }

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
      if (a.total !== b.total) {
        return b.total - a.total;
      }
      return a.name.localeCompare(b.name);
    });

  return { effectMap, effectSlugAliasMap, effectSummaries };
}
