import { memo, useMemo } from "react";
import type { IconName } from "@/components/common/Icon";
import { IndexCard, IndexCardSection, IndexCardList, IndexCardListItem } from "@/components/common/IndexCard";

interface EffectLink {
  name: string;
  slug: string;
  tags: string[];
}

interface SubcategoryConfig {
  key?: string;
  title?: string;
  tags: string[];
}

interface ParentCategoryCardProps {
  title: string;
  icon: IconName;
  subcategories: SubcategoryConfig[];
  effects: EffectLink[];
  effectHrefPrefix?: string;
  onSelectEffect?: (slug: string) => void;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  contentId?: string;
  titleHref?: string;
  onIconClick?: () => void;
  iconActiveState?: boolean;
  iconActionLabel?: string;
  toggleLabel?: string;
}

/**
 * Hierarchical category card containing subcategory sections.
 * 
 * Used for the "All" tab to display parent categories (Visual Effects,
 * Cognitive Effects, Physical Effects) with nested subcategory sections.
 */
export const ParentCategoryCard = memo(function ParentCategoryCard({
  title,
  icon,
  subcategories,
  effects,
  effectHrefPrefix,
  onSelectEffect,
  expanded,
  onExpandedChange,
  contentId,
  titleHref,
  onIconClick,
  iconActiveState,
  iconActionLabel,
  toggleLabel,
}: ParentCategoryCardProps) {
  // Pre-compute lowercase tags for each effect (cached to avoid repeated toLowerCase calls)
  const effectsWithLowerTags = useMemo(() => {
    return effects.map(effect => ({
      ...effect,
      lowerTags: new Set(effect.tags.map(t => t.toLowerCase())),
    }));
  }, [effects]);

  // Group effects by subcategory
  const subcategoryData = useMemo(() => {
    return subcategories.map(sub => {
      const lowerSubTags = sub.tags.map(tag => tag.toLowerCase());
      const matchingEffects = effectsWithLowerTags.filter(effect =>
        lowerSubTags.every(tag => effect.lowerTags.has(tag))
      );

      return {
        ...sub,
        effects: matchingEffects,
      };
    }).filter(sub => sub.effects.length > 0);
  }, [subcategories, effectsWithLowerTags]);

  // Calculate total effect count
  const totalEffects = useMemo(() => {
    const uniqueSlugs = new Set(subcategoryData.flatMap(sub => sub.effects.map(e => e.slug)));
    return uniqueSlugs.size;
  }, [subcategoryData]);

  if (subcategoryData.length === 0) {
    return null;
  }

  // Check if we have multiple titled subcategories (need visual separation)
  const titledSubcategories = subcategoryData.filter(sub => sub.title);
  const hasMultipleTitledSections = titledSubcategories.length > 1;

  return (
    <IndexCard
      title={title}
      icon={icon}
      count={totalEffects}
      expanded={expanded}
      onExpandedChange={onExpandedChange}
      contentId={contentId}
      titleHref={titleHref}
      onIconClick={onIconClick}
      iconActiveState={iconActiveState}
      iconActionLabel={iconActionLabel}
      toggleLabel={toggleLabel}
    >
      <div className={hasMultipleTitledSections ? "space-y-6" : ""}>
        {subcategoryData.map((sub, idx) => (
          <IndexCardSection
            key={sub.key || sub.title || idx}
            title={sub.title}
            count={sub.effects.length}
            showDivider={hasMultipleTitledSections && idx > 0}
          >
            <IndexCardList>
              {sub.effects.map((effect) => (
                <IndexCardListItem
                  key={effect.slug}
                  label={effect.name}
                  href={effectHrefPrefix ? `${effectHrefPrefix}${effect.slug}` : undefined}
                  slug={effect.slug}
                  onSelect={onSelectEffect}
                />
              ))}
            </IndexCardList>
          </IndexCardSection>
        ))}
      </div>
    </IndexCard>
  );
});
