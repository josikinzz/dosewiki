import type { IconName } from '@/components/common/Icon';
import {
  EFFECT_CATEGORY_DEFINITIONS,
  effectMatchesCategorySlug,
} from '@/data/effectCategoryDefinitions';

export interface EffectCategoryLink {
  slug: string;
  name: string;
  icon: IconName;
}

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
