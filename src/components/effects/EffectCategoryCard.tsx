import type { IconName } from "../common/Icon";
import { IndexCard, IndexCardList, IndexCardListItem } from "../common/IndexCard";

interface EffectLink {
  name: string;
  slug: string;
}

interface EffectCategoryCardProps {
  title: string;
  icon: IconName;
  effects: EffectLink[];
  onSelectEffect: (slug: string) => void;
}

/**
 * Category card showing effects within a category.
 */
export function EffectCategoryCard({
  title,
  icon,
  effects,
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
            onClick={() => onSelectEffect(effect.slug)}
          />
        ))}
      </IndexCardList>
    </IndexCard>
  );
}
