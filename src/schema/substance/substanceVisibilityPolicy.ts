export const HIDDEN_INDEX_CATEGORY = "hidden" as const;
export const LOW_PRIORITY_VALUE = "low" as const;

export type SubstanceVisibility = "public" | "hidden" | "low_priority";

/** Raw article-shaped visibility inputs (`index_categories` / `priority`). */
export type SubstanceVisibilitySource = {
  indexCategories?: readonly string[] | null;
  priority?: string | null;
};

/** Derived record flags set once from the raw inputs (see `buildSubstanceRecord`). */
export type SubstanceVisibilityFlags = {
  isHidden: boolean;
  isLowPriority: boolean;
};

const normalizeIndexCategory = (value: string): string => value.trim().toLowerCase();

/** A substance is hidden when its index categories include `hidden`. */
export function isHiddenSubstance(indexCategories: readonly string[] | null | undefined): boolean {
  return (indexCategories ?? []).some(
    (category) => normalizeIndexCategory(category) === HIDDEN_INDEX_CATEGORY,
  );
}

/** A substance is low-priority when its priority resolves to `low` (missing priority means `normal`). */
export function isLowPrioritySubstance(priority: string | null | undefined): boolean {
  return (priority ?? "normal") === LOW_PRIORITY_VALUE;
}

/** Resolve visibility from raw article inputs; `hidden` wins over `low_priority`. */
export function substanceVisibility(source: SubstanceVisibilitySource): SubstanceVisibility {
  if (isHiddenSubstance(source.indexCategories)) {
    return "hidden";
  }

  if (isLowPrioritySubstance(source.priority)) {
    return "low_priority";
  }

  return "public";
}

/** Records surface in public listings only when they are neither hidden nor low-priority. */
export function isPubliclyListedSubstance(flags: SubstanceVisibilityFlags): boolean {
  return !flags.isHidden && !flags.isLowPriority;
}
