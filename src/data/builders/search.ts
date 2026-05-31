import type { IconName } from "@/components/common/Icon";
import type { LibraryData } from "../SubstanceIndexProvider";
import type { SubstanceRecord } from "./contentBuilder";

export type SearchEntryType = "substance" | "category" | "effect";

export interface SearchEntryMeta {
  label: string;
  value: string;
}

export interface SearchEntry {
  id: string;
  type: SearchEntryType;
  label: string;
  secondary?: string;
  slug: string;
  icon?: IconName;
  count?: number;
  keywords: readonly string[];
  meta?: readonly SearchEntryMeta[];
}

export interface SearchMatch extends SearchEntry {
  score: number;
}

export interface SearchIndexEntryCounts {
  substance: number;
  category: number;
  effect: number;
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
}

export interface SearchIndexInput {
  substances: SearchIndexSubstanceInput[];
  categories: SearchIndexCategoryInput[];
  effects: SearchIndexEffectInput[];
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
  }
>;

const SEARCH_TYPE_ORDER: Record<SearchEntryType, number> = {
  substance: 0,
  category: 1,
  effect: 2,
};

const computeScore = (entry: IndexedEntry, query: string): number | null => {
  if (!query) {
    return null;
  }

  if (entry.labelLower.startsWith(query)) {
    return 0;
  }
  if (entry.labelLower.includes(query)) {
    return 1;
  }
  if (entry.keywords.some((keyword) => keyword.startsWith(query))) {
    return 2;
  }
  if (entry.keywords.some((keyword) => keyword.includes(query))) {
    return 3;
  }
  return null;
};

const readonlySearchEntry = (entry: SearchEntry): SearchEntry =>
  Object.freeze({
    ...entry,
    keywords: Object.freeze([...entry.keywords]),
    meta: entry.meta
      ? Object.freeze(entry.meta.map((meta) => Object.freeze({ ...meta })))
      : undefined,
  });

const toPublicEntry = (entry: IndexedEntry): SearchEntry => {
  const { labelLower: _labelLower, ...rest } = entry;
  return rest;
};

const sortMatches = (matches: SearchMatch[]): SearchMatch[] =>
  matches.sort((a, b) => {
    if (a.score !== b.score) {
      return a.score - b.score;
    }
    if (a.type !== b.type) {
      return SEARCH_TYPE_ORDER[a.type] - SEARCH_TYPE_ORDER[b.type];
    }
    if (a.count && b.count && a.count !== b.count) {
      return b.count - a.count;
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

export function createSearchIndexInput(library: LibraryData): SearchIndexInput {
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
    })),
  };
}

export function buildSearchIndex(input: SearchIndexInput): SearchIndex {
  const substanceEntries: SearchEntry[] = input.substances.map((substance) => {
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

    const aliasLabel = joinWithSeparator(substance.aliases);

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

    const secondaryLabel = aliasLabel || (meta.length === 0 ? substance.subtitle : undefined);

    return {
      id: `substance:${substance.slug}`,
      type: "substance" as const,
      label: substance.name,
      secondary: secondaryLabel,
      slug: substance.slug,
      keywords: mergeKeywords(...keywordSources),
      meta: meta.length > 0 ? meta : undefined,
    };
  });

  const categoryEntries: SearchEntry[] = input.categories.map((category) => {
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

  const effectEntries: SearchEntry[] = input.effects.map((effect) => {
    const keywordSources = [keywordize(effect.name), keywordize(effect.slug)];

    return {
      id: `effect:${effect.slug}`,
      type: "effect" as const,
      label: effect.name,
      secondary: `${effect.total} matching substance${effect.total === 1 ? "" : "s"}`,
      slug: effect.slug,
      count: effect.total,
      keywords: mergeKeywords(...keywordSources),
    };
  });

  const indexedEntries = Object.freeze(
    [...substanceEntries, ...categoryEntries, ...effectEntries].map((entry) =>
      Object.freeze({
        ...readonlySearchEntry({
          ...entry,
          keywords: mergeKeywords(entry.keywords, keywordize(entry.label)),
        }),
        labelLower: entry.label.toLowerCase(),
      }),
    ),
  );
  const publicEntries = Object.freeze(indexedEntries.map(toPublicEntry));
  const metadata: SearchIndexMetadata = Object.freeze({
    inputHash: getSearchIndexInputHash(input),
    entryCounts: Object.freeze({
      substance: substanceEntries.length,
      category: categoryEntries.length,
      effect: effectEntries.length,
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

  const matches: SearchMatch[] = [];
  indexedEntries.forEach((entry) => {
    const score = computeScore(entry, normalized);
    if (score === null) {
      return;
    }

    matches.push({
      ...toPublicEntry(entry),
      score,
    });
  });

  sortMatches(matches);

  if (typeof limit === "number") {
    return matches.slice(0, Math.max(limit, 0));
  }

  return matches;
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
