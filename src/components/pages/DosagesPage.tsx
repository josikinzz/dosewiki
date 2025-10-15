import { memo, useMemo, useState } from "react";
import { BrainCircuit, Cog, FlaskConical, Hexagon } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { PageHeader } from "../sections/PageHeader";
import { CategoryGrid } from "../sections/CategoryGrid";
import type { DosageCategoryGroup } from "../../data/library";
import {
  chemicalClassIndexGroups,
  mechanismIndexGroups,
  substanceRecords,
} from "../../data/library";

type IndexSortKey = "psychoactive" | "chemical" | "mechanism";

interface SortOption {
  key: IndexSortKey;
  label: string;
  icon: LucideIcon;
}

const SORT_OPTIONS: SortOption[] = [
  {
    key: "psychoactive",
    label: "Psychoactive class",
    icon: BrainCircuit,
  },
  {
    key: "chemical",
    label: "Chemical class",
    icon: Hexagon,
  },
  {
    key: "mechanism",
    label: "Mechanism of action",
    icon: Cog,
  },
];

interface DosagesPageProps {
  groups: DosageCategoryGroup[];
  onSelectDrug: (slug: string) => void;
  onSelectCategory?: (categoryKey: string) => void;
}

export const DosagesPage = memo(function DosagesPage({ groups, onSelectDrug, onSelectCategory }: DosagesPageProps) {
  const [sortKey, setSortKey] = useState<IndexSortKey>("psychoactive");

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
    <div className="mx-auto w-full px-4 pb-20 pt-10 2xl:px-8">
      <div className="mx-auto max-w-3xl md:max-w-4xl">
        <PageHeader
          title="Substance Index"
          icon={FlaskConical}
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
        <div className="mt-10 mb-8">
          <p className="text-xs uppercase tracking-wide text-white/50">Sort index by</p>
          <div className="mt-4 flex flex-wrap items-center gap-3 sm:justify-center">
            {SORT_OPTIONS.map((option) => {
              const isActive = option.key === sortKey;
              const Icon = option.icon;

              return (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setSortKey(option.key)}
                  className={
                    isActive
                      ? "group inline-flex items-center gap-2 rounded-full bg-gradient-to-tr from-fuchsia-500/25 via-fuchsia-500/10 to-white/10 px-5 py-2.5 text-sm font-medium text-white shadow-[0_18px_40px_-24px_rgba(155,65,255,0.6)] ring-1 ring-fuchsia-300/60 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400"
                      : "group inline-flex items-center gap-2 rounded-full bg-gradient-to-tr from-white/12 via-white/5 to-white/0 px-5 py-2.5 text-sm font-medium text-white/75 ring-1 ring-white/15 transition hover:text-white hover:ring-white/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400"
                  }
                  aria-pressed={isActive}
                >
                  <Icon
                    className={
                      isActive
                        ? "h-5 w-5 text-fuchsia-100 drop-shadow"
                        : "h-5 w-5 text-fuchsia-200/70"
                    }
                    aria-hidden="true"
                    focusable="false"
                  />
                  <span className={isActive ? "tracking-wide text-white" : "tracking-wide text-white/80"}>
                    {option.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <CategoryGrid
        groups={resolvedGroups}
        onSelectDrug={onSelectDrug}
        onSelectCategory={sortKey === "psychoactive" ? onSelectCategory : undefined}
      />
    </div>
  );
});
