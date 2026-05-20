import "server-only";

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
  getSearchIndexInputHash,
  type SearchIndex,
} from "../../src/data/builders/search";
import { getIndexLayoutByType, getRawSubstances, type IndexLayoutType } from "./publicData";

const LIBRARY_CACHE_TTL_MS = 60 * 60 * 1000;
const SEARCH_INDEX_CACHE_TTL_MS = 10 * 60 * 1000;

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
      inputHash: string;
      value: SearchIndex;
    }
  | null = null;

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
  if (!query.trim()) {
    return [];
  }

  const library = await getPublicLibrary();
  const input = createSearchIndexInput(library);
  const inputHash = getSearchIndexInputHash(input);
  const cachedIndex = publicSearchIndexCache;

  if (
    cachedIndex &&
    cachedIndex.expiresAt > Date.now() &&
    cachedIndex.inputHash === inputHash
  ) {
    return cachedIndex.value.query(query, { limit });
  }

  const searchIndex = buildSearchIndex(input);
  publicSearchIndexCache = {
    value: searchIndex,
    inputHash,
    expiresAt: Date.now() + SEARCH_INDEX_CACHE_TTL_MS,
  };

  return searchIndex.query(query, { limit });
});

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
