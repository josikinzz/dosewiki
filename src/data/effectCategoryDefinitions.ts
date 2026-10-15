import effectCategoriesSource from "@content/taxonomy/effect-categories.json";
import type { IconName } from "../components/common/Icon";

export interface EffectCategoryDefinition {
  slug: string;
  name: string;
  description: string;
  icon: IconName;
}

export const EFFECT_CATEGORY_DEFINITIONS: EffectCategoryDefinition[] =
  effectCategoriesSource as EffectCategoryDefinition[];

export function getEffectCategoryDefinition(slug: string): EffectCategoryDefinition | undefined {
  return EFFECT_CATEGORY_DEFINITIONS.find(def => def.slug === slug);
}

export const CATEGORY_SLUG_TO_TAG_GROUPS: Record<string, string[][]> = {
  "visual-effects": [["visual"]],
  "visual-amplifications": [["visual", "amplification"]],
  "visual-suppressions": [["visual", "suppression"]],
  "visual-distortions": [["visual", "distortion"]],
  "geometric-patterns": [["visual", "geometric"]],
  "hallucinatory-states": [["visual", "hallucinatory state"]],
  "auditory-effects": [["auditory"]],
  "smell-and-taste-effects": [["gustatory"], ["olfactory"], ["smell and taste"]],
  "tactile-effects": [["tactile"]],
  "multisensory-effects": [["multisensory"]],
  "disconnective-effects": [["disconnective"]],
  "cognitive-effects": [["cognitive"]],
  "cognitive-amplifications": [["cognitive", "amplification"]],
  "cognitive-suppressions": [["cognitive", "suppression"]],
  "novel-cognitive-states": [["cognitive", "novel"]],
  "psychological-states": [["cognitive", "psychological state"]],
  "transpersonal-states": [["cognitive", "transpersonal state"]],
  "transpersonal-effects": [["transpersonal state"]],
  "physical-effects": [["physical"]],
  "physical-amplifications": [["physical", "amplification"]],
  "physical-suppressions": [["physical", "suppression"]],
  "physical-alterations": [["physical", "alteration"]],
  "uncomfortable-physical-effects": [["physical", "uncomfortable"]],
  "cardiovascular-effects": [["uncomfortable", "cardiovascular"]],
  "neurological-effects": [["uncomfortable", "neurological"]],
  "uncomfortable-bodily-effects": [["uncomfortable", "bodily"]],
};

export const CATEGORY_SLUG_TO_TAGS: Record<string, string[]> = Object.fromEntries(
  Object.entries(CATEGORY_SLUG_TO_TAG_GROUPS).map(([slug, groups]) => [
    slug,
    Array.from(new Set(groups.flat())),
  ]),
);

export function effectMatchesCategorySlug(
  effect: { tags: string[] },
  categorySlug: string,
): boolean {
  const tagGroups = CATEGORY_SLUG_TO_TAG_GROUPS[categorySlug];

  if (!tagGroups) {
    return false;
  }

  const effectTags = new Set(effect.tags.map((tag) => tag.toLowerCase()));

  return tagGroups.some((group) =>
    group.every((tag) => effectTags.has(tag.toLowerCase())),
  );
}
