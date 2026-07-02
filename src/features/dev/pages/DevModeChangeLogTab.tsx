import { Fragment } from "react";
import { DiffPreview } from "@/features/dev/components/DiffPreview";
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
import type { ChangeLogController } from "./useDevModeChangeLog";

type DevModeChangeLogTabProps = {
  controller: ChangeLogController;
};

// Save entries generated without a hand-written message carry a
// "Dev editor update - <timestamp>" placeholder that duplicates the entry
// heading; hide it instead of printing the same instant twice.
const AUTO_SAVE_MESSAGE_PATTERN = /^Dev editor update - /;

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
                All time
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
            activeFilterCount > 0
              ? "Showing saves that match the active article, date, and search filters."
              : "Timeline of generated dataset diffs from Dev mode save activity."
          }
          actions={(
            <>
              <EditorStatusPill>{`${totalEntriesCount} entr${totalEntriesCount === 1 ? "y" : "ies"}`}</EditorStatusPill>
              {latestEntry ? (
                <EditorStatusPill>
                  Latest:{" "}
                  {new Date(latestEntry.createdAt).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </EditorStatusPill>
              ) : null}
              {articleFrequency[0] ? (
                <EditorStatusPill>
                  Most active: {articleFrequency[0].title}
                </EditorStatusPill>
              ) : null}
              <EditorStatusPill>
                {canShowMoreEntries
                  ? `${visibleEntries.length} of ${filteredEntries.length} shown`
                  : `${filteredEntries.length} shown`}
              </EditorStatusPill>
              {activeFilterCount > 0 ? (
                <EditorStatusPill tone="warning">{activeFilterCount} filter{activeFilterCount === 1 ? "" : "s"}</EditorStatusPill>
              ) : null}
            </>
          )}
        >
          {filteredEntries.length === 0 ? (
            <StateCard
              icon={activeFilterCount > 0 ? "lucide:search-x" : "lucide:wrench"}
              tone="neutral"
              align="center"
              compact
              title={activeFilterCount > 0 ? "No saves match these filters" : "No saves logged yet"}
              description={
                activeFilterCount > 0
                  ? "Clear filters or broaden the date range to review more saved diffs."
                  : "Ship your first draft to populate the timeline."
              }
              actions={activeFilterCount > 0 ? (
                <Button variant="glass" size="pill" className="rounded-full" onClick={clearFilters}>
                  Clear filters
                </Button>
              ) : undefined}
            />
          ) : (
            <div className="space-y-6">
              {visibleEntries.map((entry, index) => (
                <Fragment key={entry.id}>
                  {index > 0 ? (
                    <div className="theme-gradient-divider h-px" />
                  ) : null}
                  <div className="space-y-3">
                    <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                      <div>
                        <p className="text-sm font-semibold theme-text-primary">
                          {new Date(entry.createdAt).toLocaleString(undefined, {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </p>
                        {entry.commit?.url ? (
                          <p className="text-xs theme-text-muted">
                            <a
                              href={entry.commit.url}
                              target="_blank"
                              rel="noreferrer"
                              className="theme-accent-emphasis transition"
                            >
                              {entry.commit.message}
                            </a>
                          </p>
                        ) : entry.commit.message &&
                          !AUTO_SAVE_MESSAGE_PATTERN.test(entry.commit.message) ? (
                          <p className="text-xs theme-text-muted">{entry.commit.message}</p>
                        ) : null}
                        {entry.submittedBy && (
                          <p className="text-xs theme-text-faint">Submitted by {entry.submittedBy}</p>
                        )}
                      </div>
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
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
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
                    </div>

                    <DiffPreview diffText={entry.markdown} maxHeight={224} />
                  </div>
                </Fragment>
              ))}
              {canShowMoreEntries ? (
                <div className="flex justify-center pt-2">
                  <Button
                    variant="glass"
                    size="pill"
                    className="rounded-full"
                    onClick={showMoreEntries}
                  >
                    Show more entries
                  </Button>
                </div>
              ) : null}
            </div>
          )}
        </EditorSection>
      </div>
    </div>
  );
}
