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
          <button
            key={effect.slug}
            onClick={() => onSelectEffect(effect.slug)}
            className="px-2 py-0.5 text-xs rounded-full bg-white/5 text-white/70 hover:bg-fuchsia-500/20 hover:text-white transition-colors cursor-pointer"
          >
            {effect.name}
          </button>
        ))}
      </div>
    </div>
  );
}
