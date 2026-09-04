import { Button } from "@/components/ui/button";
import { Icon } from "@/components/common/Icon";
import {
  EditorListItem,
  EditorSection,
  EditorSegmentedControl,
  EditorStatusPill,
} from "@/features/dev/components";
import {
  CITATION_QUEUE_FILTERS,
  CITATION_QUEUE_FILTER_LABEL,
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
}: {
  queue: CitationReviewQueueSummary[];
  queueFilter: CitationReviewQueueFilter;
  onQueueFilterChange: (filter: CitationReviewQueueFilter) => void;
  onRefreshQueue: () => void;
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
        <Button variant="outline" size="pill" className="rounded-full" onClick={onRefreshQueue}>
          <Icon icon="lucide:refresh-cw" size={16} />
          Refresh queue
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

export function CitationQueuePanel({
  queue,
  selectedSlug,
  articleTitleBySlug,
  onSelectSlug,
}: {
  queue: CitationReviewQueueSummary[];
  selectedSlug: string | null;
  articleTitleBySlug: Map<string, string>;
  onSelectSlug: (slug: string) => void;
}) {
  return (
    <EditorSection
      icon="lucide:files"
      title="Articles"
      description="Select an article, then approve or reject ready evidence rows on the right."
      actions={<EditorStatusPill tone="neutral">{queue.length} queued</EditorStatusPill>}
      className="h-fit lg:sticky lg:top-6"
    >
      <div className="space-y-2 lg:max-h-[calc(100vh-14rem)] lg:overflow-y-auto lg:pr-1">
        {queue.map((entry) => {
          const unresolvedBlocking =
            entry.blockingNeedsSourceCount +
            entry.blockingNeedsReviewCount +
            entry.blockingRejectedCount;
          const isSelected = selectedSlug === entry.slug;
          return (
            <div key={entry.slug} className="space-y-1">
              <EditorListItem
                active={isSelected}
                onSelect={() => onSelectSlug(entry.slug)}
                className="flex-col items-stretch gap-1 px-4 py-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <p
                    className={`min-w-0 truncate text-sm font-semibold ${
                      isSelected ? "theme-accent-heading" : "theme-text-primary"
                    }`}
                  >
                    {articleTitleBySlug.get(entry.slug) ?? entry.slug}
                  </p>
                  <span className="flex shrink-0 flex-wrap justify-end gap-2">
                    {unresolvedBlocking > 0 ? (
                      <EditorStatusPill tone="danger">{unresolvedBlocking} blocking</EditorStatusPill>
                    ) : null}
                    {entry.supportedCount > 0 ? (
                      <EditorStatusPill tone="success">{entry.supportedCount} ready</EditorStatusPill>
                    ) : null}
                  </span>
                </div>
                <p className="truncate text-xs theme-text-faint">
                  {entry.slug} · {formatCitationCount(entry.totalRows, "row")} ·{" "}
                  {entry.approvedCount} approved · Updated {formatUpdatedAt(entry.updatedAt)}
                </p>
              </EditorListItem>
              <div className="flex justify-end">
                <Button asChild variant="quiet" size="quiet">
                  <a href={`/review/${entry.slug}`}>
                    Open in Review
                    <Icon icon="lucide:arrow-up-right" size={14} />
                  </a>
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </EditorSection>
  );
}
