/**
 * Shared manual index dataset loader utilities.
 *
 * JSON shape (see related schemas):
 * {
 *   "$schema": string,
 *   "version": number,
 *   "categories": [
 *     {
 *       "key": string,
 *       "label": string,
 *       "iconKey": string,
 *       "notes"?: string,
 *       "drugs": string[],
 *       "sections": [
 *         {
 *           "key": string,
 *           "label": string,
 *           "notes"?: string,
 *           "link"?: { "type": "chemicalClass" | "psychoactiveClass" | "mechanism", "value": string },
 *           "drugs": string[]
 *         }
 *       ]
 *     }
 *   ]
 * }
 */
import { slugify } from "../../utils/slug";

type ManualSectionLinkType = "chemicalClass" | "psychoactiveClass" | "mechanism";

export interface ManualSectionLink {
  type: ManualSectionLinkType;
  value: string;
}

export interface ManualCategorySection {
  key: string;
  label: string;
  notes?: string;
  link?: ManualSectionLink;
  drugs: string[];
}

type ColumnAssignments = Record<string, number>;

export interface ManualCategoryDefinition {
  key: string;
  label: string;
  iconKey: string;
  notes?: string;
  /** @deprecated Use columns instead */
  column?: number;
  columns?: ColumnAssignments;
  drugs: string[];
  sections: ManualCategorySection[];
}


export interface ManualIndexConfig {
  version: number;
  categories: ManualCategoryDefinition[];
  /** Monotonic stored publication revision; absent on checked-in layout defaults. */
  revision?: number;
}

export interface NormalizedManualCategorySection extends ManualCategorySection {
  normalizedKey: string;
  drugSet: Set<string>;
}

export interface NormalizedManualCategoryDefinition extends Omit<ManualCategoryDefinition, 'sections'> {
  normalizedKey: string;
  columns?: ColumnAssignments;
  sections: NormalizedManualCategorySection[];  // Override to use normalized sections
  sectionMap: Map<string, NormalizedManualCategorySection>;
  drugSet: Set<string>;
}

export interface NormalizedManualIndexConfig {
  version: number;
  categories: NormalizedManualCategoryDefinition[];
  categoryMap: Map<string, NormalizedManualCategoryDefinition>;
}

type UnknownRecord = Record<string, unknown>;

const isObject = (value: unknown): value is UnknownRecord =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const assertString = (value: unknown, path: string): string => {
  if (typeof value !== "string") {
    throw new Error(`${path} must be a string.`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${path} must not be empty.`);
  }
  return trimmed;
};

const normalizeSlug = (value: string, path: string): string => {
  const normalized = slugify(value);
  if (!normalized) {
    throw new Error(`${path} must produce a slug value.`);
  }
  return normalized;
};

const parseDrugs = (value: unknown, path: string): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry, index) => {
      if (typeof entry !== "string") {
        throw new Error(`${path}[${index}] must be a string.`);
      }
      const trimmed = entry.trim();
      if (!trimmed) {
        throw new Error(`${path}[${index}] must not be empty.`);
      }
      return trimmed;
    })
    .filter((entry, index, list) => list.indexOf(entry) === index);
};

const parseSection = (
  value: unknown,
  index: number,
  parentKey: string,
): NormalizedManualCategorySection => {
  if (!isObject(value)) {
    throw new Error(`sections[${index}] must be an object for category "${parentKey}".`);
  }

  const key = assertString(value.key, `sections[${index}].key`);
  const label = assertString(value.label, `sections[${index}].label`);
  const notes = typeof value.notes === "string" ? value.notes.trim() || undefined : undefined;
  const drugs = parseDrugs(value.drugs, `sections[${index}].drugs`);

  let link: ManualSectionLink | undefined;
  if (value.link !== undefined) {
    if (!isObject(value.link)) {
      throw new Error(`sections[${index}].link must be an object.`);
    }
    const type = assertString(value.link.type, `sections[${index}].link.type`);
    if (type !== "chemicalClass" && type !== "psychoactiveClass" && type !== "mechanism") {
      throw new Error(
        `sections[${index}].link.type must be one of "chemicalClass", "psychoactiveClass", or "mechanism".`,
      );
    }
    const valueField = assertString(value.link.value, `sections[${index}].link.value`);
    link = {
      type,
      value: valueField,
    };
  }

  const normalizedKey = normalizeSlug(key, `sections[${index}].key`);
  return {
    key,
    label,
    notes,
    link,
    drugs,
    normalizedKey,
    drugSet: new Set(drugs.map((entry) => entry.trim())),
  };
};

const parseColumns = (value: unknown, path: string): ColumnAssignments | undefined => {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!isObject(value)) {
    throw new Error(`${path} must be an object.`);
  }
  const result: ColumnAssignments = {};
  for (const [key, val] of Object.entries(value)) {
    if (typeof val === "number" && Number.isInteger(val) && val >= 0) {
      result[key] = val;
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
};

const parseCategory = (value: unknown, index: number): NormalizedManualCategoryDefinition => {
  if (!isObject(value)) {
    throw new Error(`categories[${index}] must be an object.`);
  }

  const key = assertString(value.key, `categories[${index}].key`);
  const label = assertString(value.label, `categories[${index}].label`);
  const iconKey = assertString(value.iconKey, `categories[${index}].iconKey`);
  const notes = typeof value.notes === "string" ? value.notes.trim() || undefined : undefined;
  
  // Parse new columns object
  const columns = parseColumns(value.columns, `categories[${index}].columns`);
  
  // Legacy column support for backwards compatibility
  const legacyColumn =
    typeof value.column === "number" && Number.isInteger(value.column) && value.column >= 0
      ? value.column
      : undefined;
  
  const drugs = parseDrugs(value.drugs, `categories[${index}].drugs`);
  const sectionValues = Array.isArray(value.sections) ? value.sections : [];
  const sections = sectionValues.map((section, sectionIndex) =>
    parseSection(section, sectionIndex, key),
  );

  const normalizedKey = normalizeSlug(key, `categories[${index}].key`);
  const sectionMap = new Map<string, NormalizedManualCategorySection>();
  sections.forEach((section) => {
    if (!sectionMap.has(section.normalizedKey)) {
      sectionMap.set(section.normalizedKey, section);
    }
  });

  return {
    key,
    label,
    iconKey,
    notes,
    columns,
    column: legacyColumn,
    drugs,
    sections,
    normalizedKey,
    sectionMap,
    drugSet: new Set(drugs.map((entry) => entry.trim())),
  };
};

export const parseManualConfig = (value: unknown): NormalizedManualIndexConfig => {
  if (!isObject(value)) {
    throw new Error("Manual index config must be an object.");
  }

  if (typeof value.version !== "number" || Number.isNaN(value.version)) {
    throw new Error("version must be a number.");
  }

  const categoriesRaw = Array.isArray(value.categories) ? value.categories : [];
  if (categoriesRaw.length === 0) {
    throw new Error("categories must contain at least one category entry.");
  }

  const categories = categoriesRaw.map((category, index) => parseCategory(category, index));
  const categoryMap = new Map<string, NormalizedManualCategoryDefinition>();

  categories.forEach((category) => {
    if (!categoryMap.has(category.normalizedKey)) {
      categoryMap.set(category.normalizedKey, category);
    }
  });

  return {
    version: value.version,
    categories,
    categoryMap,
  };
};


