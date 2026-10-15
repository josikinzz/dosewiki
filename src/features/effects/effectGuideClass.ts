import { effectMatchesCategorySlug } from "@/data/effectCategoryDefinitions";
import type { GuideClass } from "@/features/articles/domain/articleGuides";

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
