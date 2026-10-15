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

const SEARCH_MANIFEST_SHAPE = 3;

interface SearchManifestEntry {
  id: string;
  type: SearchEntryType;
  label: string;
  slug: string;
  secondary?: string;
  description?: string;
  icon?: IconName;
  aliases?: readonly string[];
  casNumbers?: readonly string[];
  count?: number;
  substanceKeys?: readonly string[];
  substanceAliases?: readonly string[];
}

export interface SearchManifest {
  locale: string;
  version: string;
  shape: number;
  entries: SearchManifestEntry[];
}

const omitEmpty = <T>(values: readonly T[] | undefined): readonly T[] | undefined =>
  values && values.length > 0 ? values : undefined;

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

      const aliases = entry.type === "profile" ? undefined : omitEmpty(entry.aliases);
      if (aliases) manifestEntry.aliases = aliases;
      const casNumbers = omitEmpty(entry.casNumbers);
      if (casNumbers) manifestEntry.casNumbers = casNumbers;

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
      casNumbers: entry.casNumbers,
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
