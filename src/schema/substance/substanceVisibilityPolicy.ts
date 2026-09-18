export const HIDDEN_INDEX_CATEGORY = "hidden" as const;
export const SUBSTANCE_PRIORITY_VALUES = [
  "high",
  "normal",
  "low",
  "hide_for_now",
] as const;
const DIRECT_URL_ONLY_PRIORITY_VALUES = ["low", "hide_for_now"] as const

export type SubstancePriority = (typeof SUBSTANCE_PRIORITY_VALUES)[number];
export type SubstanceVisibility = "public" | "hidden" | "low_priority";

/** Raw article-shaped visibility inputs (`index_categories` / `priority`). */
export type SubstanceVisibilitySource = {
  indexCategories?: readonly string[] | null;
  priority?: string | null;
};

/** Derived record flags set once from the raw inputs (see `buildSubstanceRecord`). */
export type SubstanceVisibilityFlags = {
  isHidden: boolean;
  isDirectUrlOnly: boolean;
};

const normalizeIndexCategory = (value: string): string => value.trim().toLowerCase();

/** A substance is hidden when its index categories include `hidden`. */
export function isHiddenSubstance(indexCategories: readonly string[] | null | undefined): boolean {
  return (indexCategories ?? []).some(
    (category) => normalizeIndexCategory(category) === HIDDEN_INDEX_CATEGORY,
  );
}

/** Narrow an unknown value to the canonical stored priority vocabulary. */
export function isSubstancePriority(value: unknown): value is SubstancePriority {
  return typeof value === "string" && SUBSTANCE_PRIORITY_VALUES.some((priority) => priority === value);
}

/** Low and hide-for-now records remain available by direct URL but are not publicly listed. */
export function isDirectUrlOnlySubstance(priority: string | null | undefined): boolean {
  return DIRECT_URL_ONLY_PRIORITY_VALUES.some((value) => value === (priority ?? "normal"));
}

/** Resolve visibility from raw article inputs; `hidden` wins over the direct-URL-only bucket. */
export function substanceVisibility(source: SubstanceVisibilitySource): SubstanceVisibility {
  if (isHiddenSubstance(source.indexCategories)) {
    return "hidden";
  }

  if (isDirectUrlOnlySubstance(source.priority)) {
    return "low_priority";
  }

  return "public";
}

/** Records surface in public listings only when they are neither hidden nor direct-URL-only. */
export function isPubliclyListedSubstance(flags: SubstanceVisibilityFlags): boolean {
  return !flags.isHidden && !flags.isDirectUrlOnly;
}
