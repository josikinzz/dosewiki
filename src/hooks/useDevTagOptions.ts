import { useMemo } from "react";

import type { TagOption } from "../data/tagOptions";
import { buildTagRegistry, type TagField, type TagRegistry } from "../utils/tagRegistry";
import { useDevMode } from "../components/dev/DevModeContext";

export interface DevTagOptionsResult {
  registry: TagRegistry;
  categories: TagOption[];
  chemicalClasses: TagOption[];
  psychoactiveClasses: TagOption[];
  mechanismEntries: TagOption[];
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
    return {
      registry,
      categories: mapUsagesToOptions(registry, "categories"),
      chemicalClasses: mapUsagesToOptions(registry, "chemical_class"),
      psychoactiveClasses: mapUsagesToOptions(registry, "psychoactive_class"),
      mechanismEntries: mapUsagesToOptions(registry, "mechanism_of_action"),
    };
  }, [articles]);
}
