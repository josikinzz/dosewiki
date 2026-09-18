import { effectMatchesCategorySlug } from "@/data/effectCategoryDefinitions";
import type { GuideClass } from "@/features/articles/domain/articleGuides";

/**
 * SEI categories whose effects define a guide class, so an effect page in the
 * family, and the category page itself, point readers at the class's scale.
 * Mirrors `categoryHref` in `ARTICLE_GUIDES_BY_CLASS`; psychedelic effects span
 * every sensory category, so no single category maps to that class.
 */
const GUIDE_CLASS_BY_EFFECT_CATEGORY: Record<string, GuideClass> = {
  "disconnective-effects": "dissociative",
};

export function guideClassForEffectCategory(categorySlug: string): GuideClass | undefined {
  return GUIDE_CLASS_BY_EFFECT_CATEGORY[categorySlug];
}

export function guideClassForEffect(effect: { tags: string[] }): GuideClass | undefined {
  for (const [categorySlug, guideClass] of Object.entries(GUIDE_CLASS_BY_EFFECT_CATEGORY)) {
    if (effectMatchesCategorySlug(effect, categorySlug)) return guideClass;
  }
  return undefined;
}
