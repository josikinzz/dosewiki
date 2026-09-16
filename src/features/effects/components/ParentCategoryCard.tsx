import { memo } from "react";
import type { IconName } from "@/components/common/Icon";
import {
  IndexCard,
  IndexCardSection,
  IndexCardList,
  IndexCardListItem,
} from "@/components/common/IndexCard";

interface EffectLink {
  name: string;
  slug: string;
}

export interface PreparedParentSubcategory {
  key: string;
  title?: string;
  tags: string[];
  effects: EffectLink[];
  href?: string;
}

interface ParentCategoryCardProps {
  title: string;
  icon: IconName;
  subcategories: PreparedParentSubcategory[];
  totalEffects: number;
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
  totalEffects,
  subcategories,
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
  if (subcategories.length === 0) {
    return null;
  }
  // Check if we have multiple titled subcategories (need visual separation)
  const titledSubcategories = subcategories.filter((sub) => sub.title);
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
        {subcategories.map((sub, idx) => (
          <IndexCardSection
            key={sub.key || sub.title || idx}
            title={sub.title}
            titleHref={sub.href}
            count={sub.effects.length}
            showDivider={hasMultipleTitledSections && idx > 0}
          >
            <IndexCardList>
              {sub.effects.map((effect) => (
                <IndexCardListItem
                  key={effect.slug}
                  label={effect.name}
                  href={
                    effectHrefPrefix
                      ? `${effectHrefPrefix}${effect.slug}`
                      : undefined
                  }
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
