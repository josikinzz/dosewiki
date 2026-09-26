"use client";

/**
 * The Substances list column: which articles (Listed, Your work, All), their
 * review state, a search with its `/` key, the order, and the windowed
 * listbox of articles. Each row names the article, its review state and the
 * member's own work on it (a saved draft, a proposal waiting or returned);
 * the open row says "Editing" and carries the unsaved dot. Sticky from `lg`,
 * sized to the viewport so the article beside it stays in view.
 */
import { type RefObject } from "react";

import { Icon } from "@/components/common/Icon";
import { HighlightedText } from "@/components/common/HighlightedText";
import { Button } from "@/components/ui/button";
import { EditorList, EditorListRow, EditorSelect, EditorStatusPill } from "@/features/dev/components";
import { ChoiceGrid, SearchField } from "@/features/dev/tools/glossary/workbenchParts";
import { cn } from "@/lib/utils";
import {
  describeListCount,
  describeWork,
  REVIEW_STATES,
  REVIEW_STATUS_META,
  VIEW_LABELS,
  type ReviewFilter,
  type SortOrder,
  type SubstanceRow,
  type SubstanceView,
} from "./substanceListModel";

export type SubstanceListColumnProps = {
  rows: SubstanceRow[];
  total: number;
  viewCounts: Record<SubstanceView, number>;
  reviewCounts: Record<ReviewFilter, number>;
  /** False while the member's drafts and proposals are loading or failed: Your work has no count yet. */
  workKnown: boolean;
  workError: string | null;
  onRetryWork: () => void;
  view: SubstanceView;
  onViewChange: (view: SubstanceView) => void;
  review: ReviewFilter;
  onReviewChange: (review: ReviewFilter) => void;
  order: SortOrder;
  onOrderChange: (order: SortOrder) => void;
  query: string;
  onQueryChange: (query: string) => void;
  searchRef: RefObject<HTMLInputElement | null>;
  selected: string | null;
  /** The open article's name, when it is known, for the hidden-by-filter line. */
  selectedName: string | null;
  /** Whether the open article's row is in `rows`. */
  selectedShown: boolean;
  dirty: boolean;
  onSelect: (slug: string) => void;
  /** A deep link named no article. */
  missingSlug: string | null;
  onDismissMissing: () => void;
};

export function SubstanceListColumn({
  rows,
  total,
  viewCounts,
  reviewCounts,
  workKnown,
  workError,
  onRetryWork,
  view,
  onViewChange,
  review,
  onReviewChange,
  order,
  onOrderChange,
  query,
  onQueryChange,
  searchRef,
  selected,
  selectedName,
  selectedShown,
  dirty,
  onSelect,
  missingSlug,
  onDismissMissing,
}: SubstanceListColumnProps) {
  const filtered = !!query.trim() || review !== "any" || view !== "listed";
  const resetFilters = () => {
    onQueryChange("");
    onReviewChange("any");
    onViewChange("all");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="type-meta-label theme-text-muted">Articles</h3>
        <p className="theme-text-faint text-xs tabular-nums" aria-live="polite">
          {describeListCount(rows.length, total, filtered)}
        </p>
      </div>

      <ChoiceGrid
        label="Which articles"
        columns={3}
        value={view}
        onChange={onViewChange}
        choices={(["listed", "mine", "all"] as const).map((value) => ({
          value,
          label: VIEW_LABELS[value],
          count: value === "mine" && !workKnown ? null : viewCounts[value],
        }))}
      />
      {view === "all" ? (
        <p className="theme-text-faint text-xs">All includes articles readers reach only by their address.</p>
      ) : view === "mine" ? (
        <p className="theme-text-faint text-xs">Your saved drafts and your proposals still open.</p>
      ) : null}
      {workError ? (
        <p role="status" className="theme-text-muted flex flex-wrap items-center gap-x-2 text-xs">
          <Icon icon="lucide:triangle-alert" size={13} className="theme-warning-text shrink-0" />
          Your drafts and proposals could not be marked.
          <Button type="button" variant="link" size="quiet" className="h-auto p-0 text-xs" onClick={onRetryWork}>
            Try again
          </Button>
        </p>
      ) : null}

      <SearchField
        ref={searchRef}
        label="Find a substance"
        value={query}
        onChange={onQueryChange}
        placeholder="Name or address"
      />

      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
        <div className="min-w-0 space-y-1">
          <label htmlFor="substances-review-filter" className="theme-text-muted block text-xs font-medium">Review</label>
          <EditorSelect
            id="substances-review-filter"
            selectSize="sm"
            value={review}
            onChange={(event) => onReviewChange(event.target.value as ReviewFilter)}
            options={[
              { value: "any", label: `Any state (${reviewCounts.any})` },
              ...REVIEW_STATES.map((state) => ({ value: state, label: `${REVIEW_STATUS_META[state].label} (${reviewCounts[state]})` })),
            ]}
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="substances-order" className="theme-text-muted block text-xs font-medium">Order</label>
          <EditorSelect
            id="substances-order"
            selectSize="sm"
            value={order}
            onChange={(event) => onOrderChange(event.target.value as SortOrder)}
            options={[
              { value: "alpha-asc", label: "A to Z" },
              { value: "alpha-desc", label: "Z to A" },
            ]}
            className="w-28"
          />
        </div>
      </div>

      {missingSlug ? (
        <p role="status" className="theme-text-muted text-sm">
          No article is stored at “{missingSlug}”. It may have been renamed or removed.{" "}
          <Button type="button" variant="link" size="quiet" className="h-auto p-0 text-sm" onClick={onDismissMissing}>
            Dismiss
          </Button>
        </p>
      ) : null}

      {total === 0 ? (
        <p className="theme-text-muted text-sm">No substance articles are stored yet. They arrive with the article import.</p>
      ) : rows.length === 0 ? (
        <div className="space-y-2">
          <p className="theme-text-muted text-sm">
            {query.trim()
              ? `No article matches “${query.trim()}” here.`
              : view === "mine"
                ? "You have no saved drafts or open proposals. Open an article and save a draft to see it here."
                : "No article is in this state here."}
          </p>
          <div className="flex flex-wrap gap-x-3">
            {query.trim() ? (
              <Button type="button" variant="link" size="quiet" onClick={() => onQueryChange("")}>
                Clear the search
              </Button>
            ) : null}
            {review !== "any" || view !== "all" ? (
              <Button type="button" variant="link" size="quiet" onClick={resetFilters}>
                Show everything
              </Button>
            ) : null}
          </div>
        </div>
      ) : (
        <EditorList
          label="Substances"
          items={rows}
          getKey={(row) => row.slug}
          selectedKey={selected}
          onSelect={onSelect}
          estimateRowHeight={64}
          maxHeight="min(calc(100dvh - 27rem), 640px)"
          emptyText="No substances found"
          renderItem={(row, { selected: isOpen }) => (
            <SubstanceRowView row={row} open={isOpen} dirty={isOpen && dirty} query={query.trim()} />
          )}
        />
      )}

      {selected && selectedName && !selectedShown && total > 0 ? (
        <p className="theme-text-muted text-xs">
          Your filters hide {selectedName} from the list.{" "}
          <Button type="button" variant="link" size="quiet" className="h-auto p-0 text-xs" onClick={resetFilters}>
            Show it
          </Button>
        </p>
      ) : null}

      {rows.length > 0 ? (
        <p className="theme-text-faint hidden text-xs [@media(pointer:fine)]:block">
          <kbd className="theme-dev-kbd">↑</kbd> <kbd className="theme-dev-kbd">↓</kbd> move,{" "}
          <kbd className="theme-dev-kbd">/</kbd> search, <kbd className="theme-dev-kbd">?</kbd> every key
        </p>
      ) : null}
    </div>
  );
}

function SubstanceRowView({ row, open, dirty, query }: { row: SubstanceRow; open: boolean; dirty: boolean; query: string }) {
  const status = REVIEW_STATUS_META[row.reviewStatus] ?? REVIEW_STATUS_META.needed;
  const work = describeWork(row.work);
  return (
    <EditorListRow active={open} className="h-[3.75rem] overflow-hidden py-2" data-substance-slug={row.slug}>
      <span className="min-w-0 flex-1 space-y-0.5">
        <span className="flex items-baseline justify-between gap-2">
          <span className={cn("min-w-0 truncate text-sm font-medium", open ? "theme-accent-heading" : "theme-text-primary")}>
            {query ? <HighlightedText text={row.name} query={query} /> : row.name}
          </span>
          <span className="flex shrink-0 items-center gap-1.5 text-xs">
            {open ? (
              <span className="text-dose-accent-strong flex items-center gap-1.5 font-medium">
                <span className="sr-only">, </span>
                {dirty ? <span aria-hidden className="theme-dev-unsaved-dot inline-block size-1.5 rounded-full" /> : null}
                {dirty ? "Editing, unsaved" : "Editing"}
              </span>
            ) : null}
            <EditorStatusPill tone={status.tone} inline>
              <span className="sr-only">, </span>
              {status.label}
            </EditorStatusPill>
          </span>
        </span>
        <span className="theme-text-faint flex min-w-0 items-center gap-x-2 truncate text-xs">
          <span className="sr-only">, </span>
          <span className="truncate font-mono">{query ? <HighlightedText text={row.slug} query={query} /> : row.slug}</span>
          {work ? (
            <span className={cn("flex shrink-0 items-center gap-1", work.tone === "warning" ? "theme-warning-text" : "theme-text-muted")}>
              <span className="sr-only">, </span>
              <Icon icon={work.icon} size={12} aria-hidden />
              {work.label}
            </span>
          ) : null}
          {row.directUrlOnly ? (
            <span className="flex shrink-0 items-center gap-1">
              <span className="sr-only">, </span>
              <Icon icon="lucide:eye-off" size={12} aria-hidden />
              Address only
            </span>
          ) : null}
        </span>
      </span>
    </EditorListRow>
  );
}
