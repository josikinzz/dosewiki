import { PageHeader } from "@/components/layout/PageHeader";
import { CategoryGrid } from "@/features/article/components/sections/CategoryGrid";
import type { DosageCategoryGroup, EffectDetail } from "@/data/builders/library";
import { icons } from "@/utils/iconNames";

interface EffectDetailPageProps {
  detail: EffectDetail;
  drugHrefPrefix?: string;
  categoryHrefPrefix?: string;
}

export function EffectDetailPage({ detail, drugHrefPrefix, categoryHrefPrefix }: EffectDetailPageProps) {
  const groups: DosageCategoryGroup[] = detail.groups;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-20 pt-12">
      <PageHeader
        title={detail.definition.name}
        icon={icons.subjectiveEffectIndex}
        description={`${detail.definition.total} substance${detail.definition.total === 1 ? "" : "s"} are associated with this effect.`}
      />
      {groups.length > 0 ? (
        <CategoryGrid
          groups={groups}
          drugHrefPrefix={drugHrefPrefix}
          categoryHrefPrefix={categoryHrefPrefix}
          hideEmptyGroups
        />
      ) : (
        <div className="theme-card-surface rounded-2xl border p-6 text-center text-sm">
          No documented substances currently match this effect.
        </div>
      )}
    </div>
  );
}
