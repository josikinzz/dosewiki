import { useMemo } from "react";
import type { SubstanceArticle } from "@/schema";

import type { TagOption } from "../data/config/tagOptions";
import { buildTagRegistry, type TagField, type TagRegistry } from "../utils/data/tagRegistry";
import { useDevMode } from "@/features/dev/context/DevModeContext";

export interface DevTagOptionsResult {
  registry: TagRegistry;
  categories: TagOption[];
  chemicalClasses: TagOption[];
  psychoactiveClasses: TagOption[];
  mechanismOfAction: TagOption[];
  indexCategories: TagOption[];
}

const mapUsagesToOptions = (registry: TagRegistry, field: TagField): TagOption[] => {
  const usages = registry.byField[field] ?? [];
  return usages.map((usage) => ({
    value: usage.tag,
    label: usage.tag,
    count: usage.count,
  }));
};

export function buildDevTagOptions(articles: SubstanceArticle[]): DevTagOptionsResult {
    const registry = buildTagRegistry(articles);
    const indexCategoryAccumulator = new Map<string, { label: string; count: number }>();

    articles.forEach((article) => {
      const indexCats = Array.isArray(article.index_categories) ? article.index_categories : [];
      if (indexCats.length === 0) {
        return;
      }

      const seen = new Set<string>();
      indexCats.forEach((tag) => {
        const label = typeof tag === "string" ? tag.trim() : "";
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
      categories: mapUsagesToOptions(registry, "index_categories"),
      chemicalClasses: mapUsagesToOptions(registry, "chemical_class"),
      psychoactiveClasses: mapUsagesToOptions(registry, "psychoactive_class"),
      mechanismOfAction: mapUsagesToOptions(registry, "mechanism_of_action"),
      indexCategories,
    };
}

export function useDevTagOptions(): DevTagOptionsResult {
  const { articles } = useDevMode();
  return useMemo(() => buildDevTagOptions(articles as SubstanceArticle[]), [articles]);
}
