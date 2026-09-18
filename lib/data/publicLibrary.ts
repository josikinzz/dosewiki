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
  getPublicEffectBySlug,
  getPublicReportBySlug,
  getRawSubstances,
  type IndexLayoutType,
} from "./publicData";
import type { PublicEffectArticle, PublicReportPreview } from "./publicData.shared";
import type { NormalizedUserProfile } from "../../src/data/userProfiles";
import { stripCitationTokens } from "../../src/lib/citations/citationTokens";
import { getLocalizedLeaves } from "../translation/localizedRecords";
import {
  getPublicEffectSummariesBySlugs,
  getPublicReportSearchSummaries,
  getPublicSubstanceSearchSummaries,
} from "./publicData";
import type { PublicationSource, PublicationTarget } from "../next/publicationWire";
import { getPublicDerivedCacheIdentity } from "./publicData.cache";
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
 * Revision of the non-library search sources. Substance changes are caught by
 * the library instance; these projections need a content-derived identity.
 */
function buildSearchSourceSignature(
  effectDefinitions: readonly PublicEffectArticle[],
  reports: readonly PublicReportPreview[],
  profiles: readonly NormalizedUserProfile[],
): string {
  let hash = foldNumber(SIGNATURE_OFFSET_BASIS, effectDefinitions.length);
  for (const effect of effectDefinitions) hash = foldEffectArticle(hash, effect);
  hash = foldNumber(hash, reports.length);
  for (const report of reports) hash = foldReportPreview(hash, report);
  hash = foldNumber(hash, profiles.length);
  for (const profile of profiles) hash = foldContributorProfile(hash, profile);
  return (hash >>> 0).toString(36);
}

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
      // Substance names and aliases are canonical Latin-script identity, not
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
      ? localizedLeaves.get(substancesBySlug.get(entry.slug)!) ?? substancesBySlug.get(entry.slug)!
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
  async (query: string, limit = 20, locale = "en"): Promise<SearchSuggestion[]> => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) {
      return [];
    }
    const suggestions = await getCachedSearchSuggestions(trimmed, limit);
    if (locale === "en") return suggestions;

    const [effectSummaries, previews, reportSummaries] = await Promise.all([
      getPublicEffectSummariesBySlugs(suggestions.filter(({ type }) => type === "effect").map(({ slug }) => slug)),
      getPublicSubstanceSearchSummaries(),
      getPublicReportSearchSummaries(),
    ]);
    const effectsBySlug = new Map(effectSummaries.map((effect) => [effect.slug, effect]));
    const reportsBySlug = new Map(reportSummaries.map((report) => [report.slug, report]));
    const substancesBySlug = new Map(previews.map((preview) => [preview.slug, preview]));
    const leaves = suggestions.flatMap((suggestion) => {
      if (suggestion.type === "substance") {
        const summary = substancesBySlug.get(suggestion.slug)?.summary;
        return summary ? [summary] : [];
      }
      if (suggestion.type === "effect") {
        const effect = effectsBySlug.get(suggestion.slug);
        return effect ? [effect.name, effect.summary].filter((value): value is string => Boolean(value)) : [];
      }
      if (suggestion.type === "report") {
        const report = reportsBySlug.get(suggestion.slug);
        return report?.introduction ? [report.introduction] : [];
      }
      return [suggestion.label, suggestion.secondary, suggestion.description]
        .filter((value): value is string => Boolean(value));
    });
    const localized = await getLocalizedLeaves(leaves, locale);
    return suggestions.map((suggestion) => {
      if (suggestion.type === "substance") {
        const source = substancesBySlug.get(suggestion.slug)?.summary;
        return {
          ...suggestion,
          secondary: source
            ? stripCitationTokens(localized.get(source) ?? source).trim() || suggestion.secondary
            : suggestion.secondary,
        };
      }
      if (suggestion.type === "effect") {
        const effect = effectsBySlug.get(suggestion.slug);
        return effect ? {
          ...suggestion,
          label: localized.get(effect.name) ?? effect.name,
          secondary: effect.summary
            ? (localized.get(effect.summary) ?? effect.summary)
            : suggestion.secondary,
        } : suggestion;
      }
      if (suggestion.type === "report") {
        const report = reportsBySlug.get(suggestion.slug);
        return report ? {
          ...suggestion,
          label: localized.get(report.title) ?? report.title,
          description: report.introduction
            ? (localized.get(report.introduction) ?? report.introduction).trim() || suggestion.description
            : suggestion.description,
        } : suggestion;
      }
      return {
        ...suggestion,
        label: localized.get(suggestion.label) ?? suggestion.label,
        secondary: suggestion.secondary
          ? (localized.get(suggestion.secondary) ?? suggestion.secondary)
          : suggestion.secondary,
        description: suggestion.description
          ? (localized.get(suggestion.description) ?? suggestion.description)
          : suggestion.description,
      };
    });
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

