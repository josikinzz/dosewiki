import type { LucideIcon } from "lucide-react";

import {
  effectSummaries,
  findCategoryByKey,
  dosageCategoryGroups,
  substanceRecords,
} from "./library";

export type SearchEntryType = "substance" | "category" | "effect";

export interface SearchEntry {
  id: string;
  type: SearchEntryType;
  label: string;
  secondary?: string;
  slug: string;
  icon?: LucideIcon;
  count?: number;
  keywords: string[];
}

export interface SearchMatch extends SearchEntry {
  score: number;
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

const mergeKeywords = (...lists: Array<Array<string>>): string[] => {
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

const substanceEntries: SearchEntry[] = substanceRecords.map((record) => {
  const subtitle = record.content.subtitle?.trim();
  const categories = record.content.categories ?? [];
  const heroBadges = record.content.heroBadges ?? [];
  const heroLabels = heroBadges.map((badge) => badge.label).filter((label) => Boolean(label));

  const keywordSources = [
    keywordize(record.name),
    keywordize(record.slug),
    ...record.chemicalClasses.map((entry) => keywordize(entry)),
    ...record.psychoactiveClasses.map((entry) => keywordize(entry)),
    ...categories.map((entry) => keywordize(entry)),
    ...heroLabels.map((entry) => keywordize(entry)),
  ];

  return {
    id: `substance:${record.slug}`,
    type: "substance",
    label: record.name,
    secondary: subtitle,
    slug: record.slug,
    keywords: mergeKeywords(...keywordSources),
  };
});

const categoryEntries: SearchEntry[] = dosageCategoryGroups.map((group) => {
  const definition = findCategoryByKey(group.key);
  const label = definition?.name ?? group.name;
  const aliases = definition?.aliases ?? [];
  const keywordSources = [
    keywordize(label),
    keywordize(group.key),
    ...aliases.map((alias) => keywordize(alias)),
  ];

  return {
    id: `category:${group.key}`,
    type: "category",
    label,
    secondary: `${group.total} substance${group.total === 1 ? "" : "s"}`,
    slug: group.key,
    icon: definition?.icon,
    count: group.total,
    keywords: mergeKeywords(...keywordSources),
  };
});

const effectEntries: SearchEntry[] = effectSummaries.map((effect) => {
  const keywordSources = [keywordize(effect.name), keywordize(effect.slug)];

  return {
    id: `effect:${effect.slug}`,
    type: "effect",
    label: effect.name,
    secondary: `${effect.total} matching substance${effect.total === 1 ? "" : "s"}`,
    slug: effect.slug,
    keywords: mergeKeywords(...keywordSources),
  };
});

const entryPool: SearchEntry[] = [...substanceEntries, ...categoryEntries, ...effectEntries];

const withLabelKeywords = entryPool.map((entry) => ({
  ...entry,
  keywords: mergeKeywords(entry.keywords, keywordize(entry.label)),
  labelLower: entry.label.toLowerCase(),
}));

type IndexedEntry = (typeof withLabelKeywords)[number] & { labelLower: string };

export const searchEntries: SearchEntry[] = withLabelKeywords.map(({ labelLower: _labelLower, ...entry }) => entry);

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

export function querySearch(query: string, limit?: number): SearchMatch[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return [];
  }

  const matches: SearchMatch[] = [];
  withLabelKeywords.forEach((entry) => {
    const score = computeScore(entry, normalized);
    if (score === null) {
      return;
    }

    const { labelLower: _labelLower, ...rest } = entry;
    matches.push({
      ...rest,
      score,
    });
  });

  matches.sort((a, b) => {
    if (a.score !== b.score) {
      return a.score - b.score;
    }
    if (a.type !== b.type) {
      const order: Record<SearchEntryType, number> = {
        substance: 0,
        category: 1,
        effect: 2,
      };
      return order[a.type] - order[b.type];
    }
    if (a.count && b.count && a.count !== b.count) {
      return b.count - a.count;
    }
    return a.label.localeCompare(b.label);
  });

  if (typeof limit === "number") {
    return matches.slice(0, Math.max(limit, 0));
  }

  return matches;
}
