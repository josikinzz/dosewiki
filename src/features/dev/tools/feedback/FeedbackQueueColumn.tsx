"use client";

import type { ReactNode, RefObject } from "react";

import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TOUCH_HALO_Y } from "@/components/ui/touchTargets";
import { EditorList, EditorListRow, EditorSelect, EditorStatusPill, Notice } from "@/features/dev/components";
import { describeDay } from "@/features/dev/tools/home/homeModel";
import { formatReviewerIdentity } from "@/features/dev/tools/reviewerIdentity";
import { cn } from "@/lib/utils";

import type { FeedbackImportance, FeedbackQueueFilter, FeedbackQueueItem } from "./FeedbackReviewQueue";
import { FEEDBACK_PAGE_SIZE, totalFor, type QueueSort, type StatusCounts } from "./feedbackQueueModel";
import {
  FEEDBACK_FILTER_ORDER,
  FEEDBACK_STATUS_LABELS,
  IMPORTANCE_PILL_TONE,
  IMPORTANCE_WORD,
  STATUS_PILL_TONE,
  describeFilterCount,
  filterSpansStatuses,
  type EmptyQueue,
  type FeedbackHold,
} from "./feedbackReviewModel";

export const SORT_LABELS: Record<QueueSort, string> = {
  oldest: "Oldest first",
  newest: "Newest first",
  importance: "By importance",
};

export function FeedbackStatusChoices({
  value,
  counts,
  onChange,
}: {
  value: FeedbackQueueFilter;
  counts: StatusCounts | null;
  onChange: (filter: FeedbackQueueFilter) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Status"
      className="grid grid-cols-4 gap-1 rounded-card border border-[color:var(--editor-panel-border)] bg-[var(--editor-panel-bg-subtle)] p-1"
    >
      {FEEDBACK_FILTER_ORDER.map((filter) => {
        const selected = filter === value;
        return (
          <Button
            key={filter}
            type="button"
            variant={selected ? "pillActive" : "ghostPill"}
            size="pill"
            aria-pressed={selected}
            onClick={() => onChange(filter)}
            className={cn(
              "h-auto min-h-9 w-full min-w-0 flex-col gap-0 rounded-control px-1 py-1 leading-tight [@media(pointer:coarse)]:min-h-11",
              TOUCH_HALO_Y,
            )}
          >
            <span className="max-w-full truncate text-xs font-medium">{FEEDBACK_STATUS_LABELS[filter]}</span>
            {counts ? (
              <span className={cn("text-xs tabular-nums", selected ? "opacity-80" : "theme-text-faint")}>
                <span className="sr-only">,</span> {totalFor(counts, filter)}
              </span>
            ) : null}
          </Button>
        );
      })}
    </div>
  );
}

export type FeedbackColumnProps<Item extends FeedbackQueueItem> = {
  listRef: RefObject<HTMLElement | null>;
  headingId: string;
  noun: string;
  filter: FeedbackQueueFilter;
  counts: StatusCounts | null;
  onFilterChange: (filter: FeedbackQueueFilter) => void;
  sort: QueueSort;
  sortOptions: readonly QueueSort[];
  onSortChange: (sort: QueueSort) => void;
  searchId: string;
  searchRef: RefObject<HTMLInputElement | null>;
  searchText: string;
  onSearchChange: (text: string) => void;
  contactSearch: boolean;
  loading: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  bulk: ReactNode;
  rows: readonly Item[];
  total: number | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  checked: ReadonlySet<string>;
  onToggleChecked: (id: string) => void;
  canCheck: (row: Item) => boolean;
  titleOf: (row: Item) => string;
  subtitleOf: (row: Item) => string | null;
  importanceOf: (row: Item) => FeedbackImportance | null;
  holdOf: (row: Item) => FeedbackHold;
  empty: EmptyQueue | null;
  onShowEverything: () => void;
  onClearSearch: () => void;
  canLoadMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  moreError: string | null;
  onDismissMoreError: () => void;
  ready: boolean;
  error: ReactNode;
};

export function FeedbackQueueColumn<Item extends FeedbackQueueItem>(props: FeedbackColumnProps<Item>) {
  const {
    listRef,
    headingId,
    noun,
    filter,
    counts,
    onFilterChange,
    sort,
    sortOptions,
    onSortChange,
    searchId,
    searchRef,
    searchText,
    onSearchChange,
    contactSearch,
    loading,
    refreshing,
    onRefresh,
    bulk,
    rows,
    total,
    selectedId,
    onSelect,
    checked,
    onToggleChecked,
    canCheck,
    titleOf,
    subtitleOf,
    importanceOf,
    holdOf,
    empty,
    onShowEverything,
    onClearSearch,
    canLoadMore,
    loadingMore,
    onLoadMore,
    moreError,
    onDismissMoreError,
    ready,
    error,
  } = props;
  const countLine =
    total !== null && !loading ? describeFilterCount(total, filter) : error ? "Not loaded" : "Loading";
  const spans = filterSpansStatuses(filter);

  return (
    <section ref={listRef} aria-labelledby={headingId} className="scroll-mt-24 space-y-3 lg:sticky lg:top-24">
      <div className="flex items-center justify-between gap-3">
        <h3 id={headingId} className="type-meta-label theme-text-muted">
          Queue
        </h3>
        <div className="flex items-center gap-2">
          <p className="theme-text-muted text-xs tabular-nums" aria-live="polite">
            {countLine}
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="-mr-2"
            onClick={onRefresh}
            disabled={loading || refreshing}
            aria-busy={refreshing || undefined}
          >
            <Icon icon="lucide:refresh-cw" size={14} className={cn(refreshing && "motion-safe:animate-spin")} />
            {refreshing ? "Refreshing" : "Refresh"}
          </Button>
        </div>
      </div>

      <FeedbackStatusChoices value={filter} counts={counts} onChange={onFilterChange} />

      <div className="flex items-start gap-2">
        <div className="relative min-w-0 flex-1">
          <Icon
            icon="lucide:search"
            size={15}
            className="theme-text-faint pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
          />
          <Input
            ref={searchRef}
            id={searchId}
            type="search"
            inputSize="sm"
            value={searchText}
            onChange={(event) => onSearchChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape" && searchText) {
                event.preventDefault();
                onSearchChange("");
              }
            }}
            placeholder="Search"
            aria-label="Search feedback"
            aria-keyshortcuts="/"
            aria-describedby={contactSearch ? `${searchId}-hint` : undefined}
            className="pl-9 pr-9"
          />
          {searchText ? null : (
            <span
              aria-hidden
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 [@media(pointer:coarse)]:hidden"
            >
              <kbd className="theme-dev-kbd">/</kbd>
            </span>
          )}
        </div>
        <div className="w-40 shrink-0">
          <EditorSelect
            selectSize="sm"
            aria-label="Sort"
            value={sort}
            onChange={(event) => onSortChange(event.target.value as QueueSort)}
            options={sortOptions.map((option) => ({ value: option, label: SORT_LABELS[option] }))}
          />
        </div>
      </div>
      {contactSearch ? (
        <p id={`${searchId}-hint`} role="status" className="theme-text-muted flex gap-2 text-xs">
          <Icon icon="lucide:shield" size={13} className="theme-text-faint mt-0.5 shrink-0" />
          <span>
            Contact details cannot be searched, so this search was not sent and the list shows everything under this
            status. Search by substance, page or the feedback text instead.
          </span>
        </p>
      ) : null}

      {bulk}

      {error}

      {error && rows.length === 0 ? null : !ready && rows.length === 0 ? (
        <ListSkeleton noun={noun} />
      ) : rows.length === 0 && empty ? (
        <EmptyList
          empty={empty}
          filter={filter}
          onShowEverything={onShowEverything}
          onClearSearch={onClearSearch}
          onFilterChange={onFilterChange}
        />
      ) : (
        <EditorList
          label="Feedback queue"
          items={rows}
          getKey={(row) => row.id}
          selectedKey={selectedId}
          onSelect={onSelect}
          estimateRowHeight={72}
          maxHeight="min(calc(100dvh - 24rem), 720px)"
          multiSelect={{
            checkedKeys: checked,
            onToggle: onToggleChecked,
            checkLabel: (row) => `Select ${titleOf(row)}`,
            canCheck,
          }}
          emptyText={empty?.message ?? ""}
          renderItem={(row, { selected }) => (
            <QueueRow
              row={row}
              active={selected}
              title={titleOf(row)}
              subtitle={subtitleOf(row)}
              importance={importanceOf(row)}
              hold={holdOf(row)}
              showStatus={spans}
            />
          )}
        />
      )}

      {ready && total !== null && (canLoadMore || total > FEEDBACK_PAGE_SIZE) ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="theme-text-muted text-xs tabular-nums">
            {rows.length} of {total} loaded
          </p>
          {canLoadMore ? (
            <Button type="button" variant="outline" size="sm" disabled={loadingMore} aria-busy={loadingMore || undefined} onClick={onLoadMore}>
              {loadingMore ? "Loading more" : "Load more"}
            </Button>
          ) : null}
        </div>
      ) : null}
      {moreError ? (
        <Notice placement="inline" tone="danger" dismiss={onDismissMoreError}>
          {moreError}
        </Notice>
      ) : null}
      <p className="theme-text-faint hidden text-xs [@media(pointer:fine)]:block">
        <kbd className="theme-dev-kbd">j</kbd> <kbd className="theme-dev-kbd">k</kbd> move,{" "}
        <kbd className="theme-dev-kbd">a</kbd> resolve, <kbd className="theme-dev-kbd">/</kbd> search,{" "}
        <kbd className="theme-dev-kbd">?</kbd> every key
      </p>
    </section>
  );
}

function EmptyList({
  empty,
  filter,
  onShowEverything,
  onClearSearch,
  onFilterChange,
}: {
  empty: EmptyQueue;
  filter: FeedbackQueueFilter;
  onShowEverything: () => void;
  onClearSearch: () => void;
  onFilterChange: (filter: FeedbackQueueFilter) => void;
}) {
  return (
    <div className="rounded-card border border-dashed border-[color:var(--editor-panel-border)] px-4 py-5 text-sm">
      <p className="theme-text-secondary flex items-start gap-2">
        <Icon
          icon={empty.kind === "clear" ? "lucide:circle-check" : "lucide:search-x"}
          size={16}
          className={cn("mt-0.5 shrink-0", empty.kind === "clear" ? "theme-icon-accent" : "theme-text-faint")}
        />
        <span>{empty.message}</span>
      </p>
      {empty.kind === "search" ? (
        <div className="ml-6 mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          {empty.found.length > 0 ? (
            <span className="theme-text-muted flex flex-wrap items-center gap-x-3 gap-y-1">
              Found under
              {empty.found.map((entry) => (
                <Button
                  key={entry.status}
                  type="button"
                  variant="link"
                  size="auto"
                  className="text-sm"
                  onClick={() => onFilterChange(entry.status)}
                >
                  {`${FEEDBACK_STATUS_LABELS[entry.status]} (${entry.count})`}
                </Button>
              ))}
            </span>
          ) : null}
          <Button type="button" variant="link" size="auto" className="text-sm" onClick={onClearSearch}>
            Clear the search
          </Button>
        </div>
      ) : empty.kind === "filtered" && filter !== "all" ? (
        <Button type="button" variant="link" size="auto" className="ml-6 mt-2 text-sm" onClick={onShowEverything}>
          Show everything
        </Button>
      ) : null}
    </div>
  );
}

function ListSkeleton({ noun }: { noun: string }) {
  return (
    <div aria-busy="true" className="space-y-1">
      <span className="sr-only">Loading {noun}</span>
      {Array.from({ length: 4 }, (_, index) => (
        <div
          key={index}
          aria-hidden
          className="space-y-2 rounded-xl px-3 py-3 [background:var(--theme-frosted-control-on-panel-bg)]"
        >
          <span className="theme-skeleton-pulse block h-3.5 rounded-chip" style={{ width: `${72 - index * 9}%` }} />
          <span className="theme-skeleton-pulse block h-3 w-2/5 rounded-chip" />
        </div>
      ))}
    </div>
  );
}

function QueueRow({
  row,
  active,
  title,
  subtitle,
  importance,
  hold,
  showStatus,
}: {
  row: FeedbackQueueItem;
  active: boolean;
  title: string;
  subtitle: string | null;
  importance: FeedbackImportance | null;
  hold: FeedbackHold;
  showStatus: boolean;
}) {
  const day = describeDay(row.created_at);
  const holder =
    hold.kind === "mine" ? "You" : hold.kind === "other" ? `Claimed by ${formatReviewerIdentity(hold.by) ?? hold.by}` : null;
  return (
    <EditorListRow active={active} className="h-[4.25rem] items-start overflow-hidden">
      <span className="min-w-0 flex-1 space-y-1">
        <span className="flex items-center justify-between gap-3">
          <span className={cn("min-w-0 truncate text-sm font-semibold", active ? "theme-accent-heading" : "theme-text-primary")}>
            {title}
          </span>
          <span className="flex shrink-0 items-center gap-1.5">
            {importance && importance !== "normal" ? (
              <EditorStatusPill inline tone={IMPORTANCE_PILL_TONE[importance]}>
                {IMPORTANCE_WORD[importance]}
              </EditorStatusPill>
            ) : null}
            {showStatus ? (
              <EditorStatusPill inline tone={STATUS_PILL_TONE[row.status]}>
                {FEEDBACK_STATUS_LABELS[row.status]}
              </EditorStatusPill>
            ) : null}
          </span>
        </span>
        <span className="theme-text-muted block truncate text-xs">
          {subtitle ? <span className="theme-text-secondary font-medium">{subtitle}</span> : null}
          {subtitle && day ? " · " : null}
          {day ? (
            <time dateTime={row.created_at} title={day.full}>
              {day.relative}
            </time>
          ) : null}
          {holder ? <span className="theme-text-secondary">{` · ${holder}`}</span> : null}
          {` · ${row.details}`}
        </span>
      </span>
    </EditorListRow>
  );
}
