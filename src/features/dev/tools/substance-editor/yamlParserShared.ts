type EffectEntry = {
  name: string;
  description: string;
}

export type EffectCategory = Record<string, {
  note: string;
  effects: EffectEntry[];
}>;

export type SenseCategory = {
  note: string;
  subcategories: EffectCategory;
};

export function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function getString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function getNumber(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

export function getStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === "string");
}

export function getObject(value: unknown): Record<string, unknown> {
  return isObjectRecord(value) ? value : {};
}

function normalizeEffectsArray(value: unknown): EffectEntry[] { if (!Array.isArray(value)) {
  return [];
}

return value
  .map((entry) => {
    if (typeof entry === "string") {
      return { name: entry, description: "" };
    }

    if (!isObjectRecord(entry)) {
      return null;
    }

    return {
      name: getString(entry.name),
      description: getString(entry.description),
    };
  })
  .filter((entry): entry is EffectEntry => entry !== null && entry.name.length > 0); }

export function getEffectCategory(value: unknown): EffectCategory {
  if (Array.isArray(value)) {
    const effects = normalizeEffectsArray(value);
    return effects.length > 0 ? { General: { note: "", effects } } : {};
  }

  if (!isObjectRecord(value)) {
    return {};
  }

  const category: EffectCategory = {};

  for (const [subcategory, subcategoryData] of Object.entries(value)) {
    if (isObjectRecord(subcategoryData) && "effects" in subcategoryData) {
      const effects = normalizeEffectsArray(subcategoryData.effects);
      const note = getString(subcategoryData.note);
      if (effects.length > 0 || note) {
        category[subcategory] = { note, effects };
      }
      continue;
    }

    if (!Array.isArray(subcategoryData)) {
      continue;
    }

    const effects = normalizeEffectsArray(subcategoryData);
    if (effects.length > 0) {
      category[subcategory] = { note: "", effects };
    }
  }

  return category;
}

export function getSenseCategory(value: unknown): SenseCategory {
  if (!isObjectRecord(value)) {
    return { note: "", subcategories: {} };
  }

  if ("subcategories" in value) {
    return {
      note: getString(value.note),
      subcategories: getEffectCategory(value.subcategories),
    };
  }

  return {
    note: "",
    subcategories: getEffectCategory(value),
  };
}

export function normalizeDateRange(raw: unknown): { start: string; end?: string } | undefined {
  if (!isObjectRecord(raw)) {
    return undefined;
  }

  const start = getString(raw.start);
  if (!start) {
    return undefined;
  }

  const end = getString(raw.end);
  return end ? { start, end } : { start };
}
