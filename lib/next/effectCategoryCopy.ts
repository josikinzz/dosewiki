import "server-only";

import { EFFECT_CATEGORY_DEFINITIONS } from "../../src/data/effectCategoryDefinitions";
import type { CopyResolver } from "./copyBlocks";

/**
 * Editable descriptions for the effect category pages.
 *
 * The prose in `effectCategoryDefinitions.ts` stays the fallback — and is what
 * the checked-in copy defaults hold — so an un-seeded deployment renders the
 * same paragraphs it always did. Resolving the whole map once on the server
 * keeps the category page and its subcategory panels reading one source.
 */

/** Copy key for one effect category's description. */
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
