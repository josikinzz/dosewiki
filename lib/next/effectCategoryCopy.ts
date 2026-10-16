import "server-only";

import { EFFECT_CATEGORY_DEFINITIONS } from "../../src/data/effectCategoryDefinitions";
import type { CopyResolver } from "./copyBlocks";

export function effectCategoryCopyKey(slug: string): string {
  return `effects-category-${slug}`;
}

export function getEffectCategoryDescriptions(
  copy: CopyResolver,
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const definition of EFFECT_CATEGORY_DEFINITIONS) {
    const edited = copy.get(effectCategoryCopyKey(definition.slug))?.body;
    if (edited) {
      map[definition.slug] = edited;
    }
  }
  return map;
}
