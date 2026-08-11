import type { IconName } from '@/components/common/Icon';
import {
  EFFECT_CATEGORY_DEFINITIONS,
  effectMatchesCategorySlug,
} from '@/data/effectCategoryDefinitions';

/** One category page an effect belongs to. */
export interface EffectCategoryLink {
  slug: string;
  name: string;
  icon: IconName;
}

/**
 * The category pages an effect belongs to, derived from its own tags.
 *
 * The stored mapping runs category → tags (`CATEGORY_SLUG_TO_TAG_GROUPS`), and
 * membership is a conjunction inside a group rather than a plain tag lookup —
 * `visual-distortions` means "visual AND distortion". So this asks each category
 * whether it claims the effect, using the same predicate the category pages use
 * to build their own listings, instead of inverting the table into a
 * tag → category index that would lose the AND semantics.
 *
 * Definition order is preserved, which runs broad to specific ("Visual Effects"
 * before "Visual Distortions") — the order a reader widens their browsing in.
 */
export function resolveEffectCategories(tags: readonly string[]): EffectCategoryLink[] {
  const effect = { tags: [...tags] };

  return EFFECT_CATEGORY_DEFINITIONS.filter((definition) =>
    effectMatchesCategorySlug(effect, definition.slug),
  ).map((definition) => ({
    slug: definition.slug,
    name: definition.name,
    icon: definition.icon,
  }));
}
