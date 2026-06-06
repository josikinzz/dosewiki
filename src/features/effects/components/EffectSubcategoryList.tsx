import { PublicNameChip } from "@/components/common/PublicTokens";

interface EffectLink {
  name: string;
  slug: string;
}

interface EffectSubcategoryListProps {
  title: string;
  effects: EffectLink[];
  onSelectEffect: (slug: string) => void;
}

/**
 * Subcategory list within a category card.
 */
export function EffectSubcategoryList({
  title,
  effects,
  onSelectEffect,
}: EffectSubcategoryListProps) {
  if (effects.length === 0) {
    return null;
  }

  return (
    <div className="mb-3 last:mb-0">
      <h4 className="text-xs font-medium text-white/50 uppercase tracking-wider mb-2">
        {title}
      </h4>
      <div className="flex flex-wrap gap-1.5">
        {effects.map((effect) => (
          <PublicNameChip
            as="button"
            type="button"
            key={effect.slug}
            onClick={() => onSelectEffect(effect.slug)}
            interactive
          >
            {effect.name}
          </PublicNameChip>
        ))}
      </div>
    </div>
  );
}
