import { EFFECT_CATEGORY_DEFINITIONS } from "../../src/data/effectCategoryDefinitions";
import psychoactiveIndexManual from "../../src/data/indexes/psychoactiveIndexManual.json";

type ManualCategory = {
  key: string;
};

const manualCategoryKeys = new Set(
  (psychoactiveIndexManual.categories as ManualCategory[])
    .map((category) => category.key)
    .filter(Boolean),
);

const effectCategorySlugs = new Set(
  EFFECT_CATEGORY_DEFINITIONS.map((definition) => definition.slug),
);

const explicitCategoryAliases = {
  psychedelics: "psychedelic",
  dissociatives: "dissociative",
  entactogens: "entactogen",
  stimulants: "stimulant",
  antidepressants: "antidepressant",
  antipsychotics: "antipsychotic",
  opioids: "opioid",
  deliriants: "deliriant",
  hallucinogens: "hallucinogen",
  gabaergics: "gabaergic",
  cannabinoids: "cannabinoid",
} as const satisfies Record<string, string>;

const explicitEffectCategoryAliases = {
  visual: "visual-effects",
  visuals: "visual-effects",
  auditory: "auditory-effects",
  cognitive: "cognitive-effects",
  physical: "physical-effects",
  tactile: "tactile-effects",
  multisensory: "multisensory-effects",
  hallucinatory: "hallucinatory-states",
  "hallucinatory-state": "hallucinatory-states",
  "geometric-pattern": "geometric-patterns",
  "smell-and-taste": "smell-and-taste-effects",
} as const satisfies Record<string, string>;

export function getCategoryRouteAliasParams(): { categoryKey: string }[] {
  return Object.keys(explicitCategoryAliases).map((categoryKey) => ({ categoryKey }));
}

export function getEffectCategoryRouteAliasParams(): { categorySlug: string }[] {
  return Object.keys(explicitEffectCategoryAliases).map((categorySlug) => ({ categorySlug }));
}

export function getCategoryRouteAlias(categoryKey: string): string | null {
  const normalized = categoryKey.trim().toLowerCase();
  const explicit = explicitCategoryAliases[normalized as keyof typeof explicitCategoryAliases];

  if (explicit && manualCategoryKeys.has(explicit)) {
    return explicit;
  }

  if (normalized.endsWith("s")) {
    const singular = normalized.slice(0, -1);
    if (manualCategoryKeys.has(singular)) {
      return singular;
    }
  }

  return null;
}

export function getEffectCategoryRouteAlias(categorySlug: string): string | null {
  const normalized = categorySlug.trim().toLowerCase();
  const explicit = explicitEffectCategoryAliases[normalized as keyof typeof explicitEffectCategoryAliases];

  if (explicit && effectCategorySlugs.has(explicit)) {
    return explicit;
  }

  return null;
}
