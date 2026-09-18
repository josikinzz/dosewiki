/**
 * The browser-side search manifest.
 *
 * The server index is the authority, but reaching it costs a network round trip
 * per keystroke. The manifest is the same index with its bulky parts removed —
 * every substance, category, effect, report and profile keeps the fields the
 * result list renders plus the names and aliases worth matching, and drops the
 * keyword lists (classes, mechanisms, article prose) that make the server index
 * megabytes.
 *
 * That trade is deliberate: name and alias matching covers what people actually
 * type, runs instantly against a manifest already in memory, and the server
 * request that follows still fills in the keyword-tier and prose matches.
 */

import type { IconName } from "@/components/common/Icon";
import type { SearchIndex, SearchSuggestion } from "./search";
import {
  buildCompactMatchFields,
  foldSearchText,
  runSearch,
  KEYWORD_SEPARATOR,
  type MatchableEntry,
  type SearchEntryType,
} from "./searchMatching";

/**
 * Payload shape version. Bump when `SearchManifestEntry` changes in a way an
 * already-cached client could not read; it is part of the cache key, so a bump
 * retires every stored copy.
 */
const SEARCH_MANIFEST_SHAPE = 2;

interface SearchManifestEntry {
  id: string;
  type: SearchEntryType;
  label: string;
  slug: string;
  secondary?: string;
  description?: string;
  icon?: IconName;
  aliases?: readonly string[];
  count?: number;
  /** Reports only: normalized keys of the substances the report covers. */
  substanceKeys?: readonly string[];
  /** Reports only: folded aliases of those substances, so `molly` finds MDMA reports. */
  substanceAliases?: readonly string[];
}

export interface SearchManifest {
  /** Locale whose approved display labels and aliases this payload carries. */
  locale: string;
  /** The source index's `inputHash`. Changes whenever the content behind it changes. */
  version: string;
  shape: number;
  entries: SearchManifestEntry[];
}

const omitEmpty = <T>(values: readonly T[] | undefined): readonly T[] | undefined =>
  values && values.length > 0 ? values : undefined;

/**
 * Preview text is rendered clamped to two lines, so the manifest carries only
 * enough to fill them. Substance subtitles average ~800 characters and were over
 * half the payload; the cap is set well above what two clamped lines can show,
 * so the trim is never visible and the server refinement supplies the full text
 * anyway.
 */
const MANIFEST_PREVIEW_MAX_LENGTH = 280;

const trimPreview = (value: string | undefined): string | undefined => {
  if (!value) {
    return undefined;
  }
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= MANIFEST_PREVIEW_MAX_LENGTH) {
    return normalized || undefined;
  }
  return `${normalized.slice(0, MANIFEST_PREVIEW_MAX_LENGTH).trimEnd()}…`;
};

/**
 * Project a built index down to what a browser needs.
 *
 * Folded forms are intentionally not shipped — recomputing them at load costs
 * well under a millisecond for ~1000 entries and would otherwise near-double the
 * payload.
 */
export function createSearchManifest(index: SearchIndex, locale = "en"): SearchManifest {
  return {
    version: index.metadata.inputHash,
    shape: SEARCH_MANIFEST_SHAPE,
    locale,
    entries: index.indexedEntries.map((entry) => {
      const manifestEntry: SearchManifestEntry = {
        id: entry.id,
        type: entry.type,
        label: entry.label,
        slug: entry.slug,
      };

      const secondary = trimPreview(entry.secondary);
      if (secondary) manifestEntry.secondary = secondary;

      const description = trimPreview(entry.description);
      if (description) manifestEntry.description = description;
      if (entry.icon) manifestEntry.icon = entry.icon;
      if (typeof entry.count === "number") manifestEntry.count = entry.count;

      // Profile aliases never ship: the index no longer carries them, and this
      // guard keeps internal reviewer handles out of the cached client payload
      // even if an alias-bearing profile entry ever reappears upstream.
      const aliases = entry.type === "profile" ? undefined : omitEmpty(entry.aliases);
      if (aliases) manifestEntry.aliases = aliases;

      const substanceKeys = omitEmpty(entry.reportSubstanceKeys);
      if (substanceKeys) manifestEntry.substanceKeys = substanceKeys;

      const substanceAliases = omitEmpty(entry.reportSubstanceAliasFolded);
      if (substanceAliases) manifestEntry.substanceAliases = substanceAliases;

      return manifestEntry;
    }),
  };
}

type ManifestMatchable = MatchableEntry & { suggestion: SearchSuggestion };

export interface SearchManifestIndex {
  version: string;
  locale: string;
  size: number;
  query: (query: string, options?: { limit?: number }) => SearchSuggestion[];
}

/**
 * Prepare a manifest for querying: fold once, then every keystroke is pure
 * string comparison over in-memory data.
 */
export function buildSearchManifestIndex(manifest: SearchManifest): SearchManifestIndex {
  const entries: ManifestMatchable[] = manifest.entries.map((entry) => {
    const labelFolded = foldSearchText(entry.label);
    const aliasFolded = entry.aliases?.map((alias) => foldSearchText(alias));
    const reportSubstanceAliasFolded = entry.substanceAliases?.map((alias) =>
      foldSearchText(alias),
    );

    return {
      type: entry.type,
      label: entry.label,
      slug: entry.slug,
      count: entry.count,
      aliases: entry.aliases,
      labelFolded,
      aliasFolded,
      ...buildCompactMatchFields(entry.label, entry.aliases),
      reportSubstanceKeys: entry.substanceKeys,
      reportSubstanceAliasFolded,
      identityBlob: [
        labelFolded,
        ...(aliasFolded ?? []),
        ...(reportSubstanceAliasFolded ?? []),
      ].join(KEYWORD_SEPARATOR),
      // No keywords client-side, so the keyword tiers never fire. An empty blob
      // can never contain a non-empty query, which is exactly that behaviour.
      keywordBlob: "",
      suggestion: {
        id: entry.id,
        type: entry.type,
        label: entry.label,
        secondary: entry.secondary,
        description: entry.description,
        aliases: entry.aliases,
        slug: entry.slug,
        icon: entry.icon,
      },
    };
  });

  return {
    locale: manifest.locale,
    version: manifest.version,
    size: entries.length,
    query: (query, options = {}) =>
      runSearch(entries, query, { limit: options.limit }).map((match) => match.entry.suggestion),
  };
}
