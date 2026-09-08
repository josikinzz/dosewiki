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
import type { PublicEffectArticle, PublicReportPreview } from "./publicData.shared";
import type { NormalizedUserProfile } from "../../src/data/userProfiles";

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
      /** Revision digest of the non-library sources. See {@link buildSearchSourceSignature}. */
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
 * FNV-1a, the same fold `getSearchIndexInputHash` uses. Non-cryptographic on
 * purpose: the digest only has to move when a row moves, never resist forgery.
 */
const SIGNATURE_OFFSET_BASIS = 2166136261;
const SIGNATURE_PRIME = 16777619;
/** Unit separator, so neighbouring field values cannot fold into one another. */
const SIGNATURE_FIELD_BREAK = 31;
/** Absent field marker, keeping `undefined` distinct from the empty string. */
const SIGNATURE_ABSENT = 30;

function foldText(hash: number, value: string | null | undefined): number {
  if (typeof value !== "string") {
    return Math.imul(hash ^ SIGNATURE_ABSENT, SIGNATURE_PRIME);
  }

  let next = hash;
  for (let index = 0; index < value.length; index += 1) {
    next = Math.imul(next ^ value.charCodeAt(index), SIGNATURE_PRIME);
  }

  return Math.imul(next ^ SIGNATURE_FIELD_BREAK, SIGNATURE_PRIME);
}

function foldNumber(hash: number, value: number): number {
  return foldText(hash, value.toString(36));
}

/**
 * Long-form bodies are folded by length alone: reading `String.length` is free,
 * folding kilobytes of markdown per row per request is not.
 */
function foldTextLength(hash: number, value: string | null | undefined): number {
  return foldNumber(hash, typeof value === "string" ? value.length : -1);
}

function foldTextList(hash: number, values: readonly string[] | undefined): number {
  let next = foldNumber(hash, values?.length ?? -1);
  for (const value of values ?? []) {
    next = foldText(next, value);
  }

  return next;
}

/** Identity `slug`. No revision column reaches the public projection. */
function foldEffectArticle(hash: number, effect: PublicEffectArticle): number {
  let next = foldText(hash, effect.slug);
  next = foldText(next, effect.name);
  next = foldText(next, effect.summary);
  next = foldTextList(next, effect.tags);
  next = foldText(next, effect.featured === true ? "1" : "0");
  next = foldTextLength(next, effect.description_raw);
  next = foldTextLength(next, effect.long_summary_raw);
  next = foldTextLength(next, effect.analysis_raw);
  next = foldTextLength(next, effect.style_variations_raw);
  next = foldTextLength(next, effect.personal_commentary_raw);

  return foldNumber(next, effect.see_also?.length ?? -1);
}

/** Identity `slug`. `introduction` is already the trimmed narrative excerpt. */
function foldReportPreview(hash: number, report: PublicReportPreview): number {
  let next = foldText(hash, report.slug);
  next = foldText(next, report.title);
  next = foldText(next, report.author);
  next = foldText(next, report.authorProfileKey);
  next = foldText(next, report.featured === true ? "1" : "0");
  next = foldTextList(next, report.substanceNames);
  next = foldNumber(next, report.substances?.length ?? -1);
  for (const substance of report.substances ?? []) {
    next = foldText(next, substance.name);
    next = foldText(next, substance.dose);
    next = foldText(next, substance.roa);
  }
  next = foldText(next, report.introduction);
  next = foldText(next, report.tripDate);
  next = foldText(next, report.age);
  next = foldText(next, report.gender);
  next = foldText(next, report.height);
  next = foldText(next, report.weight);
  next = foldText(next, report.medications);

  return foldText(next, report.setting);
}

/**
 * Identity `key`. Aliases stay out, exactly as they stay out of the index:
 * they can carry internal reviewer handles that public search must never
 * match, so they must not force a rebuild either.
 */
function foldContributorProfile(hash: number, profile: NormalizedUserProfile): number {
  let next = foldText(hash, profile.key);
  next = foldText(next, profile.displayName);
  next = foldText(next, profile.hasCustomBio === true ? "1" : "0");

  return foldText(next, profile.bio);
}

/**
 * Revision of the non-library search sources, cheap enough to compute on every
 * request. Substance changes are caught exactly by comparing the library
 * instance; effect articles, reports and profiles get this digest instead.
 *
 * None of the three public projections carries a revision or `updatedAt`
 * column, so the revision is derived: per row, identity plus every field
 * `createSearchIndexInput` actually reads, with the kilobyte-scale effect
 * bodies entering by length rather than by content. It therefore detects an
 * edit that leaves row counts unchanged, a reorder, and any add or remove (row
 * counts are folded in and prefixed). It cannot detect a long-form effect body
 * rewritten to exactly its previous length, or a report narrative edit that
 * falls past the projected excerpt: those still wait for the index TTL or the
 * editor-save invalidation path, which clears these module caches outright.
 *
 * Cost is one short fold per row, never a stringify of the corpora, so it
 * scales with row count rather than payload bytes.
 */
function buildSearchSourceSignature(
  effectDefinitions: readonly PublicEffectArticle[],
  reports: readonly PublicReportPreview[],
  profiles: readonly NormalizedUserProfile[],
): string {
  let hash = SIGNATURE_OFFSET_BASIS;

  hash = foldNumber(hash, effectDefinitions.length);
  for (const effect of effectDefinitions) {
    hash = foldEffectArticle(hash, effect);
  }

  hash = foldNumber(hash, reports.length);
  for (const report of reports) {
    hash = foldReportPreview(hash, report);
  }

  hash = foldNumber(hash, profiles.length);
  for (const profile of profiles) {
    hash = foldContributorProfile(hash, profile);
  }

  return `${effectDefinitions.length}:${reports.length}:${profiles.length}:${(hash >>> 0).toString(36)}`;
}

/**
 * The public search index, built at most once per cache window.
 *
 * Deriving the index input costs hundreds of milliseconds, since it keywordizes
 * every substance, report and effect article, so it must never sit on the
 * per-query path. Querying an already-built index costs single-digit
 * milliseconds.
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
