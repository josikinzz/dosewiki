import type {
  ManualCategoryDefinition,
  ManualCategorySection,
  ManualIndexConfig,
  ManualSectionLink,
} from "@/data/builders/manualIndexLoader";
import { slugify } from "@/utils/slug";

export const deepClone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

export const areStringArraysEqual = (first: readonly string[], second: readonly string[]): boolean => {
  if (first === second) {
    return true;
  }
  if (first.length !== second.length) {
    return false;
  }
  for (let index = 0; index < first.length; index += 1) {
    if (first[index] !== second[index]) {
      return false;
    }
  }
  return true;
};

export const areLinksEqual = (first?: ManualSectionLink, second?: ManualSectionLink): boolean => {
  if (first === second) {
    return true;
  }
  if (!first || !second) {
    return false;
  }
  return first.type === second.type && first.value === second.value;
};

export const areSectionsEqual = (
  first: readonly ManualCategorySection[],
  second: readonly ManualCategorySection[],
): boolean => {
  if (first === second) {
    return true;
  }
  if (first.length !== second.length) {
    return false;
  }
  for (let index = 0; index < first.length; index += 1) {
    const sectionA = first[index];
    const sectionB = second[index];
    if (sectionA === sectionB) {
      continue;
    }
    if (
      sectionA.key !== sectionB.key
      || sectionA.label !== sectionB.label
      || sectionA.notes !== sectionB.notes
      || !areLinksEqual(sectionA.link, sectionB.link)
      || !areStringArraysEqual(sectionA.drugs, sectionB.drugs)
    ) {
      return false;
    }
  }
  return true;
};

export const areCategoriesEqual = (
  first: readonly ManualCategoryDefinition[],
  second: readonly ManualCategoryDefinition[],
): boolean => {
  if (first === second) {
    return true;
  }
  if (first.length !== second.length) {
    return false;
  }
  for (let index = 0; index < first.length; index += 1) {
    const categoryA = first[index];
    const categoryB = second[index];
    if (categoryA === categoryB) {
      continue;
    }
    if (
      categoryA.key !== categoryB.key
      || categoryA.label !== categoryB.label
      || categoryA.iconKey !== categoryB.iconKey
      || categoryA.notes !== categoryB.notes
      || !areStringArraysEqual(categoryA.drugs, categoryB.drugs)
      || !areSectionsEqual(categoryA.sections, categoryB.sections)
    ) {
      return false;
    }
  }
  return true;
};

export const collectCategorySlugs = (category: ManualCategoryDefinition): Set<string> => {
  const slugs = new Set<string>();
  for (const slug of category.drugs) {
    slugs.add(slug);
  }
  for (const section of category.sections) {
    for (const slug of section.drugs) {
      slugs.add(slug);
    }
  }
  return slugs;
};

export const generateUniqueKey = (base: string, existing: Set<string>): string => {
  const normalizedBase = slugify(base) || "category";
  if (!existing.has(normalizedBase)) {
    return normalizedBase;
  }

  let suffix = 2;
  while (existing.has(`${normalizedBase}-${suffix}`)) {
    suffix += 1;
  }
  return `${normalizedBase}-${suffix}`;
};

export const ensureString = (value: string): string => value.trim();

/**
 * Compare two manual configurations (arrays of ManualCategoryDefinition).
 * This is effectively an alias for areCategoriesEqual since manuals are category arrays.
 */
export const areManualsEqual = (
  first: ManualIndexConfig,
  second: ManualIndexConfig,
): boolean => areCategoriesEqual(first.categories, second.categories);
