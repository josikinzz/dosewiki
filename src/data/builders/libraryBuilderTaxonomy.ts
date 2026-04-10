import type { IconName } from "@/components/common/Icon";
import { icons } from "@/utils/iconNames";
import { slugify } from "../../utils/slug";
import type { SubstanceRecord } from "./contentBuilder";
import type {
  ClassificationDetail,
  ClassificationType,
  DosageCategoryGroup,
  EffectSummary,
  MechanismSummary,
} from "./library";
import { UNQUALIFIED_MECHANISM_QUALIFIER_KEY } from "../constants";

const MECHANISM_OF_ACTION_LABEL = "Mechanism of Action";
const DEFAULT_CHEMICAL_CLASS_ICON: IconName = icons.hexagon;
const DEFAULT_MECHANISM_ICON: IconName = icons.cog;
const OBSCURE_INDEX_KEY = "obscure";

export interface ClassificationAccumulator {
  label: string;
  slug: string;
  records: Set<SubstanceRecord>;
}

export interface MechanismQualifierAccumulator {
  label: string;
  qualifier?: string;
  records: Set<SubstanceRecord>;
}

export interface MechanismAccumulator {
  name: string;
  records: Set<SubstanceRecord>;
  qualifierMap: Map<string, MechanismQualifierAccumulator>;
}

interface EffectAccumulator {
  name: string;
  records: Set<SubstanceRecord>;
}

const normalizeKey = (value: string): string => slugify(value);

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

function parseEffectEntryLabel(entry: string): { base: string; qualifier?: string } {
  return parseMechanismEntryLabel(entry);
}

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

      const key = slugify(name);
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
  const mechanismMap = new Map<string, MechanismAccumulator>();

  substanceRecords.forEach((record) => {
    if (isObscureRecord(record)) {
      return;
    }

    const mechanismValue = resolveMechanismOfAction(record);
    if (!mechanismValue) {
      return;
    }

    const uniqueEntries = Array.from(new Set(
      mechanismValue
        .split(";")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0),
    ));

    uniqueEntries.forEach((entry) => {
      const { base, qualifier } = parseMechanismEntryLabel(entry);
      const normalizedBase = base.trim();
      if (!normalizedBase) {
        return;
      }

      const slug = normalizeKey(normalizedBase);
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
        ? normalizeKey(qualifier)
        : UNQUALIFIED_MECHANISM_QUALIFIER_KEY;
      if (!accumulator.qualifierMap.has(qualifierKey)) {
        accumulator.qualifierMap.set(qualifierKey, {
          label: qualifier ?? "general",
          qualifier: qualifier ?? undefined,
          records: new Set(),
        });
      }

      accumulator.qualifierMap.get(qualifierKey)?.records.add(record);
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
    const seenSlugs = new Set<string>();

    effects.forEach((effect) => {
      const trimmed = effect.trim();
      if (trimmed.length === 0) {
        return;
      }

      const { base } = parseEffectEntryLabel(trimmed);
      const baseName = base.length > 0 ? base : trimmed;
      const slug = normalizeKey(baseName);
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
