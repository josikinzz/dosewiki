"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ExpandButton } from "@/components/common/ExpandButton";
import { Icon } from "@/components/common/Icon";
import { StateCard } from "@/components/common/StateCard";
import { Button } from "@/components/ui/button";
import type { ChangeLogEntry } from "@/data/changelog/changeLog";
import { getProfileByKeyFromList, type NormalizedUserProfile } from "@/data/userProfiles";
import { EditorSection, LoadErrorState, Notice, TagToken, useDevShortcuts } from "@/features/dev/components";
import { isTextEntryTarget } from "@/features/dev/components/devShortcuts";
import { LINK_LIST_CLASS, OnwardLink, RowSkeletons } from "@/features/dev/tools/home/homeParts";
import { cn } from "@/lib/utils";
import { devHref } from "@/utils/devHref";

import { ChangeLogEntryRow } from "./ChangeLogEntryRow";
import { ChangeLogFilters } from "./ChangeLogFilters";
import {
  countNoun,
  describeDateFilter,
  describeWindow,
  groupByDay,
  summarizeEntry,
} from "./changeLogModel";
import { CHANGELOG_FEED_MAX_ROWS } from "./useDevChangelogFeed";
import type { ChangeLogController } from "./useDevModeChangeLog";

type DevModeChangeLogTabProps = {
  controller: ChangeLogController;
  /** The contributor directory, so a save names who made it rather than a stamped key. */
  contributorProfiles?: readonly NormalizedUserProfile[];
};

const SHORTCUTS = [
  { keys: "/", label: "Search saves" },
  { keys: "j / k", label: "Next and previous save" },
] as const;

/** How many saves "Show more" adds; the controller reveals loaded saves in batches of this size. */
const REVEAL_BATCH = 20;

/**
 * Every save made in the editor, newest first, grouped by day. Filters sit in
 * a sticky column on desktop and fold behind one button on phones; each save
 * is one line that opens its diff in place.
 */
export function DevModeChangeLogTab({ controller, contributorProfiles = [] }: DevModeChangeLogTabProps) {
  const {
    notice,
    clearNotice,
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
    handleSubmitterSelect,
    setSearchQuery,
    applyQuickDateRange,
    clearFilters,
    focusArticleFilter,
    showMoreEntries,
    handleCopyEntry,
    handleDownloadEntry,
  } = controller;

  const searchRef = useRef<HTMLInputElement>(null);
  const feedRef = useRef<HTMLDivElement>(null);
  const shellListens = useDevShortcuts(SHORTCUTS);

  const nameFor = useCallback(
    (key: string) => getProfileByKeyFromList(contributorProfiles, key).displayName,
    [contributorProfiles],
  );

  // Diffs stay closed until asked for; ids are stable across filtering, so
  // an entry opened before a filter change is still open when it returns.
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(() => new Set());

  // Saves that land while the tab is open wait above the list instead of
  // shifting it under the reader: the newest time seen is the line.
  const [seenUpTo, setSeenUpTo] = useState<number | null>(null);
  const newestTime = latestEntry ? Date.parse(latestEntry.createdAt) : null;
  if (seenUpTo === null && feedWindow.loadedCount > 0 && newestTime !== null && !Number.isNaN(newestTime)) {
    setSeenUpTo(newestTime);
  }
  const isNew = useCallback(
    (entry: ChangeLogEntry) => seenUpTo !== null && Date.parse(entry.createdAt) > seenUpTo,
    [seenUpTo],
  );
  const newCount = useMemo(() => filteredEntries.filter(isNew).length, [filteredEntries, isNew]);
  const shownEntries = useMemo(() => visibleEntries.filter((entry) => !isNew(entry)), [isNew, visibleEntries]);

  const anyVisibleExpanded = useMemo(
    () => shownEntries.some((entry) => expandedIds.has(entry.id)),
    [expandedIds, shownEntries],
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
      const visibleIds = shownEntries.map((entry) => entry.id);
      const next = new Set(previous);
      if (visibleIds.some((id) => next.has(id))) {
        for (const id of visibleIds) next.delete(id);
      } else {
        for (const id of visibleIds) next.add(id);
      }
      return next;
    });
  }, [shownEntries]);

  const days = useMemo(
    () =>
      groupByDay(
        shownEntries.map((entry) => ({ entry, summary: summarizeEntry(entry) })),
        (row) => row.entry.createdAt,
      ),
    [shownEntries],
  );

  // `/` finds, j and k walk the saves; Enter or Space on a save opens it.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTextEntryTarget(event.target)) return;
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
      if (event.key === "/") {
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
        return;
      }
      if (event.key !== "j" && event.key !== "k") return;
      const toggles = Array.from(feedRef.current?.querySelectorAll<HTMLButtonElement>("[data-change-toggle]") ?? []);
      if (toggles.length === 0) return;
      event.preventDefault();
      const current = toggles.indexOf(document.activeElement as HTMLButtonElement);
      const next =
        current === -1
          ? event.key === "j" ? 0 : toggles.length - 1
          : Math.min(Math.max(current + (event.key === "j" ? 1 : -1), 0), toggles.length - 1);
      toggles[next].focus();
      toggles[next].scrollIntoView?.({ block: "nearest" });
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const feedState = describeWindow(feedWindow, totalEntriesCount);
  const firstPageLoading = feedWindow.loading && feedWindow.loadedCount === 0;
  const firstPageFailed = feedWindow.error !== null && feedWindow.loadedCount === 0;
  const serverEmpty = feedWindow.loadedCount === 0 && !feedWindow.loading && feedWindow.error === null;
  const olderPageFailed = feedWindow.error !== null && feedWindow.loadedCount > 0;
  const canLoadOlder = feedWindow.hasMore || (feedWindow.loading && feedWindow.loadedCount > 0);
  const mostEdited = articleFrequency[0] ?? null;
  const outsideFilters = totalEntriesCount - filteredEntries.length;
  const remaining = filteredEntries.length - visibleEntries.length;

  const articleTitle = filters.articleSlug
    ? articleOptions.find((option) => option.slug === filters.articleSlug)?.title ?? filters.articleSlug
    : null;
  const dateWords = describeDateFilter(filters.startDate, filters.endDate);
  const search = filters.searchQuery.trim();

  const summary = firstPageFailed ? null : firstPageLoading ? (
    <span aria-live="polite">Loading saves</span>
  ) : (
    <>
      {activeFilterCount > 0 ? (
        <>
          <span aria-live="polite">
            {`${filteredEntries.length} of ${countNoun(totalEntriesCount, "loaded save")} match`}
          </span>
          {feedWindow.loading ? <span className="sr-only">. Loading older saves</span> : null}
          {". "}
        </>
      ) : (
        <>
          <span aria-live="polite">{feedState.status}</span>
          {", newest first. "}
        </>
      )}
      {mostEdited && activeFilterCount === 0 ? (
        <>
          {"Most edited: "}
          <button
            type="button"
            onClick={() => focusArticleFilter(mostEdited.slug)}
            title={`Show only saves to ${mostEdited.title}`}
            className="theme-focus-ring theme-accent-underline rounded-chip font-medium text-dose-accent-strong underline-offset-4 hover:underline"
          >
            {mostEdited.title}
          </button>
          {` (${countNoun(mostEdited.count, "save")}).`}
        </>
      ) : null}
      {feedState.note ? <span className="mt-1 block">{feedState.note}</span> : null}
      {serverEmpty && totalEntriesCount > 0 ? (
        <span className="mt-1 block">The server history has no saves yet; these come with the site&apos;s archive.</span>
      ) : null}
    </>
  );

  return (
    <EditorSection
      className="min-w-0"
      icon="lucide:history"
      title="Change log"
      description={summary}
      actions={
        shownEntries.length > 0 && !firstPageLoading ? (
          <ExpandButton
            variant="floating"
            isExpanded={anyVisibleExpanded}
            onToggle={toggleAllVisible}
            label={anyVisibleExpanded ? "Close all" : "Open all"}
            ariaLabel={anyVisibleExpanded ? "Collapse every diff" : "Expand every diff"}
          />
        ) : undefined
      }
    >
      {notice ? (
        <Notice
          tone={notice.type === "error" ? "danger" : notice.type === "pending" ? "loading" : "success"}
          message={notice.message}
          dismiss={notice.type === "pending" ? undefined : clearNotice}
        />
      ) : null}
      <div className="grid w-full gap-6 lg:grid-cols-[17rem_minmax(0,1fr)] lg:gap-10">
        <aside aria-label="Filter saves" className={cn("min-w-0 lg:self-start", filtersCardClassName)}>
          <ChangeLogFilters controller={controller} searchRef={searchRef} nameFor={nameFor} searchKey={shellListens} />
        </aside>
        <div className="min-w-0 space-y-5">
          {activeFilterCount > 0 ? (
            <div role="group" aria-label={`Active filters, ${activeFilterCount}`} className="flex flex-wrap items-center gap-2">
              {articleTitle ? (
                <TagToken
                  variant="compact"
                  label={`Article: ${articleTitle}`}
                  onRemove={() => handleArticleSelect("__all__")}
                  removeLabel="Remove the article filter"
                />
              ) : null}
              {filters.submitter ? (
                <TagToken
                  variant="compact"
                  label={`By ${nameFor(filters.submitter)}`}
                  onRemove={() => handleSubmitterSelect(null)}
                  removeLabel="Remove the saved by filter"
                />
              ) : null}
              {dateWords ? (
                <TagToken
                  variant="compact"
                  label={dateWords}
                  onRemove={() => applyQuickDateRange(null)}
                  removeLabel="Remove the date filter"
                />
              ) : null}
              {search ? (
                <TagToken
                  variant="compact"
                  label={`“${search}”`}
                  onRemove={() => setSearchQuery("")}
                  removeLabel="Clear the search"
                />
              ) : null}
            </div>
          ) : null}

          {firstPageFailed ? (
            <LoadErrorState
              what="the change log"
              message={feedWindow.error ?? ""}
              onRetry={feedWindow.retry}
              busy={feedWindow.retrying}
            />
          ) : null}

          {newCount > 0 ? (
            <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <span className="theme-text-secondary flex items-center gap-2">
                <Icon icon="lucide:sparkles" size={15} className="theme-icon-accent shrink-0" />
                {`${countNoun(newCount, "new save")} landed since you opened this.`}
              </span>
              <Button type="button" variant="outline" size="sm" onClick={() => setSeenUpTo(newestTime)}>
                {newCount === 1 ? "Show it" : "Show them"}
              </Button>
            </div>
          ) : null}

          {firstPageLoading ? (
            <RowSkeletons rows={6} label="saves" />
          ) : filteredEntries.length === 0 && firstPageFailed && activeFilterCount === 0 ? null : filteredEntries.length === 0 ? (
            <StateCard
              icon={activeFilterCount > 0 ? "lucide:search-x" : "lucide:history"}
              tone="neutral"
              align="center"
              compact
              loading={feedWindow.loading}
              title={activeFilterCount > 0 ? "No loaded saves match these filters" : "No saves logged yet"}
              description={
                activeFilterCount > 0
                  ? [
                      outsideFilters > 0 ? `${countNoun(outsideFilters, "loaded save")} ${outsideFilters === 1 ? "is" : "are"} outside these filters.` : null,
                      canLoadOlder
                        ? "Older saves are not loaded yet and may match."
                        : feedWindow.atServerCap
                          ? `Only the latest ${CHANGELOG_FEED_MAX_ROWS} saves can be loaded here.`
                          : null,
                    ]
                      .filter(Boolean)
                      .join(" ")
                  : "Saves made in the editor appear here as soon as they land."
              }
              actions={
                activeFilterCount > 0 ? (
                  <>
                    {canLoadOlder ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={feedWindow.loadMore}
                        disabled={feedWindow.loading}
                      >
                        {feedWindow.loading ? "Loading older saves" : "Load older saves"}
                      </Button>
                    ) : null}
                    <Button type="button" variant="outline" size="sm" onClick={clearFilters}>
                      Clear filters
                    </Button>
                  </>
                ) : (
                  <OnwardLink href={devHref({ type: "dev", tab: "articles" })}>Open Substances</OnwardLink>
                )
              }
            />
          ) : (
            <div ref={feedRef} className="space-y-6">
              {firstPageFailed ? (
                <p className="theme-text-muted text-sm">
                  {`Below are the ${countNoun(totalEntriesCount, "save")} bundled with the site's archive; newer saves are on the server.`}
                </p>
              ) : null}
              {days.map((day) => {
                const headingId = `change-log-day-${day.key}`;
                return (
                  <section key={day.key} aria-labelledby={headingId} className="space-y-1">
                    <h3 id={headingId} className="flex items-baseline justify-between gap-3 px-0">
                      <span className="theme-text-primary text-sm font-semibold" title={day.full}>
                        {day.label}
                      </span>
                      <span className="theme-text-faint text-xs tabular-nums">{countNoun(day.items.length, "save")}</span>
                    </h3>
                    <ul className={LINK_LIST_CLASS}>
                      {day.items.map(({ entry, summary: entrySummary }) => (
                        <li key={entry.id}>
                          <ChangeLogEntryRow
                            entry={entry}
                            summary={entrySummary}
                            isExpanded={expandedIds.has(entry.id)}
                            onToggle={toggleEntry}
                            submitter={entry.submittedBy ? nameFor(entry.submittedBy) : null}
                            archived={feedWindow.archivedIds.has(entry.id)}
                            filterSlug={filters.articleSlug}
                            search={search}
                            feedback={entryFeedback?.entryId === entry.id ? entryFeedback : null}
                            onClearFeedback={clearEntryFeedback}
                            onFilterArticle={focusArticleFilter}
                            onCopy={handleCopyEntry}
                            onDownload={handleDownloadEntry}
                          />
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}

              <div className="flex flex-col items-center gap-2 border-t border-dose-divider pt-4 text-center">
                <p className="theme-text-faint text-xs tabular-nums">
                  {`Showing ${visibleEntries.length} of ${countNoun(filteredEntries.length, activeFilterCount > 0 ? "matching save" : "loaded save")}`}
                </p>
                {canShowMoreEntries ? (
                  <Button type="button" variant="outline" size="sm" onClick={showMoreEntries}>
                    {`Show ${Math.min(REVEAL_BATCH, remaining)} more`}
                  </Button>
                ) : olderPageFailed ? (
                  <LoadErrorState
                    what="older saves"
                    message={feedWindow.error ?? ""}
                    onRetry={feedWindow.retry}
                    busy={feedWindow.retrying}
                  />
                ) : canLoadOlder ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={feedWindow.loadMore}
                    disabled={feedWindow.loading}
                    aria-busy={feedWindow.loading || undefined}
                  >
                    <Icon
                      icon={feedWindow.loading ? "lucide:loader-2" : "lucide:history"}
                      size={15}
                      className={feedWindow.loading ? "animate-spin motion-reduce:animate-none" : undefined}
                    />
                    {feedWindow.loading ? "Loading older saves" : "Load older saves"}
                  </Button>
                ) : feedWindow.atServerCap ? (
                  <p className="theme-text-faint text-xs">
                    {`Older saves are not loaded: this page holds the latest ${CHANGELOG_FEED_MAX_ROWS}.`}
                  </p>
                ) : firstPageFailed ? null : (
                  <p className="theme-text-faint text-xs">
                    {activeFilterCount > 0 ? "That is every loaded save that matches." : "That is every save."}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </EditorSection>
  );
}
