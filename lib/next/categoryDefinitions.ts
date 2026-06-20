import "server-only";

import psychoactiveIndexManual from "../../src/data/indexes/psychoactiveIndexManual.json";
import type { CategoryTabContent } from "../../src/data/categoryTabContent";

/**
 * Server-only projection of per-category editorial content from the manual
 * psychoactive index JSON, keyed by category `key`.
 *
 * The public substance-index layout is served from Convex (slugs only), so the
 * `definition`/`warning` text never reaches the client through that path. We
 * read it straight from the JSON here and hand it to the page as a prop, which
 * keeps the ~18KB index out of the client bundle.
 */
type ManualCategory = {
  key: string;
  definition?: string;
  warning?: string;
};

export function getCategoryDefinitions(): Record<string, CategoryTabContent> {
  const map: Record<string, CategoryTabContent> = {};
  for (const category of psychoactiveIndexManual.categories as ManualCategory[]) {
    const definition = category.definition?.trim() || undefined;
    const warning = category.warning?.trim() || undefined;
    if (definition || warning) {
      map[category.key] = { definition, warning };
    }
  }
  return map;
}
