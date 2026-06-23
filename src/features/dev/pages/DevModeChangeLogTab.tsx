import { DiffPreview } from "@/features/dev/components/DiffPreview";
import { Icon } from "@/components/common/Icon";
import { StateCard } from "@/components/common/StateCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NestedContentCard } from "@/components/ui/surface";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  EditorActionGroup,
  EditorField,
  EditorFieldRow,
  EditorNotice,
  EditorPanel,
  EditorPanelBody,
  EditorPanelHeader,
  EditorStatusPill,
  EditorToolbar,
} from "@/features/dev/components";
import { viewToPath } from "@/utils/routing";
import type { ChangeLogController } from "./useDevModeChangeLog";

type DevModeChangeLogTabProps = {
  controller: ChangeLogController;
};

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
    <div className="mt-10 grid w-full gap-6 md:grid-cols-[19rem,1fr]">
      <div className="min-w-0 space-y-6">
        <EditorPanel className={filtersCardClassName}>
          <EditorPanelHeader title="Refine history" icon="lucide:filter" />
          <EditorPanelBody className="space-y-4">
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
              placeholder="Find commits by keyword or diff copy…"
              value={filters.searchQuery}
              onChange={handleSearchChange}
            />
          </EditorField>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <EditorStatusPill>{`${totalEntriesCount} entr${totalEntriesCount === 1 ? "y" : "ies"}`}</EditorStatusPill>
            {latestEntry && (
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
            )}
            {articleFrequency[0] && (
              <EditorStatusPill>
                Most active: {articleFrequency[0].title}
              </EditorStatusPill>
            )}
          </div>

          {activeFilterCount > 0 && (
            <div className="flex items-center justify-between rounded-xl border border-[color:var(--editor-panel-border)] bg-[var(--editor-panel-bg-subtle)] px-3 py-2 text-xs theme-text-muted">
              <span>{activeFilterCount} filters active</span>
              <Button variant="ghost" size="xs" onClick={clearFilters}>
                Clear
              </Button>
            </div>
          )}
          </EditorPanelBody>
        </EditorPanel>
      </div>

      <div className="min-w-0 space-y-6">
        {notice && (
          <EditorNotice
            notice={{
              tone: notice.type === "error" ? "danger" : "success",
              message: notice.message,
              live: notice.type === "error",
            }}
          />
        )}

        <EditorPanel className="min-w-0">
          <EditorPanelHeader
            title="GitHub commits"
            icon="lucide:github"
            description={
              activeFilterCount > 0
                ? "Showing commit entries that match the active article, date, and search filters."
                : "Timeline of generated dataset diffs from Dev mode save activity."
            }
            meta={(
              <>
                <EditorStatusPill>{`${filteredEntries.length} shown`}</EditorStatusPill>
                {activeFilterCount > 0 ? (
                  <EditorStatusPill tone="warning">{activeFilterCount} filter{activeFilterCount === 1 ? "" : "s"}</EditorStatusPill>
                ) : null}
              </>
            )}
          />
          <EditorPanelBody className="space-y-4">

          {filteredEntries.length === 0 ? (
            <StateCard
              icon={activeFilterCount > 0 ? "lucide:search-x" : "lucide:wrench"}
              tone="neutral"
              align="center"
              compact
              title={activeFilterCount > 0 ? "No commits match these filters" : "No commits logged yet"}
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
            <div className="space-y-4">
              {visibleEntries.map((entry) => (
                <NestedContentCard
                  key={entry.id}
                  padding="none"
                  className="overflow-hidden"
                >
                  <div className="space-y-3 p-4 sm:p-5">
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
                      <p className="text-xs theme-text-muted">
                        {entry.commit?.url ? (
                          <a
                            href={entry.commit.url}
                            target="_blank"
                            rel="noreferrer"
                            className="theme-accent-emphasis transition "
                          >
                            {entry.commit.message}
                          </a>
                        ) : (
                          entry.commit.message
                        )}
                      </p>
                      {entry.submittedBy && (
                        <p className="text-xs theme-text-faint">Submitted by {entry.submittedBy}</p>
                      )}
                    </div>
                    <EditorActionGroup label="Commit entry actions">
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

                  <div className="flex flex-wrap gap-2">
                    {entry.articles.map((article) => {
                      const href = viewToPath({ type: "substance", slug: article.slug });
                      return (
                        <Button
                          key={`${entry.id}-${article.slug}`}
                          variant="glass"
                          size="xs"
                          className="rounded-full"
                          asChild
                        >
                          <a
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => focusArticleFilter(article.slug)}
                          >
                            {article.title}
                          </a>
                        </Button>
                      );
                    })}
                  </div>

                  <DiffPreview diffText={entry.markdown} className="max-h-56" />
                  </div>
                </NestedContentCard>
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
          </EditorPanelBody>
        </EditorPanel>
      </div>
    </div>
  );
}
