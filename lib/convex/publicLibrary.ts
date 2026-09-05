import "server-only";

import { cache } from "react";
import { getPublicServerReadTarget } from "./runtimeTargets";
import { buildLibrary } from "../../src/data/builders/libraryBuilder";
import { parseManualConfig } from "../../src/data/builders/manualIndexLoader";
import type { LibraryData } from "../../src/data/SubstanceIndexProvider";
import type { TaxonomyRouteSurface } from "../../src/data/builders/taxonomy";
import type {
  CategoryDetail,
  ClassificationDetail,
  EffectDetail,
  MechanismDetail,
} from "../../src/data/builders/library";
import {
  buildSearchIndex,
  createSearchIndexInput,
  toSearchSuggestion,
  type SearchIndex,
  type SearchSuggestion,
} from "../../src/data/builders/search";
import {
  createSearchManifest,
  type SearchManifest,
} from "../../src/data/builders/searchManifest";
import {
  getIndexLayoutByType,
  getPublicContributorProfiles,
  getPublicEffectArticles,
  getPublicReports,
  getRawSubstances,
  type IndexLayoutType,
} from "./publicData";

const LIBRARY_CACHE_TTL_MS = 60 * 60 * 1000;
const SEARCH_INDEX_CACHE_TTL_MS = 10 * 60 * 1000;

export type PublicDerivedDataCacheInvalidation = {
  source:
    | "save-to-convex"
    | "proposal-apply"
    | "proposal-revert"
    | "save-quote"
    | "manual"
    | "test-write";
};

const EMPTY_LAYOUT = {
  version: 1,
  categories: [
    {
      key: "miscellaneous",
      label: "Miscellaneous",
      iconKey: "miscellaneous",
      drugs: [],
      sections: [],
    },
  ],
};

async function getNormalizedLayout(type: IndexLayoutType) {
  const layout = await getIndexLayoutByType(type);
  return parseManualConfig(layout ?? EMPTY_LAYOUT);
}

let publicLibraryCache:
  | {
      expiresAt: number;
      readTarget: string | null;
      value: LibraryData;
    }
  | null = null;

let publicSearchIndexCache:
  | {
      expiresAt: number;
      /**
       * The library instance the index was derived from. `getPublicLibrary`
       * hands out a stable instance until its own cache turns over, so
       * reference equality is an exact, free staleness check for substances.
       */
      library: LibraryData;
      /** Cheap shape check for the non-library sources. See {@link buildSearchSourceSignature}. */
      sourceSignature: string;
      value: SearchIndex;
    }
  | null = null;

export function invalidatePublicDerivedDataCache(
  _invalidation: PublicDerivedDataCacheInvalidation = { source: "manual" },
) {
  publicLibraryCache = null;
  publicSearchIndexCache = null;
}

async function buildPublicLibrary(): Promise<LibraryData> {
  const [articles, psychoactive, chemical, mechanism] = await Promise.all([
    getRawSubstances(),
    getNormalizedLayout("psychoactive"),
    getNormalizedLayout("chemical"),
    getNormalizedLayout("mechanism"),
  ]);

  return buildLibrary(articles, {
    psychoactive,
    chemical,
    mechanism,
  });
}

export const getPublicLibrary = cache(async (): Promise<LibraryData> => {
  const readTarget = getPublicServerReadTarget().selectedUrl;
  if (
    publicLibraryCache &&
    publicLibraryCache.readTarget === readTarget &&
    publicLibraryCache.expiresAt > Date.now()
  ) {
    return publicLibraryCache.value;
  }

  const value = await buildPublicLibrary();
  publicLibraryCache = {
    value,
    readTarget,
    expiresAt: Date.now() + LIBRARY_CACHE_TTL_MS,
  };

  return value;
});

/**
 * Identity of the non-library search sources, cheap enough to compute on every
 * request. Substance changes are caught exactly by comparing the library
 * instance; effect articles, reports and profiles are reached through
 * `unstable_cache` with its own revalidate window, so they only ever appear
 * here at that granularity. Anything finer is covered by the editor-save
 * invalidation path, which clears these module caches and expires the shared
 * public data-cache tag from request scope.
 */
function buildSearchSourceSignature(
  effectDefinitions: readonly unknown[],
  reports: readonly unknown[],
  profiles: readonly unknown[],
): string {
  return `${effectDefinitions.length}:${reports.length}:${profiles.length}`;
}

/**
 * The public search index, built at most once per cache window.
 *
 * Deriving the index input costs hundreds of milliseconds — it keywordizes every
 * substance, report and effect article — so it must never sit on the per-query
 * path. Querying an already-built index costs single-digit milliseconds.
 */
export const getPublicSearchIndex = cache(async (): Promise<SearchIndex> => {
  const [library, effectDefinitions, reports, profiles] = await Promise.all([
    getPublicLibrary(),
    getPublicEffectArticles(),
    getPublicReports(),
    getPublicContributorProfiles(),
  ]);

  const sourceSignature = buildSearchSourceSignature(effectDefinitions, reports, profiles);
  const cachedIndex = publicSearchIndexCache;

  if (
    cachedIndex &&
    cachedIndex.expiresAt > Date.now() &&
    cachedIndex.library === library &&
    cachedIndex.sourceSignature === sourceSignature
  ) {
    return cachedIndex.value;
  }

  const searchIndex = buildSearchIndex(
    createSearchIndexInput(library, { effectDefinitions, reports, profiles }),
  );
  publicSearchIndexCache = {
    value: searchIndex,
    library,
    sourceSignature,
    expiresAt: Date.now() + SEARCH_INDEX_CACHE_TTL_MS,
  };

  return searchIndex;
});

/**
 * Request-only projection of the shared index. Persistent caching belongs to
 * its read leaves: an outer entry would bypass them on every aggregate miss.
 */
export const getPublicSearchManifest = cache(async (): Promise<SearchManifest> =>
  createSearchManifest(await getPublicSearchIndex()),
);

export const getPublicSearchMatches = cache(async (query: string, limit = 20) => {
  if (!query.trim()) {
    return [];
  }

  return (await getPublicSearchIndex()).query(query, { limit });
});

// Keep search composition outside persistent leaves, including on cold instances.
const getCachedSearchSuggestions = cache(
  async (query: string, limit: number): Promise<SearchSuggestion[]> =>
    (await getPublicSearchMatches(query, limit)).map(toSearchSuggestion),
);

export const getPublicSearchSuggestions = cache(
  async (query: string, limit = 20): Promise<SearchSuggestion[]> => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) {
      return [];
    }
    return getCachedSearchSuggestions(trimmed, limit);
  },
);

export const getPublicCategoryDetail = cache(async (categoryKey: string) => {
  return (await getPublicLibrary()).getTaxonomyRouteDetail("category", categoryKey) as CategoryDetail | null;
});

export const getPublicChemicalClassDetail = cache(async (slug: string) => {
  return (await getPublicLibrary()).getTaxonomyRouteDetail("chemical", slug) as ClassificationDetail | null;
});

export const getPublicPsychoactiveClassDetail = cache(async (slug: string) => {
  return (await getPublicLibrary()).getTaxonomyRouteDetail("psychoactive", slug) as ClassificationDetail | null;
});

export const getPublicEffectDetail = cache(async (effectSlug: string) => {
  return (await getPublicLibrary()).getTaxonomyRouteDetail("effect", effectSlug) as EffectDetail | null;
});

export const getPublicMechanismDetail = cache(async (mechanismSlug: string) => {
  return (await getPublicLibrary()).getTaxonomyRouteDetail("mechanism", mechanismSlug) as MechanismDetail | null;
});

export const getPublicTaxonomyRouteDetail = cache(
  async (surface: TaxonomyRouteSurface, identifier: string) => {
    return (await getPublicLibrary()).getTaxonomyRouteDetail(surface, identifier);
  },
);
