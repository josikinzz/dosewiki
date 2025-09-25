import { PageHeader } from "../sections/PageHeader";
import { CategoryGrid } from "../sections/CategoryGrid";
import type { DosageCategoryGroup, MechanismDetail } from "../../data/library";

interface MechanismDetailPageProps {
  detail: MechanismDetail;
  onSelectDrug: (slug: string) => void;
  onSelectCategory?: (categoryKey: string) => void;
}

export function MechanismDetailPage({ detail, onSelectDrug, onSelectCategory }: MechanismDetailPageProps) {
  const groups: DosageCategoryGroup[] = detail.groups;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-20 pt-10">
      <PageHeader
        title={detail.definition.name}
        description={`${detail.definition.total} substance${detail.definition.total === 1 ? "" : "s"} share this mechanism of action.`}
      />
      {groups.length > 0 ? (
        <CategoryGrid groups={groups} onSelectDrug={onSelectDrug} onSelectCategory={onSelectCategory} />
      ) : (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center text-sm text-white/70">
          No documented substances currently match this mechanism of action.
        </div>
      )}
    </div>
  );
}
