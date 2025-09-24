import { memo } from "react";
import { PageHeader } from "../sections/PageHeader";
import { CategoryGrid } from "../sections/CategoryGrid";
import type { DosageCategoryGroup } from "../../data/library";

interface DosagesPageProps {
  groups: DosageCategoryGroup[];
  onSelectDrug: (slug: string) => void;
  onSelectCategory?: (categoryKey: string) => void;
}

export const DosagesPage = memo(function DosagesPage({ groups, onSelectDrug, onSelectCategory }: DosagesPageProps) {
  return (
    <div className="mx-auto w-full px-4 pb-20 pt-10 2xl:px-8">
      <PageHeader
        title="Substances"
        description="Explore the dose.wiki catalog by pharmacological class. Select a category to review its compounds, then jump into an individual profile for route-by-route dosage, duration, and interaction guidance."
      />
      <CategoryGrid groups={groups} onSelectDrug={onSelectDrug} onSelectCategory={onSelectCategory} />
    </div>
  );
});

