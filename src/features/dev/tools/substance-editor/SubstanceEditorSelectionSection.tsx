import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Icon } from "@/components/common/Icon";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  EditorListItem,
  EditorSection,
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

const SORT_OPTIONS: Array<{ value: SortOrder; label: string; description: string }> = [
  {
    value: "alpha-asc",
    label: "A-Z",
    description: "Browse substances alphabetically.",
  },
  {
    value: "alpha-desc",
    label: "Z-A",
    description: "Browse substances in reverse alphabetical order.",
  },
];

type SubstanceEditorSelectionSectionProps = {
  filteredSubstances: SubstanceInfo[];
  onSearchQueryChange: (value: string) => void;
  onSelectSubstance: (slug: string) => void;
  onShowDirectUrlOnlyChange: (nextValue: boolean) => void;
  onSortOrderChange: (value: SortOrder) => void;
  searchQuery: string;
  selectedSubstanceSlug: string | null;
  showDirectUrlOnly: boolean;
  sortOrder: SortOrder;
  totalSubstances: number;
};

export function SubstanceEditorSelectionSection({
  filteredSubstances,
  onSearchQueryChange,
  onSelectSubstance,
  onShowDirectUrlOnlyChange,
  onSortOrderChange,
  searchQuery,
  selectedSubstanceSlug,
  showDirectUrlOnly,
  sortOrder,
  totalSubstances,
}: SubstanceEditorSelectionSectionProps) {
  return (
    <EditorSection
      icon="lucide:flask-conical"
      title="Select Substance"
      description="Choose an article to inspect or edit."
      actions={
        <EditorStatusPill tone="neutral">
          {filteredSubstances.length} shown
        </EditorStatusPill>
      }
      delay={0.15}
    >
      <div className="grid gap-3 lg:grid-cols-[minmax(12rem,16rem)_auto_minmax(16rem,1fr)] lg:items-end">
        <div className="space-y-1.5">
          <label htmlFor="articles-substance-sort" className="theme-text-muted text-xs font-medium uppercase tracking-wide">
            Sort
          </label>
          <Select value={sortOrder} onValueChange={(value) => onSortOrderChange(value as SortOrder)}>
            <SelectTrigger id="articles-substance-sort" selectSize="compact">
              {/* Label-only trigger: the two-line item markup clips in the fixed-height control */}
              <SelectValue>
                {SORT_OPTIONS.find((option) => option.value === sortOrder)?.label}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  <div className="flex flex-col items-start">
                    <span className="font-medium">{option.label}</span>
                    <span className="theme-text-muted text-xs">{option.description}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          variant={showDirectUrlOnly ? "toggleActive" : "toggleInactive"}
          size="pill"
          onClick={() => onShowDirectUrlOnlyChange(!showDirectUrlOnly)}
          title="Show direct-URL-only substances"
          className="justify-self-start lg:mb-1"
        >
          Include URL-only
        </Button>
        <div className="relative">
          <label htmlFor="articles-substance-search" className="sr-only">
            Search substances
          </label>
          <Icon icon="lucide:search" className="theme-text-faint absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" size={16} />
          <Input
            id="articles-substance-search"
            type="text"
            value={searchQuery}
            onChange={(event) => onSearchQueryChange(event.target.value)}
            placeholder="Search by name or slug..."
            className="pl-10"
          />
        </div>
      </div>
      <div className="max-h-[24rem] space-y-1.5 overflow-y-auto rounded-xl border border-[var(--theme-border-subtle)] bg-[var(--theme-surface-deep)] p-1.5">
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
                <span className="theme-text-primary truncate font-medium">{substance.name}</span>
              </EditorListItem>
            );
          })
        )}
      </div>
      <p className="theme-text-faint text-xs">
        {totalSubstances} substances available
      </p>
    </EditorSection>
  );
}
