import { Fragment, useCallback, useMemo, useState } from "react";
import { DiffPreview } from "@/features/dev/components/DiffPreview";
import { ExpandButton } from "@/components/common/ExpandButton";
import { Icon } from "@/components/common/Icon";
import { StateCard } from "@/components/common/StateCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { describeChange, fieldWords } from "@/data/changelog/articleRecentChanges";
import type { ChangeLogEntry } from "@/data/changelog/changeLog";
import {
  ActionNotice,
  EditorActionGroup,
  EditorField,
  EditorFieldRow,
  EditorNotice,
  EditorSection,
  EditorStatusPill,
  EditorToolbar,
} from "@/features/dev/components";
import { viewToPath } from "@/utils/routing";
import { CHANGELOG_FEED_MAX_ROWS, type ChangelogFeedWindow } from "./useDevChangelogFeed";
import type { ChangeLogController } from "./useDevModeChangeLog";

type DevModeChangeLogTabProps = {
  controller: ChangeLogController;
};

type EntrySummary = {
  /** What the save did, in editor words: "Reworded 3 words", "Updated 2 articles". */
  headline: string;
  /** Where it happened, as section and field words; null for whole-article saves. */
  location: string | null;
  /** A hand-written save note or the reference a source edit named. */
  detail: string | null;
  linesAdded: number;
  linesRemoved: number;
};

const SAVE_TIME_FORMAT: Intl.DateTimeFormatOptions = {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
};

/**
 * One line the editor can read without opening the diff. The description
 * comes from the same projection the public article ledger uses, so the
 * raw field path never reaches the screen; the counts come from the stored
 * diff lines.
 */
function summarizeEntry(entry: ChangeLogEntry): EntrySummary {
  const description = describeChange(entry.commit?.message ?? "", entry.markdown);
  const articleCount = entry.articles.length;
  const headline =
    description.kind === "bulk" && articleCount > 1
      ? `Updated ${articleCount} articles`
      : description.message;
  const location =
    [description.section?.label, description.field ? fieldWords(description.field) : null]
      .filter(Boolean)
      .join(" › ") || null;

  let linesAdded = 0;
  let linesRemoved = 0;
  for (const line of entry.markdown.split("\n")) {
    if (line.startsWith("+")) linesAdded += 1;
    else if (line.startsWith("-")) linesRemoved += 1;
  }

  return { headline, location, detail: description.detail, linesAdded, linesRemoved };
}

function LineCounts({ added, removed }: { added: number; removed: number }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 font-mono tabular-nums"
      aria-label={`${added} line${added === 1 ? "" : "s"} added, ${removed} line${removed === 1 ? "" : "s"} removed`}
    >
      <span className="text-[var(--editor-code-line-add-text)]">+{added}</span>
      <span className="text-[var(--editor-code-line-remove-text)]">-{removed}</span>
    </span>
  );
}

function describeWindow(
  feedWindow: ChangelogFeedWindow,
  totalEntriesCount: number,
): { pill: string; loading: boolean; note: string | null } {
  if (feedWindow.loading && feedWindow.loadedCount === 0) {
    return { pill: "Loading saves", loading: true, note: null };
  }
  if (feedWindow.loading) {
    return {
      pill: "Loading older saves",
      loading: true,
      note: `The latest ${feedWindow.loadedCount} saves are loaded so far.`,
    };
  }
  if (feedWindow.atServerCap) {
    return {
      pill: `Latest ${feedWindow.loadedCount} saves`,
      loading: false,
      note: `Only the latest ${CHANGELOG_FEED_MAX_ROWS} saves can be loaded here; older saves do not appear in this list or its filters.`,
    };
  }
  if (feedWindow.hasMore) {
    return {
      pill: `Latest ${feedWindow.loadedCount} saves`,
      loading: false,
      note: `Only the latest ${feedWindow.loadedCount} saves are loaded; older saves load from the end of the list.`,
    };
  }
  return {
    pill: `${totalEntriesCount} save${totalEntriesCount === 1 ? "" : "s"}`,
    loading: false,
    note: null,
  };
}

export function DevModeChangeLogTab({ controller }: DevModeChangeLogTabProps) {
  const {
    notice,
    totalEntriesCount,
    filters,
    articleOptions,
    articleFrequency,
    filteredEntries,
    visibleEntries,
    canShowMoreEntries,
    activeFilterCount,
    latestEntry,
    entryFeedback,
    clearEntryFeedback,
    filtersCardClassName,
    feedWindow,
    handleArticleSelect,
    handleSearchChange,
    handleDateChange,
    applyQuickDateRange,
    clearFilters,
    focusArticleFilter,
    showMoreEntries,
    handleCopyEntry,
    handleDownloadEntry,
  } = controller;

  // Diffs stay closed until asked for; ids are stable across filtering, so
  // an entry opened before a filter change is still open when it returns.
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(() => new Set());
  const anyVisibleExpanded = useMemo(
    () => visibleEntries.some((entry) => expandedIds.has(entry.id)),
    [expandedIds, visibleEntries],
  );

  const toggleEntry = useCallback((id: string) => {
    setExpandedIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAllVisible = useCallback(() => {
    setExpandedIds((previous) => {
      const visibleIds = visibleEntries.map((entry) => entry.id);
      const next = new Set(previous);
      if (visibleIds.some((id) => next.has(id))) {
        for (const id of visibleIds) next.delete(id);
      } else {
        for (const id of visibleIds) next.add(id);
      }
      return next;
    });
  }, [visibleEntries]);

  const rows = useMemo(
    () => visibleEntries.map((entry) => ({ entry, summary: summarizeEntry(entry) })),
    [visibleEntries],
  );

  const feedState = describeWindow(feedWindow, totalEntriesCount);
  const canLoadOlder = feedWindow.hasMore || (feedWindow.loading && feedWindow.loadedCount > 0);

  return (
    <div className="mt-10 grid w-full gap-6 lg:grid-cols-[19rem_minmax(0,1fr)]">
      <div className="min-w-0">
        <EditorSection
          icon="lucide:filter"
          title="Refine history"
          className={filtersCardClassName}
          actions={
            activeFilterCount > 0 ? (
              <>
                <EditorStatusPill tone="warning">
                  {`${activeFilterCount} filter${activeFilterCount === 1 ? "" : "s"} active`}
                </EditorStatusPill>
                <Button variant="ghost" size="xs" onClick={clearFilters}>
                  Clear
                </Button>
              </>
            ) : undefined
          }
        >
          <div className="space-y-4">
            <EditorField label="Article" htmlFor="change-log-article">
              <Select value={filters.articleSlug ?? "__all__"} onValueChange={handleArticleSelect}>
                <SelectTrigger id="change-log-article">
                  <SelectValue placeholder="All articles" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All articles</SelectItem>
                  {articleOptions.map((option) => (
                    <SelectItem key={option.slug} value={option.slug}>
                      {option.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </EditorField>

            <EditorFieldRow layout="twoColumn">
              <EditorField label="Start date" htmlFor="change-log-start">
                <Input
                  id="change-log-start"
                  type="date"
                  value={filters.startDate ?? ""}
                  onChange={handleDateChange("startDate")}
                />
              </EditorField>
              <EditorField label="End date" htmlFor="change-log-end">
                <Input
                  id="change-log-end"
                  type="date"
                  value={filters.endDate ?? ""}
                  onChange={handleDateChange("endDate")}
                />
              </EditorField>
            </EditorFieldRow>

            <EditorToolbar label="Quick date ranges" variant="compact" className="text-xs">
              <Button
                variant="glass"
                size="xs"
                className="rounded-full"
                onClick={() => applyQuickDateRange(7)}
              >
                Past 7 days
              </Button>
              <Button
                variant="glass"
                size="xs"
                className="rounded-full"
                onClick={() => applyQuickDateRange(30)}
              >
                Past 30 days
              </Button>
              <Button
                variant="glass"
                size="xs"
                className="rounded-full"
                onClick={() => applyQuickDateRange(null)}
              >
                Any date
              </Button>
            </EditorToolbar>

            <EditorField label="Search" htmlFor="change-log-search">
              <Input
                id="change-log-search"
                type="search"
                placeholder="Search saves by keyword, article, or diff text…"
                value={filters.searchQuery}
                onChange={handleSearchChange}
              />
            </EditorField>
          </div>
        </EditorSection>
      </div>

      <div className="min-w-0 space-y-8">
        {notice && (
          <EditorNotice
            notice={{
              tone: notice.type === "error" ? "danger" : "success",
              message: notice.message,
              live: notice.type === "error",
            }}
          />
        )}

        <EditorSection
          className="min-w-0"
          icon="lucide:history"
          title="Save history"
          description={
            <>
              {activeFilterCount > 0
                ? "Showing loaded saves that match the active article, date, and search filters."
                : "Every Dev mode save, newest first. Open an entry to see the lines that changed."}
              {feedState.note ? ` ${feedState.note}` : null}
            </>
          }
          actions={(
            <>
              <EditorStatusPill loading={feedState.loading} live>
                {feedState.pill}
              </EditorStatusPill>
              {latestEntry ? (
                <EditorStatusPill>
                  Latest: {new Date(latestEntry.createdAt).toLocaleString(undefined, SAVE_TIME_FORMAT)}
                </EditorStatusPill>
              ) : null}
              {articleFrequency[0] ? (
                <EditorStatusPill>
                  Most active: {articleFrequency[0].title}
                </EditorStatusPill>
              ) : null}
              <EditorStatusPill tone={activeFilterCount > 0 ? "warning" : "neutral"}>
                {canShowMoreEntries
                  ? `${visibleEntries.length} of ${filteredEntries.length} shown`
                  : `${filteredEntries.length} shown`}
              </EditorStatusPill>
              {visibleEntries.length > 0 ? (
                <ExpandButton
                  variant="floating"
                  isExpanded={anyVisibleExpanded}
                  onToggle={toggleAllVisible}
                  label={anyVisibleExpanded ? "Collapse all" : "Expand all"}
                  ariaLabel={anyVisibleExpanded ? "Collapse every diff" : "Expand every diff"}
                />
              ) : null}
            </>
          )}
        >
          {filteredEntries.length === 0 ? (
            <StateCard
              icon={activeFilterCount > 0 ? "lucide:search-x" : "lucide:history"}
              tone="neutral"
              align="center"
              compact
              loading={feedState.loading}
              title={
                activeFilterCount > 0
                  ? "No loaded saves match these filters"
                  : feedState.loading
                    ? "Loading saves"
                    : "No saves logged yet"
              }
              description={
                activeFilterCount > 0
                  ? canLoadOlder
                    ? "Older saves are not loaded yet and may match. Load them, or clear the filters to see everything already here."
                    : feedWindow.atServerCap
                      ? `Only the latest ${CHANGELOG_FEED_MAX_ROWS} saves can be loaded here. Clear filters or broaden the date range to review the saves that are.`
                      : "Clear filters or broaden the date range to review more saved diffs."
                  : feedState.loading
                    ? "The latest saves are on their way."
                    : "Saves made in Dev mode appear here as soon as they land."
              }
              actions={activeFilterCount > 0 ? (
                <>
                  {canLoadOlder ? (
                    <Button
                      variant="glass"
                      size="pill"
                      className="rounded-full"
                      onClick={feedWindow.loadMore}
                      disabled={feedWindow.loading}
                    >
                      {feedWindow.loading ? "Loading older saves" : "Load older saves"}
                    </Button>
                  ) : null}
                  <Button variant="glass" size="pill" className="rounded-full" onClick={clearFilters}>
                    Clear filters
                  </Button>
                </>
              ) : undefined}
            />
          ) : (
            <div className="space-y-5">
              {rows.map(({ entry, summary }, index) => {
                const isExpanded = expandedIds.has(entry.id);
                const diffId = `change-log-diff-${entry.id}`;
                const headingId = `change-log-entry-${entry.id}`;
                return (
                  <Fragment key={entry.id}>
                    {index > 0 ? <div className="theme-gradient-divider h-px" /> : null}
                    <article className="space-y-3" aria-labelledby={headingId}>
                      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                        <div className="min-w-0 space-y-1">
                          <p id={headingId} className="text-sm font-semibold theme-text-primary">
                            {new Date(entry.createdAt).toLocaleString(undefined, SAVE_TIME_FORMAT)}
                          </p>
                          <p className="text-sm theme-text-secondary">
                            <span className="font-medium theme-text-primary">{summary.headline}</span>
                            {summary.location ? (
                              <span className="theme-text-muted"> in {summary.location}</span>
                            ) : null}
                            {summary.detail ? (
                              <span className="theme-text-muted">: {summary.detail}</span>
                            ) : null}
                          </p>
                          <p className="flex flex-wrap items-center gap-x-2 text-xs theme-text-faint">
                            <LineCounts added={summary.linesAdded} removed={summary.linesRemoved} />
                            {entry.commit?.url ? (
                              <a
                                href={entry.commit.url}
                                target="_blank"
                                rel="noreferrer"
                                className="theme-accent-emphasis transition"
                              >
                                {entry.commit.message}
                              </a>
                            ) : null}
                            {entry.submittedBy ? <span>Submitted by {entry.submittedBy}</span> : null}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-wrap items-center gap-2">
                          {entry.articles.map((article) => {
                            const href = viewToPath({ type: "substance", slug: article.slug });
                            return (
                              <span
                                key={`${entry.id}-${article.slug}`}
                                className="inline-flex items-center gap-1"
                              >
                                <Button
                                  variant="ghostPill"
                                  size="xs"
                                  onClick={() => focusArticleFilter(article.slug)}
                                  title={`Filter history to ${article.title}`}
                                >
                                  <Icon icon="lucide:filter" size={14} />
                                  {article.title}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="xs"
                                  className="rounded-full px-2"
                                  asChild
                                >
                                  <a
                                    href={href}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    aria-label={`Open ${article.title} article in a new tab`}
                                  >
                                    <Icon icon="lucide:external-link" size={14} />
                                  </a>
                                </Button>
                              </span>
                            );
                          })}
                          <ExpandButton
                            variant="faint"
                            isExpanded={isExpanded}
                            onToggle={() => toggleEntry(entry.id)}
                            ariaControls={isExpanded ? diffId : undefined}
                            ariaLabel={isExpanded ? "Hide the diff" : "Show the diff"}
                          />
                        </div>
                      </div>

                      {isExpanded ? (
                        <div id={diffId} className="space-y-3">
                          <EditorActionGroup label="Save entry actions">
                            {entryFeedback?.entryId === entry.id ? (
                              <ActionNotice
                                tone={entryFeedback.tone}
                                onDismiss={clearEntryFeedback}
                              >
                                {entryFeedback.message}
                              </ActionNotice>
                            ) : null}
                            <Button
                              variant="glass"
                              size="xs"
                              className="rounded-full"
                              onClick={() => handleCopyEntry(entry)}
                            >
                              <Icon icon="lucide:copy" size={16} />
                              Copy diff
                            </Button>
                            <Button
                              variant="glass"
                              size="xs"
                              className="rounded-full"
                              onClick={() => handleDownloadEntry(entry)}
                            >
                              <Icon icon="lucide:download" size={16} />
                              Download .diff
                            </Button>
                          </EditorActionGroup>
                          <DiffPreview diffText={entry.markdown} maxHeight="min(60vh, 640px)" />
                        </div>
                      ) : null}
                    </article>
                  </Fragment>
                );
              })}
              <div className="flex flex-col items-center gap-2 pt-2">
                {canShowMoreEntries ? (
                  <Button
                    variant="glass"
                    size="pill"
                    className="rounded-full"
                    onClick={showMoreEntries}
                  >
                    Show more entries
                  </Button>
                ) : canLoadOlder ? (
                  <Button
                    variant="glass"
                    size="pill"
                    className="rounded-full"
                    onClick={feedWindow.loadMore}
                    disabled={feedWindow.loading}
                  >
                    {feedWindow.loading ? (
                      <Icon icon="lucide:loader-2" size={16} className="animate-spin" />
                    ) : (
                      <Icon icon="lucide:history" size={16} />
                    )}
                    {feedWindow.loading ? "Loading older saves" : "Load older saves"}
                  </Button>
                ) : feedWindow.atServerCap ? (
                  <p className="text-xs theme-text-faint">
                    {`Older saves are not loaded: this page holds the latest ${CHANGELOG_FEED_MAX_ROWS}.`}
                  </p>
                ) : null}
              </div>
            </div>
          )}
        </EditorSection>
      </div>
    </div>
  );
}
