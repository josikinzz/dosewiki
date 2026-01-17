import { memo, useMemo, useState } from "react";
import { Icon, type IconName } from "../common/Icon";
import { PageHeader } from "../layout/PageHeader";
import { CategoryGrid } from "../sections/CategoryGrid";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { DosageCategoryGroup } from "../../data/builders/library";
import { useLibrary } from "../../data/ArticlesProvider";

type IndexSortKey = "psychoactive" | "chemical" | "mechanism";

interface SortOption {
  key: IndexSortKey;
  label: string;
  icon: IconName;
}

const SORT_OPTIONS: SortOption[] = [
  {
    key: "psychoactive",
    label: "Psychoactive class",
    icon: "lucide:brain-circuit",
  },
  {
    key: "chemical",
    label: "Chemical class",
    icon: "lucide:hexagon",
  },
  {
    key: "mechanism",
    label: "Mechanism of action",
    icon: "lucide:cog",
  },
];

interface DosagesPageProps {
  groups: DosageCategoryGroup[];
  onSelectDrug: (slug: string) => void;
  onSelectCategory?: (categoryKey: string) => void;
}

export const DosagesPage = memo(function DosagesPage({ groups, onSelectDrug, onSelectCategory }: DosagesPageProps) {
  const [sortKey, setSortKey] = useState<IndexSortKey>("psychoactive");
  const { chemicalClassIndexGroups, mechanismIndexGroups, substanceRecords } = useLibrary();

  const compoundCount = substanceRecords.length;
  const psychoactiveClassCount = groups.length;
  const chemicalClassCount = chemicalClassIndexGroups.length;
  const mechanismCount = mechanismIndexGroups.length;

  const formatLabel = (count: number, singular: string, plural: string) =>
    `${count} ${count === 1 ? singular : plural}`;

  const resolvedGroups = useMemo(() => {
    if (sortKey === "chemical") {
      return chemicalClassIndexGroups;
    }
    if (sortKey === "mechanism") {
      return mechanismIndexGroups;
    }
    return groups;
  }, [groups, sortKey]);

  return (
    <div className="mx-auto w-full px-4 pb-20 pt-12 2xl:px-8">
      <div className="mx-auto max-w-3xl md:max-w-4xl">
        <PageHeader
          title="Substance Index"
          icon="lucide:flask-conical"
          description={
            <>
              Browse
              {" "}
              <span className="font-semibold text-fuchsia-200">
                {formatLabel(compoundCount, "compound", "compounds")}
              </span>
              {" "}
              and organize them across
              {" "}
              <span className="font-semibold text-fuchsia-200">
                {formatLabel(psychoactiveClassCount, "psychoactive class", "psychoactive classes")}
              </span>
              ,
              {" "}
              <span className="font-semibold text-fuchsia-200">
                {formatLabel(chemicalClassCount, "chemical class", "chemical classes")}
              </span>
              , and
              {" "}
              <span className="font-semibold text-fuchsia-200">
                {formatLabel(mechanismCount, "mechanism of action", "mechanisms of action")}
              </span>
              .
              {" "}
              Open any entry to explore detailed dosage tables, durational timelines, psychopharmacological data, and general harm reduction information.
            </>
          }
        />
        {/* Sort Tabs */}
        <Tabs value={sortKey} onValueChange={(v) => setSortKey(v as IndexSortKey)} className="mt-8 mb-8 flex justify-center">
          <TabsList className="flex-wrap">
            {SORT_OPTIONS.map((option) => (
              <TabsTrigger key={option.key} value={option.key} className="gap-2">
                <Icon icon={option.icon} size={16} />
                {option.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>
      <CategoryGrid
        groups={resolvedGroups}
        onSelectDrug={onSelectDrug}
        onSelectCategory={sortKey === "psychoactive" ? onSelectCategory : undefined}
      />
    </div>
  );
});
