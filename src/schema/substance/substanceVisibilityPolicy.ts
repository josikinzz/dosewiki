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

export type SubstanceVisibilitySource = {
  indexCategories?: readonly string[] | null;
  priority?: string | null;
};

export type SubstanceVisibilityFlags = {
  isHidden: boolean;
  isDirectUrlOnly: boolean;
};

const normalizeIndexCategory = (value: string): string => value.trim().toLowerCase();

export function isHiddenSubstance(indexCategories: readonly string[] | null | undefined): boolean {
  return (indexCategories ?? []).some(
    (category) => normalizeIndexCategory(category) === HIDDEN_INDEX_CATEGORY,
  );
}

export function isSubstancePriority(value: unknown): value is SubstancePriority {
  return typeof value === "string" && SUBSTANCE_PRIORITY_VALUES.some((priority) => priority === value);
}

export function isDirectUrlOnlySubstance(priority: string | null | undefined): boolean {
  return DIRECT_URL_ONLY_PRIORITY_VALUES.some((value) => value === (priority ?? "normal"));
}

export function substanceVisibility(source: SubstanceVisibilitySource): SubstanceVisibility {
  if (isHiddenSubstance(source.indexCategories)) {
    return "hidden";
  }

  if (isDirectUrlOnlySubstance(source.priority)) {
    return "low_priority";
  }

  return "public";
}

export function isPubliclyListedSubstance(flags: SubstanceVisibilityFlags): boolean {
  return !flags.isHidden && !flags.isDirectUrlOnly;
}
