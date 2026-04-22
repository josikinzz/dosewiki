import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Icon } from "@/components/common/Icon";
import { SectionCard } from "@/components/common/SectionCard";
import type { ReviewStatus, SortOrder, SubstanceInfo } from "./types";

const REVIEW_STATUS_META: Record<
  ReviewStatus,
  {
    label: string;
    className: string;
  }
> = {
  needed: {
    label: "Review Needed",
    className: "border-rose-400/30 bg-rose-500/10 text-rose-200/90",
  },
  in_progress: {
    label: "In Progress",
    className: "border-fuchsia-400/30 bg-fuchsia-500/10 text-fuchsia-200/90",
  },
  completed: {
    label: "Completed",
    className: "border-emerald-400/30 bg-emerald-500/10 text-emerald-200/90",
  },
};

type SubstanceEditorSelectionSectionProps = {
  filteredSubstances: SubstanceInfo[];
  onSearchQueryChange: (value: string) => void;
  onSelectSubstance: (slug: string) => void;
  onShowLowPriorityChange: (nextValue: boolean) => void;
  onSortOrderChange: (value: SortOrder) => void;
  searchQuery: string;
  selectedSubstanceSlug: string | null;
  showLowPriority: boolean;
  sortOrder: SortOrder;
  totalSubstances: number;
};

export function SubstanceEditorSelectionSection({
  filteredSubstances,
  onSearchQueryChange,
  onSelectSubstance,
  onShowLowPriorityChange,
  onSortOrderChange,
  searchQuery,
  selectedSubstanceSlug,
  showLowPriority,
  sortOrder,
  totalSubstances,
}: SubstanceEditorSelectionSectionProps) {
  return (
    <SectionCard delay={0.15}>
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-fuchsia-200">
        <Icon icon="lucide:flask-conical" className="h-5 w-5 text-fuchsia-300" size={20} />
        Select Substance
      </h2>
      <div className="mb-3 flex items-center gap-2">
        <div className="flex gap-1">
          <Button
            variant="sortIcon"
            onClick={() => onSortOrderChange("sources-desc")}
            title="Sort by sources (descending)"
            data-active={sortOrder === "sources-desc"}
          >
            <Icon icon="lucide:arrow-up-1-0" className="h-5 w-5" size={20} />
          </Button>
          <Button
            variant="sortIcon"
            onClick={() => onSortOrderChange("sources-asc")}
            title="Sort by sources (ascending)"
            data-active={sortOrder === "sources-asc"}
          >
            <Icon icon="lucide:arrow-down-0-1" className="h-5 w-5" size={20} />
          </Button>
          <Button
            variant="sortIcon"
            onClick={() => onSortOrderChange("alpha-asc")}
            title="Sort alphabetically (A-Z)"
            data-active={sortOrder === "alpha-asc"}
          >
            <Icon icon="lucide:arrow-up-a-z" className="h-5 w-5" size={20} />
          </Button>
          <Button
            variant="sortIcon"
            onClick={() => onSortOrderChange("alpha-desc")}
            title="Sort alphabetically (Z-A)"
            data-active={sortOrder === "alpha-desc"}
          >
            <Icon icon="lucide:arrow-down-z-a" className="h-5 w-5" size={20} />
          </Button>
        </div>
        <Button
          variant={showLowPriority ? "toggleActive" : "toggleInactive"}
          size="pill"
          onClick={() => onShowLowPriorityChange(!showLowPriority)}
          title="Show low-priority substances"
        >
          Low Priority
        </Button>
        <div className="relative flex-1">
          <Icon icon="lucide:search" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" size={16} />
          <Input
            type="text"
            value={searchQuery}
            onChange={(event) => onSearchQueryChange(event.target.value)}
            placeholder="Search substances..."
            className="pl-10"
          />
        </div>
      </div>
      <div className="max-h-64 overflow-y-auto rounded-xl border border-white/10 bg-slate-950/40">
        {filteredSubstances.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-white/40">
            No substances found
          </div>
        ) : (
          filteredSubstances.map((substance) => (
            <Button
              key={substance.slug}
              variant="substanceListItem"
              className="justify-between gap-3"
              onClick={() => onSelectSubstance(substance.slug)}
              data-active={selectedSubstanceSlug === substance.slug}
            >
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <span className="truncate font-medium">{substance.name}</span>
                <span className="shrink-0 text-xs text-white/40">
                  ({substance.sources.length} sources)
                </span>
              </div>
              <Badge
                variant="secondary"
                className={REVIEW_STATUS_META[substance.reviewStatus].className}
              >
                {REVIEW_STATUS_META[substance.reviewStatus].label}
              </Badge>
            </Button>
          ))
        )}
      </div>
      <p className="mt-2 text-xs text-white/40">
        {totalSubstances} substances available
      </p>
    </SectionCard>
  );
}
