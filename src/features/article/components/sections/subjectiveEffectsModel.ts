import { SENSORY_CATEGORIES } from "@/data/subjectiveEffectSubcategories";
import type {
  EffectCategory,
  EffectEntry,
  SenseCategory,
  SubjectiveEffects,
} from "@/schema";

export const SUBJECTIVE_EFFECTS_STUB_MAX_EFFECTS = 3;

export function hasEffects(category: EffectCategory | undefined): boolean {
  if (!category || typeof category !== "object") return false;
  return Object.values(category).some(
    (subcategory) =>
      subcategory &&
      ((Array.isArray(subcategory.effects) && subcategory.effects.length > 0) ||
        Boolean(subcategory.note?.trim())),
  );
}

export function hasSenseEffects(
  senseCategory: SenseCategory | undefined,
): boolean {
  return Boolean(senseCategory && hasEffects(senseCategory.subcategories));
}

export function getSubcategories(
  category: EffectCategory | undefined,
): string[] {
  if (!category || typeof category !== "object") return [];
  return Object.keys(category).filter(
    (key) =>
      category[key] &&
      ((Array.isArray(category[key].effects) &&
        category[key].effects.length > 0) ||
        Boolean(category[key].note?.trim())),
  );
}

export function getSubcategoryData(
  category: EffectCategory | undefined,
  subcategory: string,
): { note: string; effects: EffectEntry[] } {
  if (!category || !category[subcategory]) return { note: "", effects: [] };
  return category[subcategory];
}

function countCategoryEffects(category: EffectCategory | undefined): number {
  const seen = new Set<string>();
  for (const subcategory of getSubcategories(category)) {
    for (const effect of getSubcategoryData(category, subcategory).effects) {
      const name = effect?.name?.trim();
      if (name) seen.add(name);
    }
  }
  return seen.size;
}

export function countVisibleEffects(
  subjectiveEffects: SubjectiveEffects | undefined,
): number {
  if (!subjectiveEffects) return 0;
  const sensory = subjectiveEffects.sensory;
  const categories: (EffectCategory | undefined)[] = [
    subjectiveEffects.physical,
    subjectiveEffects.cognitive,
    ...SENSORY_CATEGORIES.map(
      ({ key }) => sensory?.[key as keyof typeof sensory]?.subcategories,
    ),
  ];
  return categories.reduce(
    (total, category) => total + countCategoryEffects(category),
    0,
  );
}
