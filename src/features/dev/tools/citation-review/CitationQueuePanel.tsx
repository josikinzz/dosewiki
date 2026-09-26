import type { ReactNode, RefObject } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Icon } from "@/components/common/Icon";
import { TOUCH_HALO_Y } from "@/components/ui/touchTargets";
import {
  EditorList,
  EditorListRow,
  EditorStatusPill,
} from "@/features/dev/components";
import { describeDay } from "@/features/dev/tools/home/homeModel";
import type { ProposalHold } from "@/features/dev/tools/queue/queueModel";
import { formatReviewerIdentity } from "@/features/dev/tools/reviewerIdentity";
import { cn } from "@/lib/utils";
import {
  CITATION_QUEUE_FILTERS,
  CITATION_QUEUE_FILTER_LABEL,
  formatCitationCount,
  type CitationReviewQueueFilter,
  type CitationReviewQueueSummary,
} from "./citationReviewModels";
import { summaryBlockingGaps } from "./citationPaneModel";

/**
 * The four queue filters as a four-column grid in the segmented capsule, so
 * every choice shows on a phone without a sideways scroll. Each refetches the
 * queue; the count of the other filters is unknown until then, so none shows.
 */
export function CitationFilterChoices({
  value,
  onChange,
  disabled = false,
}: {
  value: CitationReviewQueueFilter;
  onChange: (filter: CitationReviewQueueFilter) => void;
  disabled?: boolean;
}) {
  return (
    <div
      role="group"
      aria-label="Queue filter"
      className="grid grid-cols-4 gap-1 rounded-card border border-[color:var(--editor-panel-border)] bg-[var(--editor-panel-bg-subtle)] p-1"
    >
      {CITATION_QUEUE_FILTERS.map((filter) => {
        const selected = filter === value;
        return (
          <Button
            key={filter}
            type="button"
            variant={selected ? "pillActive" : "ghostPill"}
            size="pill"
            aria-pressed={selected}
            disabled={disabled}
            onClick={() => onChange(filter)}
            className={cn(
              "h-9 w-full min-w-0 rounded-control px-1 text-xs font-medium [@media(pointer:coarse)]:min-h-11",
              TOUCH_HALO_Y,
            )}
          >
            {CITATION_QUEUE_FILTER_LABEL[filter]}
          </Button>
        );
      })}
    </div>
  );
}

/**
 * The article queue as the shared triage list: arrows (and j/k from the tab)
 * move the selection, and the search narrows it by title or slug. Open in
 * Review lives on the open article's pane, so each row stays one option with
 * nothing else to tab to.
 */
export function citationQueueMatches(
  entry: CitationReviewQueueSummary,
  query: string,
  articleTitleBySlug: Map<string, string>,
): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const title = (articleTitleBySlug.get(entry.slug) ?? entry.slug).toLowerCase();
  return title.includes(needle) || entry.slug.includes(needle);
}

export type CitationQueuePanelProps = {
  /** The articles to list, already narrowed by `query`. */
  queue: CitationReviewQueueSummary[];
  selectedSlug: string | null;
  articleTitleBySlug: Map<string, string>;
  onSelectSlug: (slug: string) => void;
  /** The search lives with the tab so j/k step through the same rows the list shows. */
  query?: string;
  onQueryChange?: (query: string) => void;
  listRef?: RefObject<HTMLElement | null>;
  headingId?: string;
  searchId?: string;
  searchRef?: RefObject<HTMLInputElement | null>;
  filter?: CitationReviewQueueFilter;
  onFilterChange?: (filter: CitationReviewQueueFilter) => void;
  /** "4 articles", "1 of 4 shown", "Loading", "Not loaded". */
  countLine?: string;
  refreshing?: boolean;
  onRefresh?: () => void;
  busy?: boolean;
  /** Who holds each article in the Inbox's claim table; null when unknown or not shown. */
  holdOf?: (slug: string) => ProposalHold | null;
  /** Rows exist in memory (possibly stale behind a failed refresh). */
  loaded?: boolean;
  /** Why the list is empty, with the way back to some rows. */
  empty?: ReactNode;
  /** A failed read, drawn where the list is; rows already loaded stay under it. */
  error?: ReactNode;
  /** A line about the list itself (a deep link that named nothing here). */
  notice?: ReactNode;
  /** Rail count freshness line. */
  freshness?: ReactNode;
};

/**
 * The list column: heading, count and Refresh, the four filters, search, then
 * the windowed list of articles (title, blocking and ready counts, who holds
 * it, rows and when it last changed). Sticky beside the pane from `lg`.
 */
export function CitationQueuePanel({
  queue,
  selectedSlug,
  articleTitleBySlug,
  onSelectSlug,
  query = "",
  onQueryChange,
  listRef,
  headingId = "citation-queue-heading",
  searchId = "citation-queue-search",
  searchRef,
  filter,
  onFilterChange,
  countLine,
  refreshing = false,
  onRefresh,
  busy = false,
  holdOf,
  loaded = true,
  empty,
  error,
  notice,
  freshness,
}: CitationQueuePanelProps) {
  const titleOf = (entry: CitationReviewQueueSummary) => articleTitleBySlug.get(entry.slug) ?? entry.slug;
  return (
    <section ref={listRef} aria-labelledby={headingId} className="scroll-mt-24 space-y-3 lg:sticky lg:top-24">
      <div className="flex items-center justify-between gap-3">
        <h3 id={headingId} className="type-meta-label theme-text-muted">
          Articles
        </h3>
        <div className="flex items-center gap-2">
          <p className="theme-text-muted text-xs tabular-nums" aria-live="polite">
            {countLine ?? formatCitationCount(queue.length, "article")}
          </p>
          {onRefresh ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="-mr-2"
              onClick={onRefresh}
              disabled={refreshing || busy}
              aria-busy={refreshing || undefined}
            >
              <Icon icon="lucide:refresh-cw" size={14} className={cn(refreshing && "motion-safe:animate-spin")} />
              {refreshing ? "Refreshing" : "Refresh"}
            </Button>
          ) : null}
        </div>
      </div>

      {filter && onFilterChange ? <CitationFilterChoices value={filter} onChange={onFilterChange} disabled={busy} /> : null}

      {onQueryChange ? (
        <div className="relative">
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
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape" && query) {
                event.preventDefault();
                onQueryChange("");
              }
            }}
            placeholder="Search by article name"
            aria-label="Search articles"
            aria-keyshortcuts="/"
            className="pl-9 pr-9"
          />
          {query ? null : (
            <span
              aria-hidden
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 [@media(pointer:coarse)]:hidden"
            >
              <kbd className="theme-dev-kbd">/</kbd>
            </span>
          )}
        </div>
      ) : null}

      {freshness}
      {notice}
      {error}

      {!loaded ? (
        error ? null : <ListSkeleton />
      ) : empty ? (
        empty
      ) : (
        <EditorList
          label="Citation queue"
          items={queue}
          getKey={(entry) => entry.slug}
          selectedKey={selectedSlug}
          onSelect={onSelectSlug}
          maxHeight="min(calc(100dvh - 22rem), 720px)"
          estimateRowHeight={72}
          emptyText={query.trim() ? `No article matches “${query.trim()}”.` : "No articles queued."}
          renderItem={(entry, { selected }) => (
            <QueueRow entry={entry} active={selected} title={titleOf(entry)} hold={holdOf?.(entry.slug) ?? null} />
          )}
        />
      )}

      <p className="theme-text-faint hidden text-xs [@media(pointer:fine)]:block">
        <kbd className="theme-dev-kbd">j</kbd> <kbd className="theme-dev-kbd">k</kbd> move,{" "}
        <kbd className="theme-dev-kbd">o</kbd> next unread row, <kbd className="theme-dev-kbd">a</kbd> approve,{" "}
        <kbd className="theme-dev-kbd">r</kbd> reject, <kbd className="theme-dev-kbd">?</kbd> every key
      </p>
    </section>
  );
}

/**
 * Two lines at one pitch for the windowed list: the title with its blocking
 * and ready counts, then who holds it, how many rows it has, how many are
 * accepted, and when it last changed.
 */
function QueueRow({
  entry,
  active,
  title,
  hold,
}: {
  entry: CitationReviewQueueSummary;
  active: boolean;
  title: string;
  hold: ProposalHold | null;
}) {
  const blocking = summaryBlockingGaps(entry);
  const day = entry.updatedAt ? describeDay(entry.updatedAt) : null;
  const holder =
    hold?.kind === "mine" ? "You" : hold?.kind === "other" ? `Claimed by ${formatReviewerIdentity(hold.by) ?? hold.by}` : null;
  return (
    <EditorListRow active={active} className="h-[4.25rem] items-start overflow-hidden">
      <span className="min-w-0 flex-1 space-y-1">
        <span className="flex items-center justify-between gap-3">
          <span className={cn("min-w-0 truncate text-sm font-semibold", active ? "theme-accent-heading" : "theme-text-primary")}>
            {title}
          </span>
          <span className="flex shrink-0 items-center gap-1.5">
            {blocking > 0 ? (
              <EditorStatusPill inline tone="danger">
                {blocking} blocking
              </EditorStatusPill>
            ) : null}
            {entry.supportedCount > 0 ? (
              <EditorStatusPill inline tone="success">
                {entry.supportedCount} ready
              </EditorStatusPill>
            ) : null}
          </span>
        </span>
        <span className="theme-text-muted block truncate text-xs">
          {holder ? <span className={hold?.kind === "mine" ? "theme-text-primary" : "theme-text-secondary"}>{`${holder} · `}</span> : null}
          {`${formatCitationCount(entry.totalRows, "row")}, ${entry.approvedCount} accepted`}
          {day && entry.updatedAt ? (
            <>
              {" · "}
              <time dateTime={entry.updatedAt} title={day.full}>
                {day.relative}
              </time>
            </>
          ) : (
            " · No review activity yet"
          )}
        </span>
      </span>
    </EditorListRow>
  );
}

function ListSkeleton() {
  return (
    <div aria-busy="true" className="space-y-1">
      <span className="sr-only">Loading articles</span>
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

/** The open article's link out to the full review workbench. */
export function CitationOpenInReview({ slug }: { slug: string }) {
  return (
    <a
      href={`/review/${slug}`}
      className="text-dose-accent-strong theme-accent-underline inline-flex items-center gap-1 text-sm underline-offset-4 hover:underline"
    >
      Open in Review
      <Icon icon="lucide:arrow-up-right" size={14} />
    </a>
  );
}
