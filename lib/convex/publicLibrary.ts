import "server-only";

import { unstable_cache } from "next/cache";
import { cache } from "react";
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
  PUBLIC_CONVEX_CACHE_REVALIDATE_SECONDS,
  PUBLIC_CONVEX_CACHE_TAGS,
  type IndexLayoutType,
} from "./publicData";

const LIBRARY_CACHE_TTL_MS = 60 * 60 * 1000;
const SEARCH_INDEX_CACHE_TTL_MS = 10 * 60 * 1000;
const DERIVED_CACHE_PAYLOAD_WARNING_BYTES = 1.5 * 1024 * 1024;

export type PublicDerivedDataCacheInvalidation = {
  source:
    | "save-to-convex"
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
  if (publicLibraryCache && publicLibraryCache.expiresAt > Date.now()) {
    return publicLibraryCache.value;
  }

  const value = await buildPublicLibrary();
  publicLibraryCache = {
    value,
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
 * The browser-side search manifest, derived from the same index the server
 * ranks with. The JSON-safe result is stored in Next's tagged data cache;
 * `react.cache` still deduplicates callers within a render.
 */
export const getPublicSearchManifest = cache(unstable_cache(async (): Promise<SearchManifest> => {
  const manifest = createSearchManifest(await getPublicSearchIndex());
  const sizeBytes = new TextEncoder().encode(JSON.stringify(manifest)).byteLength;
  if (sizeBytes >= DERIVED_CACHE_PAYLOAD_WARNING_BYTES) {
    console.warn(
      `[public-cache] Search manifest is ${(sizeBytes / 1024 / 1024).toFixed(2)} MB and approaching the 2 MB data-cache payload limit.`,
    );
  }
  return manifest;
}, ["convex-public-search-manifest"], {
  revalidate: PUBLIC_CONVEX_CACHE_REVALIDATE_SECONDS,
  tags: [
    PUBLIC_CONVEX_CACHE_TAGS.all,
    PUBLIC_CONVEX_CACHE_TAGS.substances,
    PUBLIC_CONVEX_CACHE_TAGS.layouts,
    PUBLIC_CONVEX_CACHE_TAGS.effects,
    PUBLIC_CONVEX_CACHE_TAGS.reports,
    PUBLIC_CONVEX_CACHE_TAGS.contributors,
  ],
}));

export const getPublicSearchMatches = cache(async (query: string, limit = 20) => {
  if (!query.trim()) {
    return [];
  }

  return (await getPublicSearchIndex()).query(query, { limit });
});

/**
 * Per-query suggestion results in Next's tagged data cache.
 *
 * The raw substance corpus (~5 MB) is far past the 2 MB data-cache entry
 * limit, so the index itself can only live in per-instance module caches — a
 * cold instance still pays the full corpus fetch and keywordization. What CAN
 * be shared across instances is the answer to a specific query: a handful of
 * JSON-safe suggestion projections. Popular queries therefore skip the index
 * entirely on cold instances. Matching folds case (`foldSearchText`), so
 * lowercasing the key merges casings of the same query into one entry.
 */
const getCachedSearchSuggestions = unstable_cache(
  async (query: string, limit: number): Promise<SearchSuggestion[]> => {
    return (await getPublicSearchMatches(query, limit)).map(toSearchSuggestion);
  },
  ["convex-public-search-suggestions"],
  {
    revalidate: PUBLIC_CONVEX_CACHE_REVALIDATE_SECONDS,
    tags: [
      PUBLIC_CONVEX_CACHE_TAGS.all,
      PUBLIC_CONVEX_CACHE_TAGS.substances,
      PUBLIC_CONVEX_CACHE_TAGS.layouts,
      PUBLIC_CONVEX_CACHE_TAGS.effects,
      PUBLIC_CONVEX_CACHE_TAGS.reports,
      PUBLIC_CONVEX_CACHE_TAGS.contributors,
    ],
  },
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
