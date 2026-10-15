import { isCasSearchQuery, normalizeCasNumber } from "./casSearch";

export type SearchEntryType = "substance" | "category" | "effect" | "report" | "profile";

const SEARCH_TYPE_ORDER: Record<SearchEntryType, number> = {
  substance: 0,
  profile: 1,
  report: 2,
  effect: 3,
  category: 4,
};

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
} as const

export const KEYWORD_SEPARATOR = "\u0000";

const COMBINING_MARKS = /[\u0300-\u036f]/g;

export const foldSearchText = (value: string | undefined | null): string => {
  if (!value) {
    return "";
  }
  return value.normalize("NFKD").replace(COMBINING_MARKS, "").toLowerCase();
};

export const normalizeSearchKey = (value: string | undefined): string =>
  foldSearchText(value).replace(/[^\p{L}\p{N}\p{M}]+/gu, " ").trim();

const compactSearchText = (value: string | undefined | null): string =>
  foldSearchText(value).replace(/[^\p{L}\p{N}\p{M}]+/gu, "")

export interface CompactMatchFields {
  labelCompact: string;
  aliasCompact?: readonly string[];
  identityCompactBlob: string;
}

export const buildCompactMatchFields = (
  label: string,
  aliases: readonly string[] | undefined,
): CompactMatchFields => {
  const labelCompact = compactSearchText(label);
  const aliasCompact = aliases?.map((alias) => compactSearchText(alias));
  return {
    labelCompact,
    aliasCompact,
    identityCompactBlob: [labelCompact, ...(aliasCompact ?? [])].join(KEYWORD_SEPARATOR),
  };
};

const WORD_CHARACTER_AT_END = /[\p{L}\p{N}\p{M}]$/u;

const hasWordPrefix = (text: string, query: string): boolean => {
  let from = text.indexOf(query);
  while (from >= 0) {
    if (from === 0 || !WORD_CHARACTER_AT_END.test(text.slice(0, from))) {
      return true;
    }
    from = text.indexOf(query, from + 1);
  }
  return false;
}

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

export interface MatchableEntry {
  type: SearchEntryType;
  label: string;
  slug: string;
  count?: number;
  aliases?: readonly string[];
  casNumbers?: readonly string[];
  labelFolded: string;
  aliasFolded?: readonly string[];
  labelCompact: string;
  aliasCompact?: readonly string[];
  reportSubstanceKeys?: readonly string[];
  reportSubstanceAliasFolded?: readonly string[];
  identityBlob: string;
  identityCompactBlob: string;
  keywordBlob: string;
}

interface ScoredMatch { score: number;
matchLength: number; }

const computeScore = (
  entry: MatchableEntry,
  query: string,
  compactQuery: string = compactSearchText(query),
): ScoredMatch | null => {
  if (!query) {
    return null;
  }

  const compact = compactQuery.length > 0;

  if (
    !entry.identityBlob.includes(query) &&
    !(compact && entry.identityCompactBlob.includes(compactQuery)) &&
    !entry.keywordBlob.includes(query)
  ) {
    return null;
  }

  const labelLength = entry.labelFolded.length;
  const { aliasFolded, aliasCompact, reportSubstanceAliasFolded } = entry;

  if (entry.labelFolded === query || (compact && entry.labelCompact === compactQuery)) {
    return { score: SCORE.labelExact, matchLength: labelLength };
  }

  const aliasExact = shortestMatchLength(aliasFolded, (alias) => alias === query);
  if (aliasExact !== null) {
    return { score: SCORE.aliasExact, matchLength: aliasExact };
  }
  if (compact) {
    const aliasCompactExact = shortestMatchLength(
      aliasCompact,
      (alias) => alias === compactQuery,
    );
    if (aliasCompactExact !== null) {
      return { score: SCORE.aliasExact, matchLength: aliasCompactExact };
    }
  }

  const reportAliasExact = shortestMatchLength(
    reportSubstanceAliasFolded,
    (alias) => alias === query,
  );
  if (reportAliasExact !== null) {
    return { score: SCORE.reportSubstanceAliasExact, matchLength: reportAliasExact };
  }

  if (
    entry.labelFolded.startsWith(query) ||
    (compact && entry.labelCompact.startsWith(compactQuery))
  ) {
    return { score: SCORE.labelPrefix, matchLength: labelLength };
  }
  if (hasWordPrefix(entry.labelFolded, query)) {
    return { score: SCORE.labelWordPrefix, matchLength: labelLength };
  }

  const aliasPrefix = shortestMatchLength(aliasFolded, (alias) => alias.startsWith(query));
  if (aliasPrefix !== null) {
    return { score: SCORE.aliasPrefix, matchLength: aliasPrefix };
  }
  if (compact) {
    const aliasCompactPrefix = shortestMatchLength(aliasCompact, (alias) =>
      alias.startsWith(compactQuery),
    );
    if (aliasCompactPrefix !== null) {
      return { score: SCORE.aliasPrefix, matchLength: aliasCompactPrefix };
    }
  }

  const aliasWordPrefix = shortestMatchLength(aliasFolded, (alias) => hasWordPrefix(alias, query));
  if (aliasWordPrefix !== null) {
    return { score: SCORE.aliasWordPrefix, matchLength: aliasWordPrefix };
  }

  const reportAliasPrefix = shortestMatchLength(reportSubstanceAliasFolded, (alias) =>
    alias.startsWith(query),
  );
  if (reportAliasPrefix !== null) {
    return { score: SCORE.reportSubstanceAliasPrefix, matchLength: reportAliasPrefix };
  }

  if (entry.labelFolded.includes(query)) {
    return { score: SCORE.labelSubstring, matchLength: labelLength };
  }

  const aliasSubstring = shortestMatchLength(aliasFolded, (alias) => alias.includes(query));
  if (aliasSubstring !== null) {
    return { score: SCORE.aliasSubstring, matchLength: aliasSubstring };
  }

  const reportAliasSubstring = shortestMatchLength(reportSubstanceAliasFolded, (alias) =>
    alias.includes(query),
  );
  if (reportAliasSubstring !== null) {
    return { score: SCORE.reportSubstanceAliasSubstring, matchLength: reportAliasSubstring };
  }

  if (entry.keywordBlob.includes(KEYWORD_SEPARATOR + query)) {
    return { score: SCORE.keywordPrefix, matchLength: labelLength };
  }
  if (entry.keywordBlob.includes(query)) {
    return { score: SCORE.keywordSubstring, matchLength: labelLength };
  }
  return null;
}

export interface RankedMatch<TEntry extends MatchableEntry> extends ScoredMatch {
  entry: TEntry;
}

const getSubstanceMatchKeys = (entry: MatchableEntry): string[] =>
  entry.type === "substance"
    ? [entry.label, entry.slug, ...(entry.aliases ?? [])].map(normalizeSearchKey).filter(Boolean)
    : [];

const hasPrioritizedReportSubstance = (
  entry: MatchableEntry,
  prioritizedReportSubstanceKeys: ReadonlySet<string>,
): boolean =>
  entry.type === "report" &&
  entry.reportSubstanceKeys?.some((key) => prioritizedReportSubstanceKeys.has(key)) === true;

const compareMatches = <TEntry extends MatchableEntry>(
  a: RankedMatch<TEntry>,
  b: RankedMatch<TEntry>,
  prioritizedReportSubstanceKeys: ReadonlySet<string>,
): number => {
  if (a.score !== b.score) {
    return a.score - b.score;
  }
  if (a.entry.type !== b.entry.type) {
    return SEARCH_TYPE_ORDER[a.entry.type] - SEARCH_TYPE_ORDER[b.entry.type];
  }
  const aPrioritizedReport = hasPrioritizedReportSubstance(a.entry, prioritizedReportSubstanceKeys);
  const bPrioritizedReport = hasPrioritizedReportSubstance(b.entry, prioritizedReportSubstanceKeys);
  if (aPrioritizedReport !== bPrioritizedReport) {
    return aPrioritizedReport ? -1 : 1;
  }
  if (a.entry.count && b.entry.count && a.entry.count !== b.entry.count) {
    return b.entry.count - a.entry.count;
  }
  if (a.matchLength !== b.matchLength) {
    return a.matchLength - b.matchLength;
  }
  return a.entry.label.localeCompare(b.entry.label);
};

const normalizeSearchQuery = (query: string): string => foldSearchText(query).trim()

export interface RunSearchOptions {
  limit?: number;
}

export function runSearch<TEntry extends MatchableEntry>(
  entries: readonly TEntry[],
  query: string,
  { limit }: RunSearchOptions = {},
): RankedMatch<TEntry>[] {
  const normalized = normalizeSearchQuery(query);
  if (!normalized) {
    return [];
  }
  if (isCasSearchQuery(normalized)) {
    const casNumber = normalizeCasNumber(normalized);
    if (!casNumber) return [];
    const matches = entries
      .filter((entry) => entry.type === "substance" && entry.casNumbers?.includes(casNumber))
      .map((entry) => ({ entry, score: 0, matchLength: casNumber.length }));
    matches.sort((left, right) => compareMatches(left, right, new Set()));
    return typeof limit === "number" ? matches.slice(0, Math.max(limit, 0)) : matches;
  }
  const compactQuery = compactSearchText(normalized);

  const matches: RankedMatch<TEntry>[] = [];
  for (const entry of entries) {
    const scored = computeScore(entry, normalized, compactQuery);
    if (scored !== null) {
      matches.push({ entry, score: scored.score, matchLength: scored.matchLength });
    }
  }

  if (matches.length === 0) {
    return [];
  }

  const noPriority: ReadonlySet<string> = new Set();

  let topMatch = matches[0];
  for (let index = 1; index < matches.length; index += 1) {
    if (compareMatches(matches[index], topMatch, noPriority) < 0) {
      topMatch = matches[index];
    }
  }

  const prioritizedReportSubstanceKeys = new Set(getSubstanceMatchKeys(topMatch.entry));

  const filtered =
    prioritizedReportSubstanceKeys.size > 0
      ? matches.filter(
          (match) =>
            match.entry.type !== "report" ||
            hasPrioritizedReportSubstance(match.entry, prioritizedReportSubstanceKeys),
        )
      : matches;

  filtered.sort((a, b) => compareMatches(a, b, prioritizedReportSubstanceKeys));

  if (typeof limit === "number") {
    return filtered.slice(0, Math.max(limit, 0));
  }
  return filtered;
}
