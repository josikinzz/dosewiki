import { IconBadge } from "@/components/common/IconBadge";
import { CategoryGrid } from "@/features/article/components/sections";
import type { DosageCategoryGroup } from "@/data/builders/library";

interface RelatedSubstancesSectionProps {
  groups: DosageCategoryGroup[];
  total: number;
  drugHrefPrefix?: string;
  categoryHrefPrefix?: string;
  onSelectDrug?: (slug: string) => void;
  onSelectCategory?: (categoryKey: string) => void;
  showHeading?: boolean;
}

/**
 * Related substances section for effect articles.
 * Shows substances that have this effect.
 */
export function RelatedSubstancesSection({ 
  groups,
  total,
  drugHrefPrefix,
  categoryHrefPrefix,
  onSelectDrug,
  onSelectCategory,
  showHeading = true,
}: RelatedSubstancesSectionProps) {
  if (groups.length === 0) {
    return null;
  }

  return (
    <div>
      {showHeading ? (
        <h2 className="mb-4 flex items-center gap-3 text-lg font-semibold text-fuchsia-300">
          <IconBadge icon="lucide:flask-conical" label="Related Substances" />
          Related Substances
          <span className="ml-2 text-sm font-normal text-white/50">
            ({total})
          </span>
        </h2>
      ) : (
        <p className="theme-text-secondary mb-4 text-sm">
          {total} substance{total === 1 ? "" : "s"} currently linked to this effect.
        </p>
      )}
      <CategoryGrid
        groups={groups}
        drugHrefPrefix={drugHrefPrefix}
        categoryHrefPrefix={categoryHrefPrefix}
        onSelectDrug={onSelectDrug}
        onSelectCategory={onSelectCategory}
        hideEmptyGroups
        maxColumns={2}
      />
    </div>
  );
}
