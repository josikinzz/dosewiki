import "server-only";

import psychoactiveIndexManual from "@data/substances/psychoactiveIndexManual.json";
import type { CategoryTabContent } from "../../src/data/categoryTabContent";
import type { CopyResolver } from "./copyBlocks";

type ManualCategory = {
  key: string;
  definition?: string;
  warning?: string;
};

function categoryDefinitionCopyKey(categoryKey: string): string {
  return `substances-category-${categoryKey}`;
}

const SUPER_CATEGORY_COPY_KEYS: Record<string, string> = {
  "super:hallucinogens": "substances-category-super-hallucinogens",
  "super:depressants": "substances-category-super-depressants",
};

export function getCategoryDefinitions(
  copy?: CopyResolver,
): Record<string, CategoryTabContent> {
  const map: Record<string, CategoryTabContent> = {};
  for (const category of psychoactiveIndexManual.categories as ManualCategory[]) {
    const fallback = category.definition?.trim() || undefined;
    const edited = copy?.get(categoryDefinitionCopyKey(category.key))?.body?.trim();
    const definition = edited || fallback;
    const warning = category.warning?.trim() || undefined;
    if (definition || warning) {
      map[category.key] = { definition, warning };
    }
  }

  if (copy) {
    for (const [tabId, key] of Object.entries(SUPER_CATEGORY_COPY_KEYS)) {
      const definition = copy.get(key)?.body?.trim();
      if (definition) {
        map[tabId] = { definition, warning: "" };
      }
    }
  }

  return map;
}
