import type { IconName } from "@/components/common/Icon";
import {
  CATEGORY_SLUG_TO_TAG_GROUPS,
  getEffectCategoryDefinition,
} from "@/data/effectCategoryDefinitions";
import {
  PARENT_CATEGORIES,
  resolveEffectCategoryIcon,
  type ParentCategoryConfig,
} from "./effectsIndexConfig";

export interface EffectCategoryGroupEffect {
  slug: string;
  name: string;
  tags: string[];
}

export interface EffectCategoryGroup {
  /** Stable anchor id for the section and its table-of-contents entry. */
  id: string;
  title: string;
  icon: IconName;
  /** Route slug of the subcategory's own page, when it has one. */
  categorySlug?: string;
  description?: string;
  effects: EffectCategoryGroupEffect[];
}

export const OTHER_GROUP_ID = "group-other";

const OTHER_GROUP_ICON: IconName = "lucide:tag";

function normalizeTags(tags: string[]): string[] {
  return Array.from(new Set(tags.map((tag) => tag.toLowerCase()))).sort();
}

export function getNormalizedEffectTags(tags: string[]): Set<string> {
  return new Set(tags.map((tag) => tag.toLowerCase()));
}

function sameTags(left: string[], right: string[]): boolean {
  const a = normalizeTags(left);
  const b = normalizeTags(right);
  return a.length === b.length && a.every((tag, index) => tag === b[index]);
}

/**
 * Route slug of the category page that covers exactly `tags`.
 *
 * Subcategories are declared as tag conjunctions in `effectsIndexConfig`, while
 * pages are declared as tag groups in `effectCategoryDefinitions`. A page owns a
 * subcategory only when it matches that single conjunction — a page such as
 * smell-and-taste-effects, which unions several conjunctions, is the parent
 * rather than the subcategory and is excluded along with the parent itself.
 */
export function resolveSubcategorySlug(
  tags: string[],
  parentSlug: string,
): string | undefined {
  const match = Object.entries(CATEGORY_SLUG_TO_TAG_GROUPS).find(
    ([slug, groups]) =>
      slug !== parentSlug && groups.length === 1 && sameTags(groups[0], tags),
  );

  return match?.[0];
}

/**
 * Top-level category config for a route slug, if the slug is a parent category.
 */
export function getParentCategoryConfig(
  categorySlug: string,
): ParentCategoryConfig | undefined {
  return PARENT_CATEGORIES.find((category) => category.routeSlug === categorySlug);
}

interface BuildEffectCategoryGroupsInput {
  categorySlug: string;
  effects: EffectCategoryGroupEffect[];
  /** Editable subcategory descriptions by slug; the definition is the fallback. */
  descriptions?: Record<string, string>;
}

/**
 * Split a category's effects into its subcategory groups.
 *
 * Returns an empty array when the slug is a leaf category, or when the parent
 * declares fewer than two named subcategories — those pages render a single
 * flat list instead. Effects that match the parent but none of its
 * subcategories are collected into a trailing "Other" group so nothing is
 * dropped.
 */
export function buildEffectCategoryGroups({
  categorySlug,
  effects,
  descriptions,
}: BuildEffectCategoryGroupsInput): EffectCategoryGroup[] {
  const parent = getParentCategoryConfig(categorySlug);

  if (!parent) {
    return [];
  }

  const namedSubcategories = parent.subcategories.flatMap((subcategory) =>
    subcategory.title ? [{ ...subcategory, title: subcategory.title }] : [],
  );

  if (namedSubcategories.length < 2) {
    return [];
  }

  const effectsWithLowerTags = effects.map((effect) => ({
    effect,
    lowerTags: getNormalizedEffectTags(effect.tags),
  }));
  const groupedSlugs = new Set<string>();

  const groups: EffectCategoryGroup[] = namedSubcategories
    .map((subcategory) => {
      const lowerTags = subcategory.tags.map((tag) => tag.toLowerCase());
      const matched = effectsWithLowerTags
        .filter((entry) => lowerTags.every((tag) => entry.lowerTags.has(tag)))
        .map((entry) => entry.effect);

      const subcategorySlug = resolveSubcategorySlug(subcategory.tags, categorySlug);
      const definition = subcategorySlug
        ? getEffectCategoryDefinition(subcategorySlug)
        : undefined;

      return {
        id: `group-${subcategory.key}`,
        title: subcategory.title,
        icon: resolveEffectCategoryIcon(subcategorySlug ?? "") ?? definition?.icon ?? parent.icon,
        categorySlug: subcategorySlug,
        description: (subcategorySlug && descriptions?.[subcategorySlug]) || definition?.description,
        effects: matched,
      };
    })
    .filter((group) => group.effects.length > 0);

  for (const group of groups) {
    for (const effect of group.effects) {
      groupedSlugs.add(effect.slug);
    }
  }

  const ungrouped = effects.filter((effect) => !groupedSlugs.has(effect.slug));

  if (ungrouped.length > 0) {
    groups.push({
      id: OTHER_GROUP_ID,
      title: `Other ${parent.title}`,
      icon: OTHER_GROUP_ICON,
      effects: ungrouped,
    });
  }

  return groups.length < 2 ? [] : groups;
}
