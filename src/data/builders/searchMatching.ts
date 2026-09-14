/**
 * Shared matching core for every search surface.
 *
 * The server index (`search.ts`) and the browser-side manifest index
 * (`searchManifest.ts`) both rank through this module, so a query typed into
 * the header cannot be scored one way locally and another way on the server.
 */

export type SearchEntryType = "substance" | "category" | "effect" | "report" | "profile";

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
 * - Exact and prefix comparisons also run on compact forms with punctuation
 *   stripped, so `allad` is an exact hit on AL-LAD (compact `allad`) instead
 *   of only a substring hit on Palladone.
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
} as const

/**
 * Blob delimiter. Keywords may contain spaces, so the separator has to be a
 * character no keyword and no user query can hold. That makes
 * `blob.includes(KEYWORD_SEPARATOR + q)` exactly "some keyword starts with q",
 * and stops `blob.includes(q)` from ever matching across two adjacent keywords.
 */
export const KEYWORD_SEPARATOR = "\u0000";

const COMBINING_MARKS = /[\u0300-\u036f]/g;

/**
 * Canonical text form for every comparison in this module.
 *
 * Decomposing to NFD and dropping combining marks folds accents away, so
 * `peyoté` and `peyote` are the same string on both sides of a comparison —
 * indexed names carry the accents editors typed, queries usually do not.
 */
export const foldSearchText = (value: string | undefined | null): string => {
  if (!value) {
    return "";
  }
  return value.normalize("NFD").replace(COMBINING_MARKS, "").toLowerCase();
};

/** Folded, punctuation-flattened identity key used to link reports to substances. */
export const normalizeSearchKey = (value: string | undefined): string =>
  foldSearchText(value).replace(/[^a-z0-9]+/g, " ").trim();

/**
 * Compact identity form: folded with everything but letters and digits
 * removed, so `allad` and `AL-LAD` compare equal. Only ever compared against
 * other compact forms; word-boundary logic stays on the folded/spaced form.
 */
const compactSearchText = (value: string | undefined | null): string =>
  foldSearchText(value).replace(/[^a-z0-9]+/g, "")

/** The compact fields an index or manifest loader precomputes per entry. */
export interface CompactMatchFields {
  labelCompact: string;
  aliasCompact?: readonly string[];
  identityCompactBlob: string;
}

/**
 * Derive the compact fields for one entry. Shared by the server index builder
 * and the client manifest loader so the compact forms never live in a
 * serialized payload — they are recomputed wherever entries materialize.
 */
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
}

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

/**
 * The minimum an entry must expose to be ranked.
 *
 * Folded fields and blobs are precomputed once when an index is built; the
 * per-query path only reads them.
 */
export interface MatchableEntry {
  type: SearchEntryType;
  label: string;
  slug: string;
  count?: number;
  aliases?: readonly string[];
  labelFolded: string;
  aliasFolded?: readonly string[];
  labelCompact: string;
  aliasCompact?: readonly string[];
  reportSubstanceKeys?: readonly string[];
  reportSubstanceAliasFolded?: readonly string[];
  /** `labelFolded`, aliases and report substance aliases joined by {@link KEYWORD_SEPARATOR}. */
  identityBlob: string;
  /** `labelCompact` and `aliasCompact` joined by {@link KEYWORD_SEPARATOR}. */
  identityCompactBlob: string;
  /**
   * Every keyword joined by {@link KEYWORD_SEPARATOR}, with a leading separator.
   * Empty for manifest entries, which carry no keywords — the keyword tiers then
   * simply never fire.
   */
  keywordBlob: string;
}

interface ScoredMatch { score: number;
/**
 * Length of the text that produced the hit. Used as a tiebreaker so the query
 * covering more of a short name outranks the same hit buried in a long one —
 * `eth` scores ETH-LAD above Ethylphenidate, and alias `ethanol` above a
 * 70-character IUPAC name. Keyword tiers fall back to the label length.
 */
matchLength: number; }

const computeScore = (
  entry: MatchableEntry,
  query: string,
  compactQuery: string = compactSearchText(query),
): ScoredMatch | null => {
  if (!query) {
    return null;
  }

  // The compact tiers only run for a query that still carries letters or
  // digits once punctuation is gone; an all-punctuation query would otherwise
  // compact to "" and prefix-match everything.
  const compact = compactQuery.length > 0;

  // Native substring scans reject the ~95% of entries that cannot match at
  // all, before any per-alias or per-keyword work happens.
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
  // Categories and effects carry a substance count, which is a better
  // popularity signal than name length, so it stays ahead of it.
  if (a.entry.count && b.entry.count && a.entry.count !== b.entry.count) {
    return b.entry.count - a.entry.count;
  }
  if (a.matchLength !== b.matchLength) {
    return a.matchLength - b.matchLength;
  }
  return a.entry.label.localeCompare(b.entry.label);
};

/** Canonical query normalization. Every caller must go through this. */
const normalizeSearchQuery = (query: string): string => foldSearchText(query).trim()

export interface RunSearchOptions {
  limit?: number;
}

/**
 * Rank `entries` against `query`, best first.
 *
 * Scoring keeps only a reference to the matched entry, so the caller pays for
 * result projection once per returned row rather than once per matched row —
 * a broad query can match hundreds of entries to return twenty.
 */
export function runSearch<TEntry extends MatchableEntry>(
  entries: readonly TEntry[],
  query: string,
  { limit }: RunSearchOptions = {},
): RankedMatch<TEntry>[] {
  const normalized = normalizeSearchQuery(query);
  if (!normalized) {
    return [];
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

  // The best match decides which reports stay, so it is found with a linear
  // scan rather than by sorting the whole result set twice.
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
