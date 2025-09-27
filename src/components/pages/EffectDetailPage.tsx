import { PageHeader } from "../sections/PageHeader";
import { CategoryGrid } from "../sections/CategoryGrid";
import type { DosageCategoryGroup, EffectDetail } from "../../data/library";

interface EffectDetailPageProps {
  detail: EffectDetail;
  onSelectDrug: (slug: string) => void;
  onSelectCategory?: (categoryKey: string) => void;
}

export function EffectDetailPage({ detail, onSelectDrug, onSelectCategory }: EffectDetailPageProps) {
  const groups: DosageCategoryGroup[] = detail.groups;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-20 pt-10">
      <PageHeader
        title={detail.definition.name}
        description={`${detail.definition.total} substance${detail.definition.total === 1 ? "" : "s"} are associated with this effect.`}
      />
      {groups.length > 0 ? (
        <CategoryGrid
          groups={groups}
          onSelectDrug={onSelectDrug}
          onSelectCategory={onSelectCategory}
          hideEmptyGroups
        />
      ) : (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center text-sm text-white/70">
          No documented substances currently match this effect.
        </div>
      )}
    </div>
  );
}


