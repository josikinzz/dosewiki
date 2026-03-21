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
}: EffectCategoryCardProps) {
  if (effects.length === 0) {
    return null;
  }

  return (
    <IndexCard title={title} icon={icon} count={effects.length}>
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
