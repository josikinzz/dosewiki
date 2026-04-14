import "server-only";

import { cache } from "react";
import { CATEGORY_SLUG_TO_TAGS } from "../../src/data/effectCategoryDefinitions";
import { slugify } from "../../src/utils/slug";
import {
  getPublicCategoryLayout,
  getPublicContributorKeys,
  getPublicEffects,
  getPublicReports,
  getPublicSubstanceLookup,
} from "../convex/publicData";
import { getPublicLibrary } from "../convex/publicLibrary";

const unique = <T>(values: T[]) => Array.from(new Set(values));

export const getStaticSubstanceParams = cache(async () => {
  const substances = await getPublicSubstanceLookup();
  return substances.map(({ slug }) => ({ slug }));
});

export const getStaticCategoryParams = cache(async () => {
  const layout = await getPublicCategoryLayout();

  return (layout?.categories ?? []).map(({ key: categoryKey }) => ({ categoryKey }));
});

export const getStaticEffectParams = cache(async () => {
  const effects = await getPublicEffects();
  return effects.map(({ slug: effectSlug }) => ({ effectSlug }));
});

export const getStaticEffectCategoryParams = cache(async () => {
  return Object.keys(CATEGORY_SLUG_TO_TAGS).map((categorySlug) => ({ categorySlug }));
});

export const getStaticReportParams = cache(async () => {
  const reports = await getPublicReports();
  return reports.map(({ slug }) => ({ slug }));
});

export const getStaticContributorParams = cache(async () => {
  const profileKeys = await getPublicContributorKeys();
  return profileKeys.map((profileKey) => ({ profileKey: encodeURIComponent(profileKey) }));
});

export const getStaticPsychoactiveClassParams = cache(async () => {
  const library = await getPublicLibrary();
  const slugs = unique(
    library.allSubstanceRecords.flatMap((record) =>
      (record.psychoactiveClasses ?? []).map((entry) => slugify(entry)).filter(Boolean),
    ),
  );

  return slugs.map((slug) => ({ slug }));
});

export const getStaticChemicalClassParams = cache(async () => {
  const library = await getPublicLibrary();
  const slugs = unique(
    library.allSubstanceRecords.flatMap((record) =>
      (record.chemicalClasses ?? []).map((entry) => slugify(entry)).filter(Boolean),
    ),
  );

  return slugs.map((slug) => ({ slug }));
});

export const getStaticMechanismParams = cache(async () => {
  const library = await getPublicLibrary();
  return library.mechanismSummaries.map(({ slug: mechanismSlug }) => ({ mechanismSlug }));
});

export const getStaticMechanismQualifierParams = cache(async () => {
  const library = await getPublicLibrary();

  return library.mechanismSummaries.flatMap(({ slug: mechanismSlug }) => {
    const detail = library.getMechanismDetail(mechanismSlug);

    if (!detail) {
      return [];
    }

    return detail.qualifiers.map(({ key: qualifierSlug }) => ({
      mechanismSlug,
      qualifierSlug,
    }));
  });
});
