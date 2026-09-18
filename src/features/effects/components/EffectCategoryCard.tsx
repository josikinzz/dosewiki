import type { IconName } from "@/components/common/Icon";
import { IndexCard, IndexCardList, IndexCardListItem } from "@/components/common/IndexCard";

interface EffectLink {
  name: string;
  slug: string;
}

interface EffectCategoryCardProps {
  title: string;
  icon: IconName;
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
 * Category card showing effects within a category.
 */
export function EffectCategoryCard({
  title,
  icon,
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
}: EffectCategoryCardProps) {
  if (effects.length === 0) {
    return null;
  }

  return (
    <IndexCard
      title={title}
      icon={icon}
      count={effects.length}
      expanded={expanded}
      onExpandedChange={onExpandedChange}
      contentId={contentId}
      titleHref={titleHref}
      onIconClick={onIconClick}
      iconActiveState={iconActiveState}
      iconActionLabel={iconActionLabel}
      toggleLabel={toggleLabel}
    >
      <IndexCardList>
        {effects.map((effect) => (
          <IndexCardListItem
            key={effect.slug}
            label={effect.name}
            href={effectHrefPrefix ? `${effectHrefPrefix}${effect.slug}` : undefined}
            slug={effect.slug}
            onSelect={onSelectEffect}
          />
        ))}
      </IndexCardList>
    </IndexCard>
  );
}
