import { substanceRecords } from "./library";
import type { InfoSectionItem, InfoSectionItemChip } from "../types/content";

export interface TagOption {
  value: string;
  label: string;
  count: number;
}

export interface MechanismEntryOption extends TagOption {
  base: string;
  qualifier?: string;
}

export interface MechanismQualifierOption {
  qualifier: string | null;
  label: string;
  count: number;
}

const MECHANISM_OF_ACTION_LABEL = "Mechanism of Action";
const GENERAL_QUALIFIER_KEY = "__general";

interface NormalizedValue {
  key: string;
  label: string;
}

const normalizeTagValue = (raw: string | null | undefined): NormalizedValue | null => {
  if (!raw) {
    return null;
  }

  const label = raw.replace(/\s+/g, " ").trim();
  if (!label) {
    return null;
  }

  return {
    key: label.toLowerCase(),
    label,
  };
};

const buildTagOptionsFromRecords = (extract: (record: (typeof substanceRecords)[number]) => string[] | undefined): TagOption[] => {
  const accumulator = new Map<string, { label: string; count: number }>();

  substanceRecords.forEach((record) => {
    const values = extract(record) ?? [];
    if (values.length === 0) {
      return;
    }

    const recordSeen = new Set<string>();
    values.forEach((raw) => {
      const normalized = normalizeTagValue(raw);
      if (!normalized) {
        return;
      }

      if (recordSeen.has(normalized.key)) {
        return;
      }
      recordSeen.add(normalized.key);

      if (!accumulator.has(normalized.key)) {
        accumulator.set(normalized.key, {
          label: normalized.label,
          count: 0,
        });
      }

      accumulator.get(normalized.key)!.count += 1;
    });
  });

  return Array.from(accumulator.values())
    .map((entry) => ({
      value: entry.label,
      label: entry.label,
      count: entry.count,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
};

const findMechanismItem = (record: (typeof substanceRecords)[number]): InfoSectionItem | undefined => {
  const sections = record.content.infoSections ?? [];
  for (const section of sections) {
    const item = section.items.find((entry) => entry.label === MECHANISM_OF_ACTION_LABEL);
    if (item) {
      return item;
    }
  }
  return undefined;
};

const getMechanismChips = (record: (typeof substanceRecords)[number]): InfoSectionItemChip[] => {
  const item = findMechanismItem(record);
  return item?.chips ?? [];
};

const categoryTagOptions: TagOption[] = buildTagOptionsFromRecords((record) => record.categories);
const psychoactiveClassOptions: TagOption[] = buildTagOptionsFromRecords((record) => record.psychoactiveClasses);
const chemicalClassOptions: TagOption[] = buildTagOptionsFromRecords((record) => record.chemicalClasses);

const mechanismBaseAccumulator = new Map<
  string,
  {
    label: string;
    count: number;
    qualifiers: Map<string, { label: string; qualifier: string | null; count: number }>;
  }
>();

const mechanismEntryAccumulator = new Map<
  string,
  {
    label: string;
    base: string;
    baseKey: string;
    qualifier?: string;
    count: number;
  }
>();

substanceRecords.forEach((record) => {
  const chips = getMechanismChips(record);
  if (chips.length === 0) {
    return;
  }

  const seenBaseKeys = new Set<string>();
  const seenQualifierKeys = new Set<string>();
  const seenEntryKeys = new Set<string>();

  chips.forEach((chip) => {
    const normalizedBase = normalizeTagValue(chip.base);
    if (!normalizedBase) {
      return;
    }

    if (!mechanismBaseAccumulator.has(normalizedBase.key)) {
      mechanismBaseAccumulator.set(normalizedBase.key, {
        label: normalizedBase.label,
        count: 0,
        qualifiers: new Map(),
      });
    }

    const baseEntry = mechanismBaseAccumulator.get(normalizedBase.key)!;

    if (!seenBaseKeys.has(normalizedBase.key)) {
      baseEntry.count += 1;
      seenBaseKeys.add(normalizedBase.key);
    }

    const qualifierNormalized = normalizeTagValue(chip.qualifier ?? undefined);
    const qualifierKey = qualifierNormalized?.key ?? GENERAL_QUALIFIER_KEY;

    if (!baseEntry.qualifiers.has(qualifierKey)) {
      baseEntry.qualifiers.set(qualifierKey, {
        label: qualifierNormalized?.label ?? "general",
        qualifier: qualifierNormalized?.label ?? null,
        count: 0,
      });
    }

    if (!seenQualifierKeys.has(`${normalizedBase.key}::${qualifierKey}`)) {
      baseEntry.qualifiers.get(qualifierKey)!.count += 1;
      seenQualifierKeys.add(`${normalizedBase.key}::${qualifierKey}`);
    }

    const combinationLabel = qualifierNormalized
      ? `${normalizedBase.label} (${qualifierNormalized.label})`
      : normalizedBase.label;

    const combinationNormalized = normalizeTagValue(combinationLabel);
    if (!combinationNormalized) {
      return;
    }

    if (!mechanismEntryAccumulator.has(combinationNormalized.key)) {
      mechanismEntryAccumulator.set(combinationNormalized.key, {
        label: combinationNormalized.label,
        base: normalizedBase.label,
        baseKey: normalizedBase.key,
        qualifier: qualifierNormalized?.label ?? undefined,
        count: 0,
      });
    }

    if (!seenEntryKeys.has(combinationNormalized.key)) {
      mechanismEntryAccumulator.get(combinationNormalized.key)!.count += 1;
      seenEntryKeys.add(combinationNormalized.key);
    }
  });
});

const mechanismOptions: TagOption[] = Array.from(mechanismBaseAccumulator.values())
  .map((entry) => ({
    value: entry.label,
    label: entry.label,
    count: entry.count,
  }))
  .sort((a, b) => a.label.localeCompare(b.label));

const mechanismQualifierOptions: Record<string, MechanismQualifierOption[]> = Object.fromEntries(
  Array.from(mechanismBaseAccumulator.entries()).map(([baseKey, entry]) => {
    const qualifiers = Array.from(entry.qualifiers.values())
      .map((qualifier) => ({
        qualifier: qualifier.qualifier,
        label: qualifier.label,
        count: qualifier.count,
      }))
      .sort((a, b) => {
        if (a.qualifier === null && b.qualifier !== null) {
          return -1;
        }
        if (a.qualifier !== null && b.qualifier === null) {
          return 1;
        }
        return a.label.localeCompare(b.label);
      });

    return [entry.label, qualifiers];
  }),
);

const mechanismEntryOptions: MechanismEntryOption[] = Array.from(mechanismEntryAccumulator.values())
  .map((entry) => ({
    value: entry.label,
    label: entry.label,
    count: entry.count,
    base: entry.base,
    qualifier: entry.qualifier,
  }))
  .sort((a, b) => a.label.localeCompare(b.label));

export {
  categoryTagOptions,
  psychoactiveClassOptions,
  chemicalClassOptions,
  mechanismOptions,
  mechanismQualifierOptions,
  mechanismEntryOptions,
};
