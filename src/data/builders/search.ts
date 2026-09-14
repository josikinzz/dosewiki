import type { IconName } from "@/components/common/Icon";
import { icons } from "@/utils/iconNames";
import type { LibraryData } from "../SubstanceIndexProvider";
import type { SubstanceRecord } from "./contentBuilder";
import {
  buildCompactMatchFields,
  foldSearchText,
  normalizeSearchKey,
  runSearch,
  KEYWORD_SEPARATOR,
  type MatchableEntry,
  type SearchEntryType,
} from "./searchMatching";

export type { SearchEntryType };

interface SearchEntryMeta { label: string;
value: string; }

export interface SearchEntry {
  id: string;
  type: SearchEntryType;
  label: string;
  secondary?: string;
  description?: string;
  aliases?: readonly string[];
  slug: string;
  icon?: IconName;
  count?: number;
  keywords: readonly string[];
  meta?: readonly SearchEntryMeta[];
}

export interface SearchMatch extends SearchEntry {
  score: number;
}

/**
 * The part of a match that search result UIs actually render.
 *
 * `keywords` exists so the index can match on classes, mechanisms and article
 * prose; for effect entries it can run past a thousand entries. Shipping it to
 * the browser made a 60-result response ~700 KB instead of ~24 KB, so responses
 * are projected down to this shape at the API boundary.
 */
export type SearchSuggestion = Pick<
  SearchEntry,
  "id" | "type" | "label" | "secondary" | "description" | "aliases" | "slug" | "icon"
>;

export const toSearchSuggestion = (match: SearchEntry): SearchSuggestion => ({
  id: match.id,
  type: match.type,
  label: match.label,
  secondary: match.secondary,
  description: match.description,
  aliases: match.aliases,
  slug: match.slug,
  icon: match.icon,
});

interface SearchIndexEntryCounts { substance: number;
category: number;
effect: number;
report: number;
profile: number;
total: number; }

interface SearchIndexMetadata { inputHash: string;
entryCounts: SearchIndexEntryCounts; }

interface SearchQueryOptions { limit?: number; }

/** A search entry plus the precomputed fields the matcher reads. */
type IndexedSearchEntry = Readonly<SearchEntry & MatchableEntry>

export interface SearchIndex {
  metadata: SearchIndexMetadata;
  entries: readonly SearchEntry[];
  /**
   * Ranked entries with their precomputed match fields. Exposed so the browser
   * manifest can be derived from exactly what the server ranks.
   */
  indexedEntries: readonly IndexedSearchEntry[];
  query: (query: string, options?: SearchQueryOptions) => SearchMatch[];
}

export interface LocalizedSearchEntry {
  /** Canonical search identity, for example `effect:drifting`. */
  id: string;
  label?: string;
  aliases?: readonly string[];
  secondary?: string;
  description?: string;
}

interface SearchIndexSubstanceInput {
  name: string;
  slug: string;
  aliases: string[];
  categories: string[];
  heroLabels: string[];
  chemicalClasses: string[];
  psychoactiveClasses: string[];
  subtitle?: string;
  mechanismLabels: string[];
  mechanismKeywords: string[];
}

interface SearchIndexCategoryInput {
  key: string;
  name: string;
  total: number;
  icon?: IconName;
  aliases: string[];
}

interface SearchIndexEffectInput {
  name: string;
  slug: string;
  total: number;
  summary?: string;
  relatedSubstanceKeywords: string[];
}

interface SearchIndexEffectDefinitionInput {
  slug: string;
  summary: string;
  tags?: readonly string[];
  description_raw?: string;
  long_summary_raw?: string;
  analysis_raw?: string;
  style_variations_raw?: string;
  personal_commentary_raw?: string;
  see_also?: ReadonlyArray<{ location: string; title: string }>;
}

export interface SearchIndexReportInput {
  title: string;
  slug: string;
  author: string;
  substanceNames: string[];
  substances?: Array<{
    name: string;
    dose?: string;
    roa?: string;
  }>;
  introduction: string;
  tripDate?: string;
  age?: string;
  gender?: string;
  height?: string;
  weight?: string;
  medications?: string;
  setting?: string;
  featured: boolean;
  authorProfileKey?: string;
}

/**
 * Contributor profiles are matched on public identity only. Aliases are
 * intentionally absent: they can carry internal reviewer handles that must
 * never surface through public search (manifest or server suggestions).
 */
export interface SearchIndexProfileInput {
  key: string;
  displayName: string;
  bio: string;
  hasCustomBio: boolean;
}

export interface SearchIndexInput {
  substances: SearchIndexSubstanceInput[];
  categories: SearchIndexCategoryInput[];
  effects: SearchIndexEffectInput[];
  reports: SearchIndexReportInput[];
  profiles: SearchIndexProfileInput[];
}


const keywordize = (value: string | undefined | null): string[] => {
  if (!value) {
    return [];
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return [];
  }
  const lower = foldSearchText(trimmed);
  const tokens = new Set<string>([lower]);
  const textForm = lower.replace(/[^a-z0-9]+/g, " ");
  textForm
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0)
    .forEach((token) => tokens.add(token));
  return Array.from(tokens);
};

const mergeKeywords = (...lists: Array<readonly string[]>): string[] => {
  const merged = new Set<string>();
  lists.forEach((list) => {
    list.forEach((entry) => {
      const normalized = entry.trim();
      if (normalized.length > 0) {
        merged.add(normalized);
      }
    });
  });
  return Array.from(merged);
};

const joinWithSeparator = (values: string[]): string =>
  values
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
    .join(" · ");

const trimSearchExcerpt = (value: string | null | undefined, maxLength = 170): string => {
  const normalized = (value ?? "").replace(/\s+/g, " ").trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength).trimEnd()}…`;
};

const formatReportSubstance = (substance: NonNullable<SearchIndexReportInput["substances"]>[number]) => {
  const doseParts = [substance.dose, substance.roa].filter(
    (value): value is string => typeof value === "string" && value.trim().length > 0,
  );

  if (doseParts.length === 0) {
    return substance.name;
  }

  return `${substance.name} (${doseParts.join(", ")})`;
};

const normalizeComparableText = (value: string | undefined): string =>
  (value ?? "").replace(/\s+/g, " ").trim().toLowerCase();

const uniqueDisplayParts = (values: string[]): string[] => {
  const seen = new Set<string>();
  const unique: string[] = [];

  values.forEach((value) => {
    const normalized = normalizeComparableText(value);
    if (!normalized || seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    unique.push(value);
  });

  return unique;
};

const formatReportAge = (age: string | undefined): string => {
  const normalized = age?.trim();

  if (!normalized || !/\d/.test(normalized)) {
    return "";
  }

  return `age ${normalized}`;
};

const buildReportMetadataPreview = (report: SearchIndexReportInput): string => {
  const substanceParts =
    report.substances && report.substances.length > 0
      ? report.substances.map(formatReportSubstance)
      : report.substanceNames;
  const demographicParts = [
    formatReportAge(report.age),
    report.weight ? report.weight : "",
    report.height ? report.height : "",
    report.gender ? report.gender : "",
    report.setting ? report.setting : "",
    report.medications ? `meds: ${report.medications}` : "",
    report.tripDate ? report.tripDate : "",
  ];

  return joinWithSeparator(uniqueDisplayParts([...substanceParts, ...demographicParts]));
};

const collectEffectRelatedSubstanceKeywords = (
  library: LibraryData,
  effectSlug: string,
): string[] => {
  const detail = library.getEffectDetail(effectSlug);
  if (!detail) {
    return [];
  }

  const values = detail.groups.flatMap((group) => [
    ...group.drugs.flatMap((drug) => [drug.name, drug.slug, drug.alias]),
    ...(group.sections ?? []).flatMap((section) =>
      section.drugs.flatMap((drug) => [drug.name, drug.slug, drug.alias]),
    ),
  ]);

  return mergeKeywords(...values.map((value) => keywordize(value)));
};

const collectEffectDefinitionKeywords = (
  definition: SearchIndexEffectDefinitionInput | undefined,
): string[] => {
  if (!definition) {
    return [];
  }

  const values = [
    definition.summary,
    definition.description_raw,
    definition.long_summary_raw,
    definition.analysis_raw,
    definition.style_variations_raw,
    definition.personal_commentary_raw,
    ...(definition.tags ?? []),
    ...(definition.see_also ?? []).flatMap((entry) => [entry.title, entry.location]),
  ];

  return mergeKeywords(...values.map((value) => keywordize(value)));
};

const collectEffectTaggedSubstanceKeywords = (
  library: LibraryData,
  definition: SearchIndexEffectDefinitionInput | undefined,
): string[] => {
  const tagKeys = new Set((definition?.tags ?? []).map(normalizeSearchKey).filter(Boolean));
  if (tagKeys.size === 0) {
    return [];
  }

  const values = library.substanceRecords.flatMap((substance) => {
    const substanceKeys = [
      ...substance.categories,
      ...substance.chemicalClasses,
      ...substance.psychoactiveClasses,
    ].map(normalizeSearchKey);
    const isRelated = substanceKeys.some((key) => tagKeys.has(key));

    return isRelated
      ? [substance.name, substance.slug, ...substance.aliases]
      : [];
  });

  return mergeKeywords(...values.map((value) => keywordize(value)));
};

type SubstanceRecordEntry = SubstanceRecord;

interface MechanismInfo {
  labels: string[];
  keywordSources: string[][];
}

const extractMechanismInfo = (record: SubstanceRecordEntry): MechanismInfo => {
  const labels = Array.from(new Set(record.mechanisms.map((mechanism) => mechanism.label)));
  const keywordSources: string[][] = [];

  record.mechanisms.forEach((mechanism) => {
    keywordSources.push(keywordize(mechanism.label));
    keywordSources.push(keywordize(mechanism.base));
    if (mechanism.qualifier) {
      keywordSources.push(keywordize(mechanism.qualifier));
    }
  });

  return {
    labels,
    keywordSources,
  };
};

type IndexedEntry = IndexedSearchEntry;

type SearchEntryWithInternals = SearchEntry & {
  reportSubstanceKeys?: readonly string[];
  reportSubstanceAliasFolded?: readonly string[];
};

const readonlySearchEntry = (entry: SearchEntry): SearchEntry =>
  Object.freeze({
    ...entry,
    keywords: Object.freeze([...entry.keywords]),
    aliases: entry.aliases ? Object.freeze([...entry.aliases]) : undefined,
    description: entry.description,
    meta: entry.meta
      ? Object.freeze(entry.meta.map((meta) => Object.freeze({ ...meta })))
      : undefined,
  });

const toPublicEntry = (entry: IndexedEntry): SearchEntry => {
  const {
    labelFolded: _labelFolded,
    aliasFolded: _aliasFolded,
    labelCompact: _labelCompact,
    aliasCompact: _aliasCompact,
    identityCompactBlob: _identityCompactBlob,
    reportSubstanceKeys: _reportSubstanceKeys,
    reportSubstanceAliasFolded: _reportSubstanceAliasFolded,
    identityBlob: _identityBlob,
    keywordBlob: _keywordBlob,
    ...rest
  } = entry;
  return rest;
};

const getSubstanceLookupKeys = (
  substance: Pick<SearchIndexSubstanceInput, "name" | "slug" | "aliases">,
): string[] =>
  [substance.name, substance.slug, ...substance.aliases]
    .map(normalizeSearchKey)
    .filter(Boolean);

const stableStringify = (value: unknown): string => {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
};

const hashString = (value: string): string => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
};

export const getSearchIndexInputHash = (input: SearchIndexInput): string =>
  hashString(stableStringify(input));

export function createSearchIndexInput(
  library: LibraryData,
  extras: {
    effectDefinitions?: SearchIndexEffectDefinitionInput[];
    reports?: SearchIndexReportInput[];
    profiles?: SearchIndexProfileInput[];
  } = {},
): SearchIndexInput {
  const effectSummaryBySlug = new Map(
    extras.effectDefinitions?.map((effect) => [effect.slug, effect.summary.trim()]) ?? [],
  );
  const effectDefinitionBySlug = new Map(
    extras.effectDefinitions?.map((effect) => [effect.slug, effect]) ?? [],
  );

  return {
    substances: library.substanceRecords.map((record) => {
      const categories = record.content.categories ?? [];
      const heroBadges = record.content.heroBadges ?? [];
      const heroLabels = heroBadges
        .map((badge) => badge.label)
        .filter((label): label is string => Boolean(label));
      const mechanismInfo = extractMechanismInfo(record);

      return {
        name: record.name,
        slug: record.slug,
        aliases: [...record.aliases],
        categories: [...categories],
        heroLabels,
        chemicalClasses: [...record.chemicalClasses],
        psychoactiveClasses: [...record.psychoactiveClasses],
        subtitle: record.content.subtitle?.trim() || undefined,
        mechanismLabels: mechanismInfo.labels,
        mechanismKeywords: mechanismInfo.keywordSources.flat(),
      };
    }),
    categories: library.dosageCategoryGroups.map((group) => {
      const definition = library.findCategoryByKey(group.key);

      return {
        key: group.key,
        name: definition?.name ?? group.name,
        total: group.total,
        icon: definition?.icon,
        aliases: definition?.aliases ? [...definition.aliases] : [],
      };
    }),
    effects: library.effectSummaries.map((effect) => ({
      name: effect.name,
      slug: effect.slug,
      total: effect.total,
      summary: effectSummaryBySlug.get(effect.slug),
      relatedSubstanceKeywords: mergeKeywords(
        collectEffectRelatedSubstanceKeywords(library, effect.slug),
        collectEffectDefinitionKeywords(effectDefinitionBySlug.get(effect.slug)),
        collectEffectTaggedSubstanceKeywords(library, effectDefinitionBySlug.get(effect.slug)),
      ),
    })),
    reports: extras.reports?.map((report) => ({
      title: report.title,
      slug: report.slug,
      author: report.author,
      substanceNames: [...report.substanceNames],
      substances: report.substances?.map((substance) => ({ ...substance })),
      introduction: report.introduction,
      tripDate: report.tripDate,
      age: report.age,
      gender: report.gender,
      height: report.height,
      weight: report.weight,
      medications: report.medications,
      setting: report.setting,
      featured: report.featured,
      authorProfileKey: report.authorProfileKey,
    })) ?? [],
    profiles: extras.profiles?.map((profile) => ({
      key: profile.key,
      displayName: profile.displayName,
      bio: profile.bio,
      hasCustomBio: profile.hasCustomBio,
    })) ?? [],
  };
}

export function buildSearchIndex(input: SearchIndexInput): SearchIndex {
  const substanceByLookupKey = new Map<string, SearchIndexSubstanceInput>();
  input.substances.forEach((substance) => {
    getSubstanceLookupKeys(substance).forEach((key) => {
      if (!substanceByLookupKey.has(key)) {
        substanceByLookupKey.set(key, substance);
      }
    });
  });

  const substanceEntries: SearchEntryWithInternals[] = input.substances.map((substance) => {
    const meta: SearchEntryMeta[] = [];

    const chemicalLabel = joinWithSeparator(substance.chemicalClasses);
    if (chemicalLabel) {
      meta.push({
        label: substance.chemicalClasses.length === 1 ? "Chemical class" : "Chemical classes",
        value: chemicalLabel,
      });
    }

    const psychoactiveLabel = joinWithSeparator(substance.psychoactiveClasses);
    if (psychoactiveLabel) {
      meta.push({
        label:
          substance.psychoactiveClasses.length === 1
            ? "Psychoactive class"
            : "Psychoactive classes",
        value: psychoactiveLabel,
      });
    }

    const mechanismLabel = joinWithSeparator(substance.mechanismLabels);
    if (mechanismLabel) {
      meta.push({
        label: substance.mechanismLabels.length === 1 ? "Mechanism" : "Mechanisms",
        value: mechanismLabel,
      });
    }

    const keywordSources = [
      keywordize(substance.name),
      keywordize(substance.slug),
      ...substance.aliases.map((entry) => keywordize(entry)),
      ...substance.chemicalClasses.map((entry) => keywordize(entry)),
      ...substance.psychoactiveClasses.map((entry) => keywordize(entry)),
      ...substance.categories.map((entry) => keywordize(entry)),
      ...substance.heroLabels.map((entry) => keywordize(entry)),
      keywordize(substance.mechanismKeywords.join(" ")),
    ];

    return {
      id: `substance:${substance.slug}`,
      type: "substance" as const,
      label: substance.name,
      secondary: substance.subtitle,
      aliases: Object.freeze([...substance.aliases]),
      slug: substance.slug,
      keywords: mergeKeywords(...keywordSources),
      meta: meta.length > 0 ? meta : undefined,
    };
  });

  const categoryEntries: SearchEntryWithInternals[] = input.categories.map((category) => {
    const keywordSources = [
      keywordize(category.name),
      keywordize(category.key),
      ...category.aliases.map((alias) => keywordize(alias)),
    ];

    return {
      id: `category:${category.key}`,
      type: "category" as const,
      label: category.name,
      secondary: `${category.total} substance${category.total === 1 ? "" : "s"}`,
      slug: category.key,
      icon: category.icon,
      count: category.total,
      keywords: mergeKeywords(...keywordSources),
    };
  });

  const effectEntries: SearchEntryWithInternals[] = input.effects.map((effect) => {
    const keywordSources = [
      keywordize(effect.name),
      keywordize(effect.slug),
      effect.relatedSubstanceKeywords,
    ];

    return {
      id: `effect:${effect.slug}`,
      type: "effect" as const,
      label: effect.name,
      secondary: effect.summary || `${effect.total} matching substance${effect.total === 1 ? "" : "s"}`,
      slug: effect.slug,
      count: effect.total,
      keywords: mergeKeywords(...keywordSources),
    };
  });

  const reportEntries: SearchEntryWithInternals[] = input.reports.map((report) => {
    const substanceLabel = joinWithSeparator(report.substanceNames);
    const metadataPreview = buildReportMetadataPreview(report);
    const secondaryParts = [
      report.author ? `by ${report.author}` : "",
      substanceLabel ? `with ${substanceLabel}` : "",
    ].filter(Boolean);
    const secondary = metadataPreview || secondaryParts.join(" · ");
    const narrativeDescription = report.introduction ? trimSearchExcerpt(report.introduction) : undefined;
    const description =
      normalizeComparableText(narrativeDescription) !== normalizeComparableText(secondary)
        ? narrativeDescription
        : undefined;
    const meta: SearchEntryMeta[] = [];

    if (report.author) {
      meta.push({ label: "Author", value: report.author });
    }
    if (substanceLabel) {
      meta.push({
        label: report.substanceNames.length === 1 ? "Substance" : "Substances",
        value: substanceLabel,
      });
    }
    if (report.tripDate) {
      meta.push({ label: "Trip date", value: report.tripDate });
    }

    const reportSubstanceKeywordSources = [
      ...report.substanceNames,
      ...(report.substances ?? []).map((substance) => substance.name),
    ].flatMap((name) => {
      const matchedSubstance = substanceByLookupKey.get(normalizeSearchKey(name));

      return matchedSubstance
        ? [matchedSubstance.name, matchedSubstance.slug, ...matchedSubstance.aliases]
        : [name];
    });
    const reportSubstanceAliasFolded = Array.from(
      new Set(
        [
          ...report.substanceNames,
          ...(report.substances ?? []).map((substance) => substance.name),
        ].flatMap((name) => {
          const matchedSubstance = substanceByLookupKey.get(normalizeSearchKey(name));

          return matchedSubstance
            ? matchedSubstance.aliases.map((alias) => foldSearchText(alias))
            : [];
        }),
      ),
    );

    const keywordSources = [
      keywordize(report.title),
      keywordize(report.slug),
      keywordize(report.author),
      keywordize(report.authorProfileKey),
      keywordize(report.introduction),
      keywordize(report.age),
      keywordize(report.gender),
      keywordize(report.height),
      keywordize(report.weight),
      keywordize(report.medications),
      keywordize(report.setting),
      ...report.substanceNames.map((name) => keywordize(name)),
      ...reportSubstanceKeywordSources.map((value) => keywordize(value)),
      ...(report.substances ?? []).flatMap((substance) => [
        keywordize(substance.name),
        keywordize(substance.dose),
        keywordize(substance.roa),
      ]),
    ];

    return {
      id: `report:${report.slug}`,
      type: "report" as const,
      label: report.title,
      secondary,
      description,
      slug: report.slug,
      icon: icons.fileSignature,
      keywords: mergeKeywords(...keywordSources),
      reportSubstanceAliasFolded: Object.freeze(reportSubstanceAliasFolded),
      reportSubstanceKeys: Object.freeze(
        report.substanceNames.map(normalizeSearchKey).filter(Boolean),
      ),
      meta: meta.length > 0 ? meta : undefined,
    };
  });

  const profileEntries: SearchEntryWithInternals[] = input.profiles.map((profile) => {
    const keywordSources = [
      keywordize(profile.displayName),
      keywordize(profile.key),
      keywordize(profile.bio),
    ];

    return {
      id: `profile:${profile.key.toLowerCase()}`,
      type: "profile" as const,
      label: profile.displayName,
      secondary: profile.hasCustomBio && profile.bio.trim().length > 0
        ? profile.bio
        : `@${profile.key.toLowerCase()}`,
      slug: profile.key,
      icon: "lucide:user",
      keywords: mergeKeywords(...keywordSources),
    };
  });

  const indexedEntries = Object.freeze(
    [...substanceEntries, ...categoryEntries, ...effectEntries, ...reportEntries, ...profileEntries].map((entry) => {
      const keywords = mergeKeywords(entry.keywords, keywordize(entry.label));
      const labelFolded = foldSearchText(entry.label);
      const aliasFolded = entry.aliases?.map((alias) => foldSearchText(alias));

      return Object.freeze({
        ...readonlySearchEntry({ ...entry, keywords }),
        aliasFolded,
        reportSubstanceKeys: entry.reportSubstanceKeys,
        reportSubstanceAliasFolded: entry.reportSubstanceAliasFolded,
        labelFolded,
        ...buildCompactMatchFields(entry.label, entry.aliases),
        identityBlob: [
          labelFolded,
          ...(aliasFolded ?? []),
          ...(entry.reportSubstanceAliasFolded ?? []),
        ].join(KEYWORD_SEPARATOR),
        keywordBlob: `${KEYWORD_SEPARATOR}${keywords.join(KEYWORD_SEPARATOR)}`,
      });
    }),
  );
  const publicEntries = Object.freeze(indexedEntries.map(toPublicEntry));
  const metadata: SearchIndexMetadata = Object.freeze({
    inputHash: getSearchIndexInputHash(input),
    entryCounts: Object.freeze({
      substance: substanceEntries.length,
      category: categoryEntries.length,
      effect: effectEntries.length,
      report: reportEntries.length,
      profile: profileEntries.length,
      total: indexedEntries.length,
    }),
  });

  return Object.freeze({
    metadata,
    entries: publicEntries,
    indexedEntries,
    query(query: string, options: SearchQueryOptions = {}) {
      // Ranking keeps entry references only, so the public-shape spread is paid
      // once per returned row instead of once per matched row.
      return runSearch(indexedEntries, query, { limit: options.limit }).map((match) => ({
        ...toPublicEntry(match.entry),
        score: match.score,
      }));
    },
  });
}

/**
 * Overlay approved localized display fields onto a canonical index.
 *
 * Canonical labels and aliases remain identity aliases, so Latin substance
 * queries and English deep links continue to work in every locale. Keywords
 * stay byte-for-byte canonical: translated prose is display-only and never
 * enters search matching.
 */
export function localizeSearchIndex(
  index: SearchIndex,
  locale: string,
  localizedEntries: readonly LocalizedSearchEntry[],
): SearchIndex {
  if (locale === "en" || localizedEntries.length === 0) {
    return index;
  }

  const localizationById = new Map(localizedEntries.map((entry) => [entry.id, entry]));
  const projectedEntries = index.indexedEntries.map((entry) => {
    const localized = localizationById.get(entry.id);
    if (!localized) return entry;

    const label = localized.label?.trim() || entry.label;
    const aliases = uniqueDisplayParts([
      entry.label,
      ...(entry.aliases ?? []),
      ...(localized.aliases ?? []),
    ]).filter((alias) => normalizeComparableText(alias) !== normalizeComparableText(label));
    const labelFolded = foldSearchText(label);
    const aliasFolded = aliases.map((alias) => foldSearchText(alias));

    return Object.freeze({
      ...entry,
      label,
      aliases: Object.freeze(aliases),
      secondary: localized.secondary?.trim() || entry.secondary,
      description: localized.description?.trim() || entry.description,
      labelFolded,
      aliasFolded,
      ...buildCompactMatchFields(label, aliases),
      identityBlob: [
        labelFolded,
        ...aliasFolded,
        ...(entry.reportSubstanceAliasFolded ?? []),
      ].join(KEYWORD_SEPARATOR),
    });
  });
  const localizationVersion = hashString(
    stableStringify(
      [...localizedEntries]
        .map((entry) => ({
          id: entry.id,
          label: entry.label,
          aliases: entry.aliases,
          secondary: entry.secondary,
          description: entry.description,
        }))
        .sort((left, right) => left.id.localeCompare(right.id)),
    ),
  );
  const frozenEntries = Object.freeze(projectedEntries);

  return Object.freeze({
    metadata: Object.freeze({
      ...index.metadata,
      inputHash: `${index.metadata.inputHash}:${locale}:${localizationVersion}`,
    }),
    entries: Object.freeze(frozenEntries.map(toPublicEntry)),
    indexedEntries: frozenEntries,
    query(query: string, options: SearchQueryOptions = {}) {
      return runSearch(frozenEntries, query, { limit: options.limit }).map((match) => ({
        ...toPublicEntry(match.entry),
        score: match.score,
      }));
    },
  });
}

export function buildSearchIndexFromLibrary(library: LibraryData): SearchIndex {
  return buildSearchIndex(createSearchIndexInput(library));
}

/**
 * Query search using library data.
 *
 * Prefer building a SearchIndex once and querying it for repeated requests.
 */
export function querySearchWithData(
  query: string,
  library: LibraryData,
  limit?: number,
): SearchMatch[] {
  return buildSearchIndexFromLibrary(library).query(query, { limit });
}
