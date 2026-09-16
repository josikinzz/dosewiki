import type { IconName } from "@/components/common/Icon";
import type { PublicTableOfContentsItem } from "@/components/common/PublicTableOfContents";
import type { DrugClassContent, DrugClassSection } from "@/data/drugClassContent";
import { icons } from "@/utils/iconNames";
import { slugify } from "@/utils/slug";

export const CATEGORY_OVERVIEW_ANCHOR_ID = "overview";
export const CATEGORY_SUBSTANCES_ANCHOR_ID = "substances";
export const INITIAL_DRUG_CLASS_SECTION_LIMIT = 4;

export interface CategoryEffect {
  _id?: string;
  slug: string;
  name: string;
  tags: string[];
  summary: string;
  long_summary_raw?: string;
  long_summary_ast?: unknown;
  citations?: Array<{ url: string; text: string; from?: string }>;
  subarticles?: Array<{ id: string; title: string }>;
}

export interface CategorySectionWithEffects {
  section: DrugClassSection;
  effects: CategoryEffect[];
}

export function categorySectionAnchorId(section: DrugClassSection): string {
  return slugify(section.title);
}

function hasTag(effect: CategoryEffect, tag: string): boolean {
  return effect.tags.some((candidate) => candidate.toLowerCase() === tag.toLowerCase());
}

/**
 * Filter effects by tags (all must match) with optional exclusions.
 */
export function filterEffectsByTags(
  effects: CategoryEffect[],
  requiredTags: string[],
  excludeTags?: string[],
): CategoryEffect[] {
  return effects.filter((effect) => {
    if (!requiredTags.every((tag) => hasTag(effect, tag))) {
      return false;
    }
    return !(excludeTags ?? []).some((tag) => hasTag(effect, tag));
  });
}

/**
 * Resolve the drug-class sections that actually render for a category: every
 * declared section paired with its matching effects, minus the ones that match
 * nothing. Both the rendered body and the table of contents read this list, so
 * the two cannot drift.
 */
export function resolveDrugClassSections(
  content: DrugClassContent | undefined,
  effects: CategoryEffect[],
): CategorySectionWithEffects[] {
  if (!content) {
    return [];
  }

  return (content.sections ?? [])
    .map((section) => ({
      section,
      effects: filterEffectsByTags(effects, section.effectTags, section.excludeTags),
    }))
    .filter(({ effects: matchingEffects }) => matchingEffects.length > 0);
}

interface CategoryTocInput {
  /** Sections as resolved by `resolveDrugClassSections`, in render order. */
  sections: CategorySectionWithEffects[];
  /** Whether the page opens with the drug-class overview section. */
  hasOverview: boolean;
  substanceCount: number;
  substanceIcon: IconName;
}

export function buildCategoryTocItems({
  sections,
  hasOverview,
  substanceCount,
  substanceIcon,
}: CategoryTocInput): PublicTableOfContentsItem[] {
  const items: PublicTableOfContentsItem[] = [];

  if (hasOverview) {
    items.push({
      id: CATEGORY_OVERVIEW_ANCHOR_ID,
      label: "Overview",
      icon: icons.subjectiveEffectIndex,
    });
  }

  for (const { section } of sections) {
    items.push({
      id: categorySectionAnchorId(section),
      label: section.title,
      icon: section.icon,
    });
  }

  items.push({
    id: CATEGORY_SUBSTANCES_ANCHOR_ID,
    label: `Substances (${substanceCount})`,
    icon: substanceIcon,
  });

  return items;
}
