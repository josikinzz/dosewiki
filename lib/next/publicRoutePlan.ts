import "server-only";

import { unstable_cache } from "next/cache";
import { cache } from "react";
import { CATEGORY_SLUG_TO_TAGS } from "../../src/data/effectCategoryDefinitions";
import { deriveMechanismRouteData } from "../../src/data/builders/mechanismRouteDerivation";
import { PSYCHOACTIVE_SUMMARY_DEFINITIONS } from "../../src/features/psychoactive-summaries/summaryDefinitions";
import {
  PUBLIC_CONVEX_CACHE_REVALIDATE_SECONDS,
  PUBLIC_CONVEX_CACHE_TAGS,
  getPublicCategoryLayout,
  getPublicContributorKeys,
  getPublicEffectIndexArticles,
  getPublicEffects,
  getPublicMechanismRouteInput,
  getPublicReports,
  getPublicSubstanceLookup,
} from "../convex/publicData";
import { getPublicRoutePath } from "./publicSite";

export const STATIC_PUBLIC_PATHS = [
  getPublicRoutePath({ family: "home" }),
  getPublicRoutePath({ family: "substances" }),
  getPublicRoutePath({ family: "mantras" }),
  getPublicRoutePath({ family: "replicationTutorials" }),
  getPublicRoutePath({ family: "replicationAudio" }),
  getPublicRoutePath({ family: "effects" }),
  getPublicRoutePath({ family: "articles" }),
  getPublicRoutePath({ family: "reports" }),
  getPublicRoutePath({ family: "about" }),
] as const;

export type PublicRouteFamily =
  | "substances"
  | "categories"
  | "effects"
  | "effectCategories"
  | "psychoactiveSummaries"
  | "articles"
  | "reports"
  | "contributors"
  | "mechanisms"
  | "mechanismQualifiers";

export interface PublicRouteEntry<
  Params extends Record<string, string | string[]> = Record<string, string>,
> {
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
    psychoactiveSummaries: PublicRouteEntry<{ summaryPath: string[] }>[];
    articles: PublicRouteEntry<{ slug: string }>[];
    reports: PublicRouteEntry<{ slug: string }>[];
    contributors: PublicRouteEntry<{ profileKey: string }>[];
    mechanisms: PublicRouteEntry<{ mechanismSlug: string }>[];
    mechanismQualifiers: PublicRouteEntry<{ mechanismSlug: string; qualifierSlug: string }>[];
  };
}

interface PublicRoutePlanInput {
  substances: readonly { slug: string; priority?: "high" | "normal" | "low" }[];
  categories: readonly { key: string }[];
  effects: readonly { slug: string }[];
  articles: readonly { slug: string; publication_status: string }[];
  reports: readonly { slug: string }[];
  contributorKeys: readonly string[];
  mechanismRouteInput: Awaited<
    ReturnType<typeof getPublicMechanismRouteInput>
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

function articleEntriesFromRecords(
  articles: PublicRoutePlanInput["articles"],
): PublicRouteEntry<{ slug: string }>[] {
  const entriesBySlug = new Map<string, PublicRouteEntry<{ slug: string }>>();

  for (const article of articles) {
    if (!article.slug) continue;

    const includeInSitemap =
      article.publication_status === "published" ? undefined : false;
    const existing = entriesBySlug.get(article.slug);

    if (!existing || includeInSitemap !== false) {
      entriesBySlug.set(article.slug, {
        path: getPublicRoutePath({
          family: "article",
          params: { slug: article.slug },
        }),
        params: { slug: article.slug },
        includeInSitemap,
      });
    }
  }

  return [...entriesBySlug.values()];
}

export function buildPublicRoutePlan(input: PublicRoutePlanInput): PublicRoutePlan {
  const mechanismData = deriveMechanismRouteData(
    input.mechanismRouteInput.map((record) => ({ ...record, record })),
  );
  const mechanisms = mechanismData.mechanismSummaries.map(({ slug: mechanismSlug }) => ({
    path: getPublicRoutePath({ family: "mechanism", params: { mechanismSlug } }),
    params: { mechanismSlug },
  }));

  const mechanismQualifiers = mechanismData.mechanismSummaries.flatMap(({ slug: mechanismSlug }) => {
    const detail = mechanismData.mechanismMap.get(mechanismSlug);

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
      psychoactiveSummaries: PSYCHOACTIVE_SUMMARY_DEFINITIONS.map(
        ({ summaryPath }) => ({
          path: getPublicRoutePath({
            family: "psychoactiveSummary",
            params: { summaryPath: [...summaryPath] },
          }),
          params: { summaryPath: [...summaryPath] },
        }),
      ),
      articles: articleEntriesFromRecords(input.articles),
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

const getCachedPublicRoutePlan = unstable_cache(async () => {
  const [
    substances,
    categoryLayout,
    effects,
    articles,
    reports,
    contributorKeys,
    mechanismRouteInput,
  ] = await Promise.all([
    getPublicSubstanceLookup(),
    getPublicCategoryLayout(),
    getPublicEffects(),
    getPublicEffectIndexArticles(),
    getPublicReports(),
    getPublicContributorKeys(),
    getPublicMechanismRouteInput(),
  ]);

  return buildPublicRoutePlan({
    substances,
    categories: categoryLayout?.categories ?? [],
    effects,
    articles,
    reports,
    contributorKeys,
    mechanismRouteInput,
  });
}, ["convex-public-route-plan"], {
  revalidate: PUBLIC_CONVEX_CACHE_REVALIDATE_SECONDS,
  tags: [
    PUBLIC_CONVEX_CACHE_TAGS.all,
    PUBLIC_CONVEX_CACHE_TAGS.substances,
    PUBLIC_CONVEX_CACHE_TAGS.layouts,
    PUBLIC_CONVEX_CACHE_TAGS.effects,
    PUBLIC_CONVEX_CACHE_TAGS.articles,
    PUBLIC_CONVEX_CACHE_TAGS.reports,
    PUBLIC_CONVEX_CACHE_TAGS.contributors,
  ],
});

export const getPublicRoutePlan = cache(getCachedPublicRoutePlan);
