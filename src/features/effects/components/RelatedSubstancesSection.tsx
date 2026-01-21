import { IconBadge } from "@/components/common/IconBadge";
import { CategoryGrid } from "@/features/article/components/sections";
import type { DosageCategoryGroup } from "@/data/builders/library";

interface RelatedSubstancesSectionProps {
  groups: DosageCategoryGroup[];
  total: number;
  onSelectDrug: (slug: string) => void;
  onSelectCategory?: (categoryKey: string) => void;
}

/**
 * Related substances section for effect articles.
 * Shows substances that have this effect.
 */
export function RelatedSubstancesSection({ 
  groups,
  total,
  onSelectDrug,
  onSelectCategory,
}: RelatedSubstancesSectionProps) {
  if (groups.length === 0) {
    return null;
  }

  return (
    <div>
      <h2 className="mb-4 flex items-center gap-3 text-lg font-semibold text-fuchsia-300">
        <IconBadge icon="lucide:flask-conical" label="Related Substances" />
        Related Substances
        <span className="ml-2 text-sm font-normal text-white/50">
          ({total})
        </span>
      </h2>
      <CategoryGrid
        groups={groups}
        onSelectDrug={onSelectDrug}
        onSelectCategory={onSelectCategory}
        hideEmptyGroups
      />
    </div>
  );
}
