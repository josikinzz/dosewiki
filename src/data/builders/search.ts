import type { IconName } from "@/components/common/Icon";
import { icons } from "@/utils/iconNames";
import type { LibraryData } from "../SubstanceIndexProvider";
import type { SubstanceRecord } from "./contentBuilder";

export type SearchEntryType = "substance" | "category" | "effect" | "report" | "profile";

export interface SearchEntryMeta {
  label: string;
  value: string;
}

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

export interface SearchIndexEntryCounts {
  substance: number;
  category: number;
  effect: number;
  report: number;
  profile: number;
  total: number;
}

export interface SearchIndexMetadata {
  inputHash: string;
  entryCounts: SearchIndexEntryCounts;
}

export interface SearchQueryOptions {
  limit?: number;
}

export interface SearchIndex {
  metadata: SearchIndexMetadata;
  entries: readonly SearchEntry[];
  query: (query: string, options?: SearchQueryOptions) => SearchMatch[];
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

export interface SearchIndexProfileInput {
  key: string;
  displayName: string;
  aliases: string[];
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
  const lower = trimmed.toLowerCase();
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

type IndexedEntry = Readonly<
  SearchEntry & {
    labelLower: string;
    aliasLowers?: readonly string[];
    reportSubstanceKeys?: readonly string[];
    reportSubstanceAliasLowers?: readonly string[];
    /** `labelLower`, aliases and report substance aliases joined by {@link KEYWORD_SEPARATOR}. */
    identityBlob: string;
    /** Every keyword joined by {@link KEYWORD_SEPARATOR}, with a leading separator. */
    keywordBlob: string;
  }
>;

type SearchEntryWithInternals = SearchEntry & {
  reportSubstanceKeys?: readonly string[];
  reportSubstanceAliasLowers?: readonly string[];
};

type InternalSearchMatch = SearchMatch & {
  reportSubstanceKeys?: readonly string[];
  matchLength: number;
};

const SEARCH_TYPE_ORDER: Record<SearchEntryType, number> = {
  substance: 0,
  profile: 1,
  report: 2,
  effect: 3,
  category: 4,
};

/**
 * Match quality tiers, best first. Ordering rules that matter for real queries:
 *
 * - A hit on an entry's own name always beats a hit on one of its alternative
 *   names, so typing `eth` surfaces ETH-LAD and Ethylone before Alcohol
 *   (alias `ethanol`) or 4-AcO-DET (alias `Ethacetin`).
 * - Word-boundary hits beat mid-word hits, so `lad` surfaces ETH-LAD and AL-LAD
 *   before substances that merely contain the letters.
 * - Keyword hits (classes, mechanisms, prose) are always last; they exist to
 *   make the long tail reachable, not to compete with name matches.
 */
const SCORE = {
  labelExact: 0,
  aliasExact: 1,
  reportSubstanceAliasExact: 2,
  labelPrefix: 3,
  labelWordPrefix: 4,
  aliasPrefix: 5,
  aliasWordPrefix: 6,
  reportSubstanceAliasPrefix: 7,
  labelSubstring: 8,
  aliasSubstring: 9,
  reportSubstanceAliasSubstring: 10,
  keywordPrefix: 11,
  keywordSubstring: 12,
} as const;

/**
 * Blob delimiter. Keywords may contain spaces, so the separator has to be a
 * character no keyword and no user query can hold. That makes
 * `blob.includes(KEYWORD_SEPARATOR + q)` exactly "some keyword starts with q",
 * and stops `blob.includes(q)` from ever matching across two adjacent keywords.
 */
const KEYWORD_SEPARATOR = "\u0000";

interface ScoredMatch {
  score: number;
  /**
   * Length of the text that produced the hit. Used as a tiebreaker so the query
   * covering more of a short name outranks the same hit buried in a long one —
   * `eth` scores ETH-LAD above Ethylphenidate, and alias `ethanol` above a
   * 70-character IUPAC name. Keyword tiers fall back to the label length.
   */
  matchLength: number;
}

const isWordCharacter = (code: number): boolean =>
  (code >= 97 && code <= 122) || (code >= 48 && code <= 57);

/** True when `query` starts any word inside `text` (not just the whole string). */
const hasWordPrefix = (text: string, query: string): boolean => {
  let from = text.indexOf(query);
  while (from >= 0) {
    if (from === 0 || !isWordCharacter(text.charCodeAt(from - 1))) {
      return true;
    }
    from = text.indexOf(query, from + 1);
  }
  return false;
};

/**
 * Shortest entry in `values` satisfying `predicate`, or `null` when none do.
 * Shortest wins so the tiebreaker sees the tightest available match.
 */
const shortestMatchLength = (
  values: readonly string[] | undefined,
  predicate: (value: string) => boolean,
): number | null => {
  let best: number | null = null;
  if (!values) {
    return null;
  }
  for (const value of values) {
    if (predicate(value) && (best === null || value.length < best)) {
      best = value.length;
    }
  }
  return best;
};

const computeScore = (entry: IndexedEntry, query: string): ScoredMatch | null => {
  if (!query) {
    return null;
  }

  // Two native substring scans reject the ~95% of entries that cannot match at
  // all, before any per-alias or per-keyword work happens.
  if (!entry.identityBlob.includes(query) && !entry.keywordBlob.includes(query)) {
    return null;
  }

  const labelLength = entry.labelLower.length;
  const { aliasLowers, reportSubstanceAliasLowers } = entry;

  if (entry.labelLower === query) {
    return { score: SCORE.labelExact, matchLength: labelLength };
  }

  const aliasExact = shortestMatchLength(aliasLowers, (alias) => alias === query);
  if (aliasExact !== null) {
    return { score: SCORE.aliasExact, matchLength: aliasExact };
  }

  const reportAliasExact = shortestMatchLength(
    reportSubstanceAliasLowers,
    (alias) => alias === query,
  );
  if (reportAliasExact !== null) {
    return { score: SCORE.reportSubstanceAliasExact, matchLength: reportAliasExact };
  }

  if (entry.labelLower.startsWith(query)) {
    return { score: SCORE.labelPrefix, matchLength: labelLength };
  }
  if (hasWordPrefix(entry.labelLower, query)) {
    return { score: SCORE.labelWordPrefix, matchLength: labelLength };
  }

  const aliasPrefix = shortestMatchLength(aliasLowers, (alias) => alias.startsWith(query));
  if (aliasPrefix !== null) {
    return { score: SCORE.aliasPrefix, matchLength: aliasPrefix };
  }

  const aliasWordPrefix = shortestMatchLength(aliasLowers, (alias) =>
    hasWordPrefix(alias, query),
  );
  if (aliasWordPrefix !== null) {
    return { score: SCORE.aliasWordPrefix, matchLength: aliasWordPrefix };
  }

  const reportAliasPrefix = shortestMatchLength(reportSubstanceAliasLowers, (alias) =>
    alias.startsWith(query),
  );
  if (reportAliasPrefix !== null) {
    return { score: SCORE.reportSubstanceAliasPrefix, matchLength: reportAliasPrefix };
  }

  if (entry.labelLower.includes(query)) {
    return { score: SCORE.labelSubstring, matchLength: labelLength };
  }

  const aliasSubstring = shortestMatchLength(aliasLowers, (alias) => alias.includes(query));
  if (aliasSubstring !== null) {
    return { score: SCORE.aliasSubstring, matchLength: aliasSubstring };
  }

  const reportAliasSubstring = shortestMatchLength(reportSubstanceAliasLowers, (alias) =>
    alias.includes(query),
  );
  if (reportAliasSubstring !== null) {
    return { score: SCORE.reportSubstanceAliasSubstring, matchLength: reportAliasSubstring };
  }

  // A keyword starting with the query is equivalent to the blob containing the
  // query immediately after a separator — one scan instead of one call per
  // keyword, which matters because prose-derived entries carry 1000+ keywords.
  if (entry.keywordBlob.includes(KEYWORD_SEPARATOR + query)) {
    return { score: SCORE.keywordPrefix, matchLength: labelLength };
  }
  if (entry.keywordBlob.includes(query)) {
    return { score: SCORE.keywordSubstring, matchLength: labelLength };
  }
  return null;
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
    labelLower: _labelLower,
    aliasLowers: _aliasLowers,
    reportSubstanceKeys: _reportSubstanceKeys,
    reportSubstanceAliasLowers: _reportSubstanceAliasLowers,
    identityBlob: _identityBlob,
    keywordBlob: _keywordBlob,
    ...rest
  } = entry;
  return rest;
};

const normalizeSearchKey = (value: string | undefined): string =>
  (value ?? "").replace(/[^a-z0-9]+/gi, " ").trim().toLowerCase();

const getSubstanceMatchKeys = (match: InternalSearchMatch): string[] =>
  match.type === "substance"
    ? [match.label, match.slug, ...(match.aliases ?? [])]
      .map(normalizeSearchKey)
      .filter(Boolean)
    : [];

const getSubstanceLookupKeys = (
  substance: Pick<SearchIndexSubstanceInput, "name" | "slug" | "aliases">,
): string[] =>
  [substance.name, substance.slug, ...substance.aliases]
    .map(normalizeSearchKey)
    .filter(Boolean);

const hasPrioritizedReportSubstance = (
  match: InternalSearchMatch,
  prioritizedReportSubstanceKeys: ReadonlySet<string>,
): boolean =>
  match.type === "report" &&
  match.reportSubstanceKeys?.some((key) => prioritizedReportSubstanceKeys.has(key)) === true;

const sortMatches = (
  matches: InternalSearchMatch[],
  prioritizedReportSubstanceKeys: ReadonlySet<string> = new Set(),
): InternalSearchMatch[] =>
  matches.sort((a, b) => {
    if (a.score !== b.score) {
      return a.score - b.score;
    }
    if (a.type !== b.type) {
      return SEARCH_TYPE_ORDER[a.type] - SEARCH_TYPE_ORDER[b.type];
    }
    const aPrioritizedReport = hasPrioritizedReportSubstance(a, prioritizedReportSubstanceKeys);
    const bPrioritizedReport = hasPrioritizedReportSubstance(b, prioritizedReportSubstanceKeys);
    if (aPrioritizedReport !== bPrioritizedReport) {
      return aPrioritizedReport ? -1 : 1;
    }
    // Categories and effects carry a substance count, which is a better
    // popularity signal than name length, so it stays ahead of it.
    if (a.count && b.count && a.count !== b.count) {
      return b.count - a.count;
    }
    if (a.matchLength !== b.matchLength) {
      return a.matchLength - b.matchLength;
    }
    return a.label.localeCompare(b.label);
  });

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
      aliases: [...profile.aliases],
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
    const reportSubstanceAliasLowers = Array.from(
      new Set(
        [
          ...report.substanceNames,
          ...(report.substances ?? []).map((substance) => substance.name),
        ].flatMap((name) => {
          const matchedSubstance = substanceByLookupKey.get(normalizeSearchKey(name));

          return matchedSubstance
            ? matchedSubstance.aliases.map((alias) => alias.toLowerCase())
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
      reportSubstanceAliasLowers: Object.freeze(reportSubstanceAliasLowers),
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
      ...profile.aliases.map((alias) => keywordize(alias)),
    ];

    return {
      id: `profile:${profile.key.toLowerCase()}`,
      type: "profile" as const,
      label: profile.displayName,
      secondary: profile.hasCustomBio && profile.bio.trim().length > 0
        ? profile.bio
        : `@${profile.key.toLowerCase()}`,
      aliases: Object.freeze([...profile.aliases]),
      slug: profile.key,
      icon: "lucide:user",
      keywords: mergeKeywords(...keywordSources),
    };
  });

  const indexedEntries = Object.freeze(
    [...substanceEntries, ...categoryEntries, ...effectEntries, ...reportEntries, ...profileEntries].map((entry) => {
      const keywords = mergeKeywords(entry.keywords, keywordize(entry.label));
      const labelLower = entry.label.toLowerCase();
      const aliasLowers = entry.aliases?.map((alias) => alias.toLowerCase());

      return Object.freeze({
        ...readonlySearchEntry({ ...entry, keywords }),
        aliasLowers,
        reportSubstanceKeys: entry.reportSubstanceKeys,
        reportSubstanceAliasLowers: entry.reportSubstanceAliasLowers,
        labelLower,
        identityBlob: [
          labelLower,
          ...(aliasLowers ?? []),
          ...(entry.reportSubstanceAliasLowers ?? []),
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
    query(query: string, options: SearchQueryOptions = {}) {
      return querySearchIndex({ indexedEntries, query, limit: options.limit });
    },
  });
}

interface QuerySearchIndexArgs {
  indexedEntries: readonly IndexedEntry[];
  query: string;
  limit?: number;
}

const querySearchIndex = ({ indexedEntries, query, limit }: QuerySearchIndexArgs): SearchMatch[] => {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return [];
  }

  const matches: InternalSearchMatch[] = [];
  indexedEntries.forEach((entry) => {
    const scored = computeScore(entry, normalized);
    if (scored === null) {
      return;
    }

    matches.push({
      ...toPublicEntry(entry),
      reportSubstanceKeys: entry.reportSubstanceKeys,
      score: scored.score,
      matchLength: scored.matchLength,
    });
  });

  let filteredMatches = matches;

  sortMatches(filteredMatches);
  const topMatch = matches[0];
  const prioritizedReportSubstanceKeys = new Set(
    topMatch ? getSubstanceMatchKeys(topMatch) : [],
  );

  if (prioritizedReportSubstanceKeys.size > 0) {
    filteredMatches = matches.filter(
      (match) =>
        match.type !== "report" ||
        hasPrioritizedReportSubstance(match, prioritizedReportSubstanceKeys),
    );
    sortMatches(filteredMatches, prioritizedReportSubstanceKeys);
  }

  const publicMatches = filteredMatches.map(
    ({ reportSubstanceKeys: _reportSubstanceKeys, matchLength: _matchLength, ...match }) => match,
  );

  if (typeof limit === "number") {
    return publicMatches.slice(0, Math.max(limit, 0));
  }

  return publicMatches;
};

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
