import "server-only";

import { cache } from "react";
import { getPublicServerReadTarget } from "./runtimeTargets";
import { buildLibrary } from "../../src/data/builders/libraryBuilder";
import { parseManualConfig, type NormalizedManualIndexConfig } from "../../src/data/builders/manualIndexLoader";
import type { LibraryData } from "../../src/data/SubstanceIndexProvider";
import type {
  CategoryDetail,
  EffectDetail,
  MechanismDetail,
} from "../../src/data/builders/library";
import {
  buildSearchIndex,
  createSearchIndexInput,
  localizeSearchIndex,
  toSearchSuggestion,
  type LocalizedSearchEntry,
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
  getPublicEffectMembershipInput,
  getPublicReports,
  getRawSubstances,
  type IndexLayoutType,
} from "./publicData";
import { stripCitationTokens } from "../../src/lib/citations/citationTokens";
import { getLocalizedLeaves } from "../translation/localizedRecords";
import {
  getPublicEffectSummariesBySlugs,
  getPublicReportSearchSummaries,
  getPublicSubstanceSearchSummaries,
} from "./publicData";
import type { PublicationSource, PublicationTarget } from "../next/publicationWire";
import { getPublicDerivedCacheIdentity } from "./publicData.cache";
import { buildSearchSourceSignature } from "./publicSearchSignature";
import { projectArticleNormalization } from "../../src/data/builders/articleNormalization";
import { projectManualIndexes } from "../../src/data/builders/manualIndexProjection";
import { buildCategorySystem } from "../../src/data/builders/libraryBuilderCategories";
import { buildEffectData, buildMechanismData } from "../../src/data/builders/libraryBuilderTaxonomy";
import { createEffectDetailResolvers, createMechanismDetailResolvers } from "../../src/data/builders/libraryBuilderDetails";
import { createManualLayoutTaxonomy, normalizeTaxonomyKey } from "../../src/data/builders/taxonomy";
import { buildSubstanceRecord, type SubstanceRecord } from "../../src/data/builders/contentBuilder";

const LIBRARY_CACHE_TTL_MS = 60 * 60 * 1000;
const SEARCH_INDEX_CACHE_TTL_MS = 10 * 60 * 1000;

export type PublicDerivedDataCacheInvalidation = {
  source: PublicationSource;
  targets?: readonly PublicationTarget[];
  /** An unnameable path is deliberately treated as a full dependency change. */
  conservative?: boolean;
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
      identity: string;
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
      identity: string;
      sourceSignature: string;
      value: SearchIndex;
    }
  | null = null;

let libraryGeneration = 0;
let searchGeneration = 0;
const publicLibraryInFlight = new Map<string, Promise<LibraryData>>();
const publicSearchInFlight = new Map<string, Promise<SearchIndex>>();

type EffectMembership = {
  effectMap: Map<string, { name: string; records: Set<SubstanceRecord> }>;
  effectSlugAliasMap: Map<string, string>;
  psychoactive: NormalizedManualIndexConfig;
};
let effectMembershipCache: { identity: string; expiresAt: number; value: EffectMembership } | null = null;
const effectMembershipInFlight = new Map<string, Promise<EffectMembership>>();

export function invalidatePublicDerivedDataCache(
  invalidation: PublicDerivedDataCacheInvalidation = { source: "manual" },
) {
  const targets = invalidation.targets ?? [];
  const conservative = invalidation.conservative === true || invalidation.targets === undefined;
  const invalidatesLibrary = conservative || targets.some((target) =>
    target.kind === "substance-lists" ||
    target.kind === "chemical-lists" ||
    target.kind === "mechanism-lists" ||
    target.kind === "chemical-class-lists" ||
    (target.kind === "article" && target.dependency !== "detail"));
  const invalidatesSearch = invalidatesLibrary || targets.some((target) =>
    target.kind === "effect" ||
    target.kind === "effect-lists" ||
    target.kind === "report" ||
    target.kind === "report-lists" ||
    target.kind === "contributor" ||
    target.kind === "contributor-lists");

  if (invalidatesLibrary) {
    libraryGeneration += 1;
    publicLibraryCache = null;
    effectMembershipCache = null;
  }
  if (invalidatesSearch) {
    searchGeneration += 1;
    publicSearchIndexCache = null;
  }
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
  const durableIdentity = await getPublicDerivedCacheIdentity("library");
  if (
    publicLibraryCache &&
    publicLibraryCache.readTarget === readTarget &&
    publicLibraryCache.identity === durableIdentity &&
    publicLibraryCache.expiresAt > Date.now()
  ) {
    return publicLibraryCache.value;
  }

  const generation = libraryGeneration;
  const identity = `${readTarget ?? ""}\u0000${durableIdentity}\u0000${generation}`;
  const existing = publicLibraryInFlight.get(identity);
  if (existing) return existing;

  const pending = buildPublicLibrary().then((value) => {
    if (libraryGeneration === generation) {
      publicLibraryCache = {
        value,
        readTarget,
        identity: durableIdentity,
        expiresAt: Date.now() + LIBRARY_CACHE_TTL_MS,
      };
    }
    return value;
  });
  publicLibraryInFlight.set(identity, pending);
  void pending.finally(() => {
    if (publicLibraryInFlight.get(identity) === pending) publicLibraryInFlight.delete(identity);
  }).catch(() => undefined);
  return pending;
});

/**
 * The public search index, built at most once per target-aware cache identity.
 */
export const getPublicSearchIndex = cache(async (): Promise<SearchIndex> => {
  const readTarget = getPublicServerReadTarget().selectedUrl;
  const durableIdentity = await getPublicDerivedCacheIdentity("search");
  const generation = searchGeneration;
  const identity = `${readTarget ?? ""}\u0000${durableIdentity}\u0000${generation}`;
  const existing = publicSearchInFlight.get(identity);
  if (existing) return existing;

  const pending = (async () => {
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
      cachedIndex.identity === durableIdentity &&
      cachedIndex.expiresAt > Date.now() &&
      cachedIndex.library === library &&
      cachedIndex.sourceSignature === sourceSignature
    ) {
      return cachedIndex.value;
    }

    const searchIndex = buildSearchIndex(
      createSearchIndexInput(library, { effectDefinitions, reports, profiles }),
    );
    if (searchGeneration === generation) {
      publicSearchIndexCache = {
        identity: durableIdentity,
        value: searchIndex,
        library,
        sourceSignature,
        expiresAt: Date.now() + SEARCH_INDEX_CACHE_TTL_MS,
      };
    }
    return searchIndex;
  })();
  publicSearchInFlight.set(identity, pending);
  void pending.finally(() => {
    if (publicSearchInFlight.get(identity) === pending) publicSearchInFlight.delete(identity);
  }).catch(() => undefined);
  return pending;
});
/**
 * Request-only locale projection of the shared canonical index. The stored
 * flat translations change display fields only; `localizeSearchIndex` retains
 * canonical labels and aliases as searchable identity.
 */
const getPublicLocalizedSearchIndex = cache(async (locale: string): Promise<SearchIndex> => {
  const canonicalIndex = await getPublicSearchIndex();
  if (locale === "en") return canonicalIndex;
  const entries = canonicalIndex.entries;
  const previews = await getPublicSubstanceSearchSummaries();
  const substanceSummaries = new Map(previews.map((preview) => [preview.slug, preview.summary]));
  const [effectSummaries, reportSummaries] = await Promise.all([
    getPublicEffectSummariesBySlugs(entries.filter(({ type }) => type === "effect").map(({ slug }) => slug)),
    getPublicReportSearchSummaries(),
  ]);
  const effectSummariesBySlug = new Map(effectSummaries.map((effect) => [effect.slug, effect.summary]));
  const reportSummariesBySlug = new Map(reportSummaries.map((report) => [report.slug, report]));
  const substancesBySlug = substanceSummaries;
  const localizedLeaves = await getLocalizedLeaves(
    entries.flatMap(({ type, slug, label, aliases, secondary, description }) => {
      const sourceSummary = type === "substance"
        ? substancesBySlug.get(slug)
        : type === "effect"
          ? effectSummariesBySlug.get(slug)
          : reportSummariesBySlug.get(slug)?.introduction;
      const displayLeaves = [sourceSummary ?? secondary, description];
      // Substance names and aliases are canonical editorial identity, not
      // translatable display copy. Other result kinds retain their existing
      // localized labels and aliases.
      if (type !== "substance") displayLeaves.push(label, ...(aliases ?? []));
      return displayLeaves.filter((value): value is string => Boolean(value));
    }),
    locale,
  );
  const localizedEntries: LocalizedSearchEntry[] = entries.map((entry) => ({
    id: entry.id,
    label: entry.type === "substance"
      ? entry.label
      : (localizedLeaves.get(entry.label) ?? entry.label),
    aliases: entry.type === "substance"
      ? entry.aliases
      : entry.aliases?.map((alias) => localizedLeaves.get(alias) ?? alias),
    secondary: entry.type === "substance" && substancesBySlug.get(entry.slug)
      ? stripCitationTokens(
        localizedLeaves.get(substancesBySlug.get(entry.slug)!) ??
        substancesBySlug.get(entry.slug)!,
      ).trim()
      : entry.secondary
        ? (localizedLeaves.get(entry.secondary) ?? entry.secondary)
        : undefined,
    description: entry.description
      ? (localizedLeaves.get(entry.description) ?? entry.description)
      : undefined,
  }));

  return localizeSearchIndex(canonicalIndex, locale, localizedEntries);
});

export const getPublicSearchManifest = cache(
  async (locale = "en"): Promise<SearchManifest> =>
    createSearchManifest(await getPublicLocalizedSearchIndex(locale), locale),
);

export const getPublicSearchMatches = cache(async (query: string, limit = 20, locale = "en") => {
  if (!query.trim()) {
    return [];
  }

  return (await getPublicLocalizedSearchIndex(locale)).query(query, { limit });
});

// Keep search composition outside persistent leaves, including on cold instances.
const getCachedSearchSuggestions = cache(
  async (query: string, limit: number, locale: string): Promise<SearchSuggestion[]> =>
    (await getPublicSearchMatches(query, limit, locale)).map(toSearchSuggestion),
);

export const getPublicSearchSuggestions = cache(
  async (query: string, limit = 20, locale = "en"): Promise<SearchSuggestion[]> => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) {
      return [];
    }
    return getCachedSearchSuggestions(trimmed, limit, locale);
  },
);

const getPublicTaxonomySource = cache(async () => {
  const [articles, psychoactive] = await Promise.all([
    getRawSubstances(),
    getNormalizedLayout("psychoactive"),
  ]);
  return { ...projectArticleNormalization(articles), psychoactive };
});

function buildDetailContext(
  records: Iterable<SubstanceRecord>,
  psychoactive: NormalizedManualIndexConfig,
) {
  return {
    ...buildCategorySystem(new Map(Array.from(records, (record) => [record.slug, record])), psychoactive),
    psychoactiveIndexManualConfig: psychoactive,
  };
}

export const getPublicCategoryDetail = cache(async (categoryKey: string): Promise<CategoryDetail | null> => {
  const { psychoactive, substanceBySlug } = await getPublicTaxonomySource();
  const identifier = createManualLayoutTaxonomy(psychoactive).identifiers
    .find((entry) => entry.aliases.includes(normalizeTaxonomyKey(categoryKey)));
  if (!identifier) return null;
  const categories = psychoactive.categories.filter((category) => category.normalizedKey === identifier.key);
  const selectedLayout = { ...psychoactive, categories };
  const emptyLayout: NormalizedManualIndexConfig = {
    version: psychoactive.version,
    categories: [],
    categoryMap: new Map(),
  };
  return projectManualIndexes({
    substanceBySlug,
    configs: { psychoactive: selectedLayout, chemical: emptyLayout, mechanism: emptyLayout },
    autoChemicalClassIndexGroups: [],
    autoMechanismIndexGroups: [],
  }).getCategoryDetail(categoryKey);
});

const getPublicEffectMembership = cache(async (): Promise<EffectMembership> => {
  const readTarget = getPublicServerReadTarget().selectedUrl;
  const revision = await getPublicDerivedCacheIdentity("library");
  const generation = libraryGeneration;
  const identity = `${readTarget ?? ""}\u0000${revision}\u0000${generation}`;
  if (effectMembershipCache?.identity === identity && effectMembershipCache.expiresAt > Date.now()) {
    return effectMembershipCache.value;
  }
  const existing = effectMembershipInFlight.get(identity);
  if (existing) return existing;
  const pending = Promise.all([getPublicEffectMembershipInput(), getNormalizedLayout("psychoactive")])
    .then(([articles, psychoactive]) => {
      const records: SubstanceRecord[] = [];
      for (const article of articles) {
        const record = buildSubstanceRecord(article);
        if (record) records.push(record);
      }
      const { effectMap, effectSlugAliasMap } = buildEffectData(records);
      const value = { effectMap, effectSlugAliasMap, psychoactive };
      if (libraryGeneration === generation) {
        effectMembershipCache = { identity, value, expiresAt: Date.now() + LIBRARY_CACHE_TTL_MS };
      }
      return value;
    });
  effectMembershipInFlight.set(identity, pending);
  void pending.finally(() => {
    if (effectMembershipInFlight.get(identity) === pending) effectMembershipInFlight.delete(identity);
  }).catch(() => undefined);
  return pending;
});

export const getPublicEffectDetail = cache(async (effectSlug: string): Promise<EffectDetail | null> => {
  const { effectMap, effectSlugAliasMap, psychoactive } = await getPublicEffectMembership();
  const normalized = normalizeTaxonomyKey(effectSlug);
  const entry = effectMap.get(effectSlugAliasMap.get(normalized) ?? normalized);
  if (!entry) return null;
  return createEffectDetailResolvers(
    effectMap, effectSlugAliasMap, buildDetailContext(entry.records, psychoactive),
  ).getEffectDetail(effectSlug);
});

const getPublicMechanismMembership = cache(async () =>
  buildMechanismData((await getPublicTaxonomySource()).substanceRecords));

export const getPublicMechanismDetail = cache(async (
  mechanismSlug: string,
  qualifierKey?: string,
): Promise<MechanismDetail | null> => {
  const [{ mechanismMap }, { psychoactive }] = await Promise.all([
    getPublicMechanismMembership(),
    getPublicTaxonomySource(),
  ]);
  const entry = mechanismMap.get(normalizeTaxonomyKey(mechanismSlug));
  if (!entry) return null;
  const records = qualifierKey === undefined ? entry.records : entry.qualifierMap.get(qualifierKey)?.records;
  if (!records) return null;
  return createMechanismDetailResolvers(
    mechanismMap, buildDetailContext(records, psychoactive),
  ).getMechanismDetail(mechanismSlug, qualifierKey);
});
