import "server-only";

import psychoactiveIndexManual from "../../src/data/indexes/psychoactiveIndexManual.json";
import type { CategoryTabContent } from "../../src/data/categoryTabContent";
import type { CopyResolver } from "./copyBlocks";

/**
 * Server-only projection of per-category editorial content from the manual
 * psychoactive index JSON, keyed by category `key`.
 *
 * The public substance-index layout is served from Convex (slugs only), so the
 * `definition`/`warning` text never reaches the client through that path. We
 * read it straight from the JSON here and hand it to the page as a prop, which
 * keeps the ~18KB index out of the client bundle.
 *
 * The definitions are also editable copy. When a `CopyResolver` is supplied,
 * each category's prose is read from `substances-category-<key>` and the JSON
 * value becomes the fallback — which is what the copy defaults hold, so an
 * un-seeded deployment projects exactly the JSON. The two umbrella tabs
 * (`super:hallucinogens`, `super:depressants`) are not categories in the JSON,
 * so they are only ever contributed by the copy layer; `DosagesPage` keeps its
 * own inline copies as the last-resort fallback.
 */
type ManualCategory = {
  key: string;
  definition?: string;
  warning?: string;
};

/** Copy key for one psychoactive category's index intro. */
export function categoryDefinitionCopyKey(categoryKey: string): string {
  return `substances-category-${categoryKey}`;
}

/** Umbrella tab id → copy key. The ids carry a `:` that copy keys may not. */
export const SUPER_CATEGORY_COPY_KEYS: Record<string, string> = {
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
