import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Icon } from "@/components/common/Icon";
import {
  EditorList,
  EditorListRow,
  EditorSection,
  EditorSegmentedControl,
  EditorStatusPill,
  TriageShortcutHint,
} from "@/features/dev/components";
import {
  CITATION_QUEUE_FILTERS,
  CITATION_QUEUE_FILTER_LABEL,
  CITATION_STATUS_LABEL,
  formatCitationCount,
  type CitationReviewQueueFilter,
  type CitationReviewQueueSummary,
} from "./citationReviewModels";

const QUEUE_FILTER_OPTIONS = CITATION_QUEUE_FILTERS.map((value) => ({
  value,
  label: CITATION_QUEUE_FILTER_LABEL[value],
}));

function formatUpdatedAt(value: string | null) {
  if (!value) {
    return "No review activity yet";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function CitationQueueHeader({
  queue,
  queueFilter,
  onQueueFilterChange,
  onRefreshQueue,
  refreshing = false,
}: {
  queue: CitationReviewQueueSummary[];
  queueFilter: CitationReviewQueueFilter;
  onQueueFilterChange: (filter: CitationReviewQueueFilter) => void;
  onRefreshQueue: () => void;
  /** A refresh is in flight; the list stays on screen meanwhile. */
  refreshing?: boolean;
}) {
  const readyApprovalCount = queue.reduce((total, entry) => total + entry.supportedCount, 0);
  const blockingGapCount = queue.reduce(
    (total, entry) =>
      total +
      entry.blockingNeedsSourceCount +
      entry.blockingNeedsReviewCount +
      entry.blockingRejectedCount,
    0,
  );

  return (
    <EditorSection
      icon="lucide:list-checks"
      title="Citation review queue"
      description="Evidence snippets, gap states, and reviewer decisions never leave the protected dev area."
      actions={(
        <Button variant="outline" size="pill" className="rounded-full" disabled={refreshing} onClick={onRefreshQueue}>
          <Icon icon="lucide:refresh-cw" size={16} className={refreshing ? "animate-spin" : undefined} />
          {refreshing ? "Refreshing queue" : "Refresh queue"}
        </Button>
      )}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <EditorSegmentedControl
          label="Queue filter"
          options={QUEUE_FILTER_OPTIONS}
          value={queueFilter}
          onChange={(value) => onQueueFilterChange(value as CitationReviewQueueFilter)}
        />
        <div className="flex flex-wrap items-center gap-2">
          <EditorStatusPill tone="neutral">{queue.length} articles</EditorStatusPill>
          <EditorStatusPill tone="success">{readyApprovalCount} ready approvals</EditorStatusPill>
          <EditorStatusPill tone={blockingGapCount > 0 ? "danger" : "neutral"}>
            {blockingGapCount} blocking gaps
          </EditorStatusPill>
        </div>
      </div>
    </EditorSection>
  );
}

/**
 * The article queue as the shared triage list: arrows (and j/k from the tab)
 * move the selection, and the search narrows it by title or slug. Open in
 * Review lives on the selected article's summary, so each row stays one
 * option with nothing else to tab to.
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

export function CitationQueuePanel({
  queue,
  selectedSlug,
  articleTitleBySlug,
  onSelectSlug,
  query = "",
  onQueryChange,
}: {
  /** The articles to list, already narrowed by `query`. */
  queue: CitationReviewQueueSummary[];
  selectedSlug: string | null;
  articleTitleBySlug: Map<string, string>;
  onSelectSlug: (slug: string) => void;
  /** The search lives with the tab so j/k step through the same rows the list shows. */
  query?: string;
  onQueryChange?: (query: string) => void;
}) {
  const titleOf = (entry: CitationReviewQueueSummary) => articleTitleBySlug.get(entry.slug) ?? entry.slug;
  return (
    <EditorSection
      icon="lucide:files"
      title="Articles"
      description="Select an article, then approve or reject ready evidence rows on the right."
      actions={<EditorStatusPill tone="neutral">{queue.length} queued</EditorStatusPill>}
      className="h-fit lg:sticky lg:top-6"
    >
      {onQueryChange ? (
        <Input
          type="search"
          inputSize="sm"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search articles"
          aria-label="Search articles"
          className="mb-2"
        />
      ) : null}
      <EditorList
        label="Citation queue"
        items={queue}
        getKey={(entry) => entry.slug}
        selectedKey={selectedSlug}
        onSelect={onSelectSlug}
        maxHeight="min(70vh, calc(100vh - 16rem))"
        estimateRowHeight={72}
        emptyText={query.trim() ? `No article matches "${query.trim()}".` : "No articles queued."}
        renderItem={(entry, { selected }) => {
          const unresolvedBlocking =
            entry.blockingNeedsSourceCount +
            entry.blockingNeedsReviewCount +
            entry.blockingRejectedCount;
          return (
            <EditorListRow active={selected} className="flex-col items-stretch gap-1 px-4 py-3">
              <span className="flex items-start justify-between gap-3">
                <span
                  className={`min-w-0 truncate text-sm font-semibold ${
                    selected ? "theme-accent-heading" : "theme-text-primary"
                  }`}
                >
                  {titleOf(entry)}
                </span>
                <span className="flex shrink-0 flex-wrap justify-end gap-2">
                  {unresolvedBlocking > 0 ? (
                    <EditorStatusPill tone="danger">{unresolvedBlocking} blocking</EditorStatusPill>
                  ) : null}
                  {entry.supportedCount > 0 ? (
                    <EditorStatusPill tone="success">{entry.supportedCount} ready</EditorStatusPill>
                  ) : null}
                </span>
              </span>
              <span className="block truncate text-xs theme-text-faint">
                {entry.slug} · {formatCitationCount(entry.totalRows, "row")} ·{" "}
                {entry.approvedCount} {CITATION_STATUS_LABEL.approved.toLowerCase()} · Updated{" "}
                {formatUpdatedAt(entry.updatedAt)}
              </span>
            </EditorListRow>
          );
        }}
      />
      <TriageShortcutHint className="mt-3" />
    </EditorSection>
  );
}

/** The selected article's link out to the full review workbench. */
export function CitationOpenInReview({ slug }: { slug: string }) {
  return (
    <Button asChild variant="quiet" size="quiet">
      <a href={`/review/${slug}`}>
        Open in Review
        <Icon icon="lucide:arrow-up-right" size={14} />
      </a>
    </Button>
  );
}
