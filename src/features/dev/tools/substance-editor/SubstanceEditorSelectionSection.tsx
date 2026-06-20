import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Icon } from "@/components/common/Icon";
import { SectionCard } from "@/components/common/SectionCard";
import {
  EditorListItem,
  EditorStatusPill,
  type EditorStatusPillTone,
} from "@/features/dev/components";
import type { ReviewStatus, SortOrder, SubstanceInfo } from "./types";

const REVIEW_STATUS_META: Record<
  ReviewStatus,
  {
    label: string;
    tone: EditorStatusPillTone;
  }
> = {
  needed: { label: "Review Needed", tone: "danger" },
  in_progress: { label: "In Progress", tone: "warning" },
  completed: { label: "Completed", tone: "success" },
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
  const sortToggleClassName =
    "theme-text-muted rounded-lg p-2 transition hover:bg-[var(--theme-frosted-control-on-panel-hover-bg)] hover:text-[color:var(--theme-text-primary)] data-[active=true]:border data-[active=true]:border-[color:var(--theme-article-route-active-border)] data-[active=true]:bg-[var(--theme-article-route-active-bg)] data-[active=true]:text-[color:var(--theme-article-route-active-text)]";

  return (
    <SectionCard delay={0.15}>
      <h2 className="theme-accent-heading mb-4 flex items-center gap-2 text-lg font-semibold">
        <Icon icon="lucide:flask-conical" className="theme-icon-accent h-5 w-5" size={20} />
        Select Substance
      </h2>
      <div className="mb-3 flex items-center gap-2">
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="auto"
            className={sortToggleClassName}
            onClick={() => onSortOrderChange("sources-desc")}
            title="Sort by sources (descending)"
            data-active={sortOrder === "sources-desc"}
          >
            <Icon icon="lucide:arrow-up-1-0" className="h-5 w-5" size={20} />
          </Button>
          <Button
            variant="ghost"
            size="auto"
            className={sortToggleClassName}
            onClick={() => onSortOrderChange("sources-asc")}
            title="Sort by sources (ascending)"
            data-active={sortOrder === "sources-asc"}
          >
            <Icon icon="lucide:arrow-down-0-1" className="h-5 w-5" size={20} />
          </Button>
          <Button
            variant="ghost"
            size="auto"
            className={sortToggleClassName}
            onClick={() => onSortOrderChange("alpha-asc")}
            title="Sort alphabetically (A-Z)"
            data-active={sortOrder === "alpha-asc"}
          >
            <Icon icon="lucide:arrow-up-a-z" className="h-5 w-5" size={20} />
          </Button>
          <Button
            variant="ghost"
            size="auto"
            className={sortToggleClassName}
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
          <Icon icon="lucide:search" className="theme-text-faint absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" size={16} />
          <Input
            type="text"
            value={searchQuery}
            onChange={(event) => onSearchQueryChange(event.target.value)}
            placeholder="Search substances..."
            className="pl-10"
          />
        </div>
      </div>
      <div className="max-h-64 space-y-1.5 overflow-y-auto rounded-xl border border-[var(--theme-border-subtle)] bg-[var(--theme-surface-deep)] p-1.5">
        {filteredSubstances.length === 0 ? (
          <div className="theme-text-faint px-4 py-8 text-center text-sm">
            No substances found
          </div>
        ) : (
          filteredSubstances.map((substance) => {
            const statusMeta = REVIEW_STATUS_META[substance.reviewStatus];
            return (
              <EditorListItem
                key={substance.slug}
                active={selectedSubstanceSlug === substance.slug}
                onSelect={() => onSelectSubstance(substance.slug)}
                badge={
                  <EditorStatusPill tone={statusMeta.tone}>
                    {statusMeta.label}
                  </EditorStatusPill>
                }
              >
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <span className="theme-text-primary truncate font-medium">{substance.name}</span>
                  <span className="theme-text-faint shrink-0 text-xs">
                    ({substance.sources.length} sources)
                  </span>
                </div>
              </EditorListItem>
            );
          })
        )}
      </div>
      <p className="theme-text-faint mt-2 text-xs">
        {totalSubstances} substances available
      </p>
    </SectionCard>
  );
}
