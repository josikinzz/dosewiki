import "server-only";

import { cache } from "react";
import { CATEGORY_SLUG_TO_TAGS } from "../../src/data/effectCategoryDefinitions";
import type { LibraryData } from "../../src/data/SubstanceIndexProvider";
import { slugify } from "../../src/utils/slug";
import {
  getPublicCategoryLayout,
  getPublicContributorKeys,
  getPublicEffects,
  getPublicReports,
  getPublicSubstanceLookup,
} from "../convex/publicData";
import { getPublicLibrary } from "../convex/publicLibrary";
import { getPublicRoutePath } from "./publicSite";

export const STATIC_PUBLIC_PATHS = [
  getPublicRoutePath({ family: "home" }),
  getPublicRoutePath({ family: "substances" }),
  getPublicRoutePath({ family: "mantras" }),
  getPublicRoutePath({ family: "effects" }),
  getPublicRoutePath({ family: "reports" }),
  getPublicRoutePath({ family: "about" }),
] as const;

export type PublicRouteFamily =
  | "substances"
  | "categories"
  | "effects"
  | "effectCategories"
  | "reports"
  | "contributors"
  | "chemicalClasses"
  | "psychoactiveClasses"
  | "mechanisms"
  | "mechanismQualifiers";

export interface PublicRouteEntry<Params extends Record<string, string> = Record<string, string>> {
  path: string;
  params: Params;
  includeInSitemap?: boolean;
}

export interface PublicRoutePlan {
  staticPaths: string[];
  families: {
    substances: PublicRouteEntry<{ slug: string }>[];
    categories: PublicRouteEntry<{ categoryKey: string }>[];
    effects: PublicRouteEntry<{ effectSlug: string }>[];
    effectCategories: PublicRouteEntry<{ categorySlug: string }>[];
    reports: PublicRouteEntry<{ slug: string }>[];
    contributors: PublicRouteEntry<{ profileKey: string }>[];
    chemicalClasses: PublicRouteEntry<{ slug: string }>[];
    psychoactiveClasses: PublicRouteEntry<{ slug: string }>[];
    mechanisms: PublicRouteEntry<{ mechanismSlug: string }>[];
    mechanismQualifiers: PublicRouteEntry<{ mechanismSlug: string; qualifierSlug: string }>[];
  };
}

interface PublicRoutePlanInput {
  substances: readonly { slug: string; priority?: "high" | "normal" | "low" }[];
  categories: readonly { key: string }[];
  effects: readonly { slug: string }[];
  reports: readonly { slug: string }[];
  contributorKeys: readonly string[];
  library: Pick<
    LibraryData,
    | "allSubstanceRecords"
    | "mechanismSummaries"
    | "getMechanismDetail"
    | "getChemicalClassDetail"
    | "getPsychoactiveClassDetail"
  >;
}

const unique = <T>(values: readonly T[]) => Array.from(new Set(values));

const entriesFromSlugs = <ParamKey extends string>(
  slugs: readonly string[],
  paramKey: ParamKey,
  getPath: (slug: string) => string,
): PublicRouteEntry<Record<ParamKey, string>>[] =>
  unique(slugs.filter(Boolean)).map((slug) => ({
    path: getPath(slug),
    params: { [paramKey]: slug } as Record<ParamKey, string>,
  }));

function substanceEntriesFromLookup(
  substances: PublicRoutePlanInput["substances"],
): PublicRouteEntry<{ slug: string }>[] {
  const entriesBySlug = new Map<string, PublicRouteEntry<{ slug: string }>>();

  for (const { slug, priority } of substances) {
    if (!slug) {
      continue;
    }

    const existing = entriesBySlug.get(slug);
    const includeInSitemap = priority === "low" ? false : undefined;

    if (!existing) {
      entriesBySlug.set(slug, {
        path: getPublicRoutePath({ family: "substance", params: { slug } }),
        params: { slug },
        includeInSitemap,
      });
      continue;
    }

    if (includeInSitemap !== false) {
      entriesBySlug.set(slug, {
        ...existing,
        includeInSitemap: undefined,
      });
    }
  }

  return [...entriesBySlug.values()];
}

function getClassSlugs(
  records: PublicRoutePlanInput["library"]["allSubstanceRecords"],
  field: "chemicalClasses" | "psychoactiveClasses",
) {
  return unique(
    records.flatMap((record) =>
      (record[field] ?? []).map((entry) => slugify(entry)).filter(Boolean),
    ),
  );
}

function classEntriesFromRecords<ParamKey extends string>(
  records: PublicRoutePlanInput["library"]["allSubstanceRecords"],
  field: "chemicalClasses" | "psychoactiveClasses",
  paramKey: ParamKey,
  getPath: (slug: string) => string,
  getDetail: (slug: string) => unknown,
): PublicRouteEntry<Record<ParamKey, string>>[] {
  return getClassSlugs(records, field).map((slug) => ({
    path: getPath(slug),
    params: { [paramKey]: slug } as Record<ParamKey, string>,
    includeInSitemap: getDetail(slug) ? undefined : false,
  }));
}

export function buildPublicRoutePlan(input: PublicRoutePlanInput): PublicRoutePlan {
  const mechanisms = input.library.mechanismSummaries.map(({ slug: mechanismSlug }) => ({
    path: getPublicRoutePath({ family: "mechanism", params: { mechanismSlug } }),
    params: { mechanismSlug },
  }));

  const mechanismQualifiers = input.library.mechanismSummaries.flatMap(({ slug: mechanismSlug }) => {
    const detail = input.library.getMechanismDetail(mechanismSlug);

    if (!detail) {
      return [];
    }

    return detail.qualifiers.map(({ key: qualifierSlug }) => ({
      path: getPublicRoutePath({
        family: "mechanismQualifier",
        params: { mechanismSlug, qualifierSlug },
      }),
      params: { mechanismSlug, qualifierSlug },
      includeInSitemap: qualifierSlug !== detail.defaultQualifierKey,
    }));
  });

  return {
    staticPaths: [...STATIC_PUBLIC_PATHS],
    families: {
      substances: substanceEntriesFromLookup(input.substances),
      categories: unique(input.categories.map(({ key }) => key)).map((categoryKey) => ({
        path: getPublicRoutePath({ family: "category", params: { categoryKey } }),
        params: { categoryKey },
      })),
      effects: entriesFromSlugs(input.effects.map(({ slug }) => slug), "effectSlug", (effectSlug) =>
        getPublicRoutePath({ family: "effect", params: { effectSlug } }),
      ),
      effectCategories: entriesFromSlugs(
        Object.keys(CATEGORY_SLUG_TO_TAGS),
        "categorySlug",
        (categorySlug) => getPublicRoutePath({ family: "effectCategory", params: { categorySlug } }),
      ),
      reports: entriesFromSlugs(input.reports.map(({ slug }) => slug), "slug", (slug) =>
        getPublicRoutePath({ family: "report", params: { slug } }),
      ),
      contributors: unique(
        input.contributorKeys.map((profileKey) => profileKey.trim().toLowerCase()).filter(Boolean),
      ).map((profileKey) => {
        const path = getPublicRoutePath({
          family: "contributor",
          params: { profileKey },
        });
        const encodedProfileKey = path.split("/").pop() ?? "";

        return {
          path,
          params: { profileKey: encodedProfileKey },
        };
      }),
      chemicalClasses: classEntriesFromRecords(
        input.library.allSubstanceRecords,
        "chemicalClasses",
        "slug",
        (slug) => getPublicRoutePath({ family: "chemicalClass", params: { slug } }),
        input.library.getChemicalClassDetail,
      ),
      psychoactiveClasses: classEntriesFromRecords(
        input.library.allSubstanceRecords,
        "psychoactiveClasses",
        "slug",
        (slug) => getPublicRoutePath({ family: "psychoactiveClass", params: { slug } }),
        input.library.getPsychoactiveClassDetail,
      ),
      mechanisms,
      mechanismQualifiers,
    },
  };
}

export function getPublicRouteParams<Family extends PublicRouteFamily>(
  plan: PublicRoutePlan,
  family: Family,
): PublicRoutePlan["families"][Family][number]["params"][] {
  return plan.families[family].map((entry) => entry.params);
}

export function getPublicRouteSitemapPaths(plan: PublicRoutePlan) {
  const dynamicPaths = Object.values(plan.families).flatMap((entries) =>
    entries
      .filter((entry) => entry.includeInSitemap !== false)
      .map((entry) => entry.path),
  );

  return unique([...plan.staticPaths, ...dynamicPaths]);
}

export const getPublicRoutePlan = cache(async () => {
  const [substances, categoryLayout, effects, reports, contributorKeys, library] = await Promise.all([
    getPublicSubstanceLookup(),
    getPublicCategoryLayout(),
    getPublicEffects(),
    getPublicReports(),
    getPublicContributorKeys(),
    getPublicLibrary(),
  ]);

  return buildPublicRoutePlan({
    substances,
    categories: categoryLayout?.categories ?? [],
    effects,
    reports,
    contributorKeys,
    library,
  });
});
