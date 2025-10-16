import { useMemo } from "react";

import type { TagOption } from "../data/tagOptions";
import { tokenizeTagField } from "../utils/tagDelimiters";
import { buildTagRegistry, type TagField, type TagRegistry } from "../utils/tagRegistry";
import { useDevMode } from "../components/dev/DevModeContext";

export interface DevTagOptionsResult {
  registry: TagRegistry;
  categories: TagOption[];
  chemicalClasses: TagOption[];
  psychoactiveClasses: TagOption[];
  mechanismEntries: TagOption[];
  indexCategories: TagOption[];
}

const mapUsagesToOptions = (registry: TagRegistry, field: TagField): TagOption[] =>
  registry.byField[field].map((usage) => ({
    value: usage.tag,
    label: usage.tag,
    count: usage.count,
  }));

export function useDevTagOptions(): DevTagOptionsResult {
  const { articles } = useDevMode();

  return useMemo(() => {
    const registry = buildTagRegistry(articles);
    const indexCategoryAccumulator = new Map<string, { label: string; count: number }>();

    articles.forEach((article) => {
      const raw = typeof article["index-category"] === "string" ? article["index-category"] : "";
      if (!raw) {
        return;
      }

      const tags = tokenizeTagField(raw, { splitOnComma: false, splitOnSlash: true });
      if (tags.length === 0) {
        return;
      }

      const seen = new Set<string>();
      tags.forEach((tag) => {
        const label = tag.trim();
        if (!label) {
          return;
        }
        const key = label.toLowerCase();
        if (seen.has(key)) {
          return;
        }
        seen.add(key);
        if (!indexCategoryAccumulator.has(key)) {
          indexCategoryAccumulator.set(key, { label, count: 0 });
        }
        indexCategoryAccumulator.get(key)!.count += 1;
      });
    });

    const indexCategories: TagOption[] = Array.from(indexCategoryAccumulator.values())
      .map((entry) => ({ value: entry.label, label: entry.label, count: entry.count }))
      .sort((a, b) => a.label.localeCompare(b.label));

    return {
      registry,
      categories: mapUsagesToOptions(registry, "categories"),
      chemicalClasses: mapUsagesToOptions(registry, "chemical_class"),
      psychoactiveClasses: mapUsagesToOptions(registry, "psychoactive_class"),
      mechanismEntries: mapUsagesToOptions(registry, "mechanism_of_action"),
      indexCategories,
    };
  }, [articles]);
}
