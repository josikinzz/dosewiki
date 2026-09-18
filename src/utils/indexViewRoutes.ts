import { getPublicRoutePath } from "./publicRouteIdentity";

export const SUBSTANCE_INDEX_DEFAULT_VIEW = "all" as const;
export const EFFECT_INDEX_DEFAULT_VIEW = "all" as const;
export const SUBSTANCE_INDEX_LEGACY_COVER_ID = "substance-index-legacy";
export const EFFECT_INDEX_LEGACY_COVER_ID = "effect-index-legacy";
export const REPORTS_INDEX_DEFAULT_VIEW = "substance" as const;

const SUBSTANCE_VIEW_SLUGS = {
  "super:hallucinogens": "hallucinogens",
  psychedelic: "psychedelic",
  dissociative: "dissociative",
  deliriant: "deliriant",
  cannabinoid: "cannabinoid",
  entactogen: "entactogen",
  stimulant: "stimulant",
  nootropic: "nootropic",
  "super:depressants": "depressants",
  gabaergic: "gabaergic",
  opioid: "opioid",
  antidepressant: "antidepressant",
  antipsychotic: "antipsychotic",
} as const;

const EFFECT_VIEW_SLUGS = {
  sensory: "sensory",
  cognitive: "cognitive",
  physical: "physical",
  library: "library",
  info: "info",
} as const;

const REPORTS_VIEW_SLUGS = {
  title: "title",
  author: "author",
} as const;

export type SubstanceIndexView =
  | typeof SUBSTANCE_INDEX_DEFAULT_VIEW
  | keyof typeof SUBSTANCE_VIEW_SLUGS;
export type EffectIndexView =
  | typeof EFFECT_INDEX_DEFAULT_VIEW
  | keyof typeof EFFECT_VIEW_SLUGS;
export type ReportsIndexView =
  | typeof REPORTS_INDEX_DEFAULT_VIEW
  | keyof typeof REPORTS_VIEW_SLUGS;

export const SUBSTANCE_INDEX_VIEW_PARAMS = Object.entries(SUBSTANCE_VIEW_SLUGS).map(
  ([view, slug]) => ({ view: view as keyof typeof SUBSTANCE_VIEW_SLUGS, slug }),
);
export const EFFECT_INDEX_VIEW_PARAMS = Object.entries(EFFECT_VIEW_SLUGS).map(
  ([view, slug]) => ({ view: view as keyof typeof EFFECT_VIEW_SLUGS, slug }),
);
export const REPORTS_INDEX_VIEW_PARAMS = Object.entries(REPORTS_VIEW_SLUGS).map(
  ([view, slug]) => ({ view: view as keyof typeof REPORTS_VIEW_SLUGS, slug }),
);

function viewFromSlug<T extends string>(
  entries: ReadonlyArray<{ view: T; slug: string }>,
  slug: string,
): T | null {
  return entries.find((entry) => entry.slug === slug)?.view ?? null;
}

export function substanceIndexViewFromSlug(slug: string): SubstanceIndexView | null {
  return viewFromSlug(SUBSTANCE_INDEX_VIEW_PARAMS, slug);
}

export function effectIndexViewFromSlug(slug: string): EffectIndexView | null {
  return viewFromSlug(EFFECT_INDEX_VIEW_PARAMS, slug);
}

export function reportsIndexViewFromSlug(slug: string): ReportsIndexView | null {
  return viewFromSlug(REPORTS_INDEX_VIEW_PARAMS, slug);
}

export function substanceIndexViewPath(view: SubstanceIndexView): string {
  if (view === SUBSTANCE_INDEX_DEFAULT_VIEW) {
    return getPublicRoutePath({ family: "substances" });
  }
  return getPublicRoutePath({
    family: "substancesGroup",
    params: { groupSlug: SUBSTANCE_VIEW_SLUGS[view] },
  });
}

export function effectIndexViewPath(view: EffectIndexView): string {
  if (view === EFFECT_INDEX_DEFAULT_VIEW) {
    return getPublicRoutePath({ family: "effects" });
  }
  return getPublicRoutePath({
    family: "effectsGroup",
    params: { groupSlug: EFFECT_VIEW_SLUGS[view] },
  });
}

export function reportsIndexViewPath(view: ReportsIndexView): string {
  if (view === REPORTS_INDEX_DEFAULT_VIEW) {
    return getPublicRoutePath({ family: "reports" });
  }
  return getPublicRoutePath({
    family: "reportsGroup",
    params: { groupSlug: REPORTS_VIEW_SLUGS[view] },
  });
}

export function parseLegacySubstanceIndexHash(hash: string): SubstanceIndexView | null {
  const candidate = decodeHash(hash);
  if (candidate === SUBSTANCE_INDEX_DEFAULT_VIEW) {
    return candidate;
  }
  return Object.prototype.hasOwnProperty.call(SUBSTANCE_VIEW_SLUGS, candidate)
    ? (candidate as keyof typeof SUBSTANCE_VIEW_SLUGS)
    : null;
}

export function parseLegacyEffectIndexHash(hash: string): EffectIndexView | null {
  const candidate = decodeHash(hash).toLowerCase();
  if (candidate === EFFECT_INDEX_DEFAULT_VIEW) {
    return candidate;
  }
  return Object.prototype.hasOwnProperty.call(EFFECT_VIEW_SLUGS, candidate)
    ? (candidate as keyof typeof EFFECT_VIEW_SLUGS)
    : null;
}

function decodeHash(hash: string): string {
  const raw = hash.replace(/^#/, "").trim();
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}
