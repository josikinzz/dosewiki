import { EFFECT_CATEGORY_DEFINITIONS } from "../../src/data/effectCategoryDefinitions";
import psychoactiveIndexManual from "@data/substances/psychoactiveIndexManual.json";
import replicationSlugAliases from "@data/effects/replicationSlugAliases.json";

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
  nootropics: "nootropic",
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

export { getSubstanceRouteAlias } from "./substanceRouteAliases";


export function getEffectCategoryRouteAliasParams(): {
  categorySlug: string;
}[] {
  return Object.keys(explicitEffectCategoryAliases).map((categorySlug) => ({
    categorySlug,
  }));
}

export function getCategoryRouteAlias(categoryKey: string): string | null {
  const normalized = categoryKey.trim().toLowerCase();
  const explicit =
    explicitCategoryAliases[normalized as keyof typeof explicitCategoryAliases];

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

export function getEffectCategoryRouteAlias(
  categorySlug: string,
): string | null {
  const normalized = categorySlug.trim().toLowerCase();
  const explicit =
    explicitEffectCategoryAliases[
      normalized as keyof typeof explicitEffectCategoryAliases
    ];

  if (explicit && effectCategorySlugs.has(explicit)) {
    return explicit;
  }

  return null;
}

export function getReplicationRouteAlias(slug: string): string | null {
  const normalized = slug.trim().toLowerCase();
  const target = (replicationSlugAliases as Record<string, string>)[normalized];

  return target && target !== normalized ? target : null;
}

const replicationArtistAliases = {
  anonymous: "unknown",
  stingrayz: "symmetric-vision",
  lokavision: "loka",
  wheressuede: "loka",
  wooodfield: "phosform",
  stasconstantine: "stas-constantine",
} as const satisfies Record<string, string>;

export function getReplicationArtistRouteAlias(key: string): string | null {
  const normalized = key.trim().toLowerCase();
  return (
    replicationArtistAliases[
      normalized as keyof typeof replicationArtistAliases
    ] ?? null
  );
}

export function getReplicationRouteAliasParams(): { slug: string }[] {
  return Object.keys(replicationSlugAliases).map((slug) => ({ slug }));
}
