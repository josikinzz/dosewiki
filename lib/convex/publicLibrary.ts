import "server-only";

import { cache } from "react";
import { buildLibrary } from "../../src/data/builders/libraryBuilder";
import { parseManualConfig } from "../../src/data/builders/manualIndexLoader";
import type { LibraryData } from "../../src/data/SubstanceIndexProvider";
import { querySearchWithData } from "../../src/data/builders/search";
import { getIndexLayoutByType, getRawSubstances, type IndexLayoutType } from "./publicData";

const LIBRARY_CACHE_TTL_MS = 60 * 60 * 1000;
const SEARCH_CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_SEARCH_CACHE_ENTRIES = 200;

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

const publicSearchCache = new Map<
  string,
  {
    expiresAt: number;
    value: Awaited<ReturnType<typeof querySearchWithData>>;
  }
>();

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

export const getPublicSearchMatches = cache(async (query: string, limit = 20) => {
  const normalizedQuery = query.trim().toLowerCase();
  const cacheKey = `${normalizedQuery}::${limit}`;

  if (!normalizedQuery) {
    return [];
  }

  const cachedResult = publicSearchCache.get(cacheKey);

  if (cachedResult && cachedResult.expiresAt > Date.now()) {
    return cachedResult.value;
  }

  const results = querySearchWithData(normalizedQuery, await getPublicLibrary(), limit);

  publicSearchCache.set(cacheKey, {
    value: results,
    expiresAt: Date.now() + SEARCH_CACHE_TTL_MS,
  });

  if (publicSearchCache.size > MAX_SEARCH_CACHE_ENTRIES) {
    const oldestKey = publicSearchCache.keys().next().value;
    if (oldestKey) {
      publicSearchCache.delete(oldestKey);
    }
  }

  return results;
});

export const getPublicCategoryDetail = cache(async (categoryKey: string) => {
  return (await getPublicLibrary()).getCategoryDetail(categoryKey);
});

export const getPublicChemicalClassDetail = cache(async (slug: string) => {
  return (await getPublicLibrary()).getChemicalClassDetail(slug);
});

export const getPublicPsychoactiveClassDetail = cache(async (slug: string) => {
  return (await getPublicLibrary()).getPsychoactiveClassDetail(slug);
});

export const getPublicEffectDetail = cache(async (effectSlug: string) => {
  return (await getPublicLibrary()).getEffectDetail(effectSlug);
});

export const getPublicMechanismDetail = cache(async (mechanismSlug: string) => {
  return (await getPublicLibrary()).getMechanismDetail(mechanismSlug);
});
