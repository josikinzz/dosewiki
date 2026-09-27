import { useCallback, useEffect, useMemo, useState } from "react";

import {
  appendChangeLogEntry,
  initialChangeLogEntries,
  sortChangeLogEntries,
  type ChangeLogEntry,
} from "@/data/changelog/changeLog";
import { useEditorReadState } from "@/hooks/useEditorRead";

/** Server rows fetched per page; each "Load older saves" adds one more page. */
export const CHANGELOG_FEED_PAGE_SIZE = 100;
/** The most rows `changelog.getRecent` will return; older saves are unreachable here. */
export const CHANGELOG_FEED_MAX_ROWS = 500;

/**
 * What the change log knows about the slice of server history it holds, so
 * the tab can say so instead of presenting a capped feed as the whole record.
 */
export type ChangelogFeedWindow = {
  /** Server rows currently held; 0 until the first page arrives or when Postgres is off. */
  loadedCount: number;
  /** The last page came back full and the server cap is not reached: older saves can be loaded. */
  hasMore: boolean;
  /** The window is as large as the server allows; anything older cannot be loaded from this page. */
  atServerCap: boolean;
  /** A page is in flight (the first one, or an older one after `loadMore`). */
  loading: boolean;
  loadMore: () => void;
  /**
   * The page being read failed before it answered: the first page when
   * `loadedCount` is 0, an older page otherwise. The saves already held stay.
   */
  error: string | null;
  /** A retry of the failed page is in flight. */
  retrying: boolean;
  retry: () => void;
  /**
   * Saves that came with the site's bundled archive and are not in the server
   * rows held, so the tab can tell them apart from live history.
   */
  archivedIds: ReadonlySet<string>;
};

const STATIC_IDS: ReadonlySet<string> = new Set(initialChangeLogEntries.map((entry) => entry.id));

function normalizeDataChangelogEntries(
  dataEntries: readonly {
    entryId: string;
    createdAt: string;
    message: string;
    articles: ChangeLogEntry["articles"];
    markdown: string;
    submittedBy?: string | null;
  }[],
): ChangeLogEntry[] {
  return dataEntries.map((entry) => ({
    id: entry.entryId,
    createdAt: entry.createdAt,
    commit: {
      sha: "",
      url: "",
      message: entry.message,
    },
    articles: entry.articles,
    markdown: entry.markdown,
    submittedBy: entry.submittedBy ?? null,
  }));
}

function mergeStaticAndDataChangelogEntries(
  staticEntries: readonly ChangeLogEntry[],
  dataEntries: readonly ChangeLogEntry[],
): ChangeLogEntry[] {
  const staticIds = new Set(staticEntries.map((entry) => entry.id));
  return sortChangeLogEntries([
    ...dataEntries.filter((entry) => !staticIds.has(entry.id)),
    ...staticEntries,
  ]);
}

/**
 * @param active - Only the change log displays the feed, so only it reads it.
 */
export function useDevChangelogFeed({ active = true }: { active?: boolean }) {
  const [changeLogEntries, setChangeLogEntries] = useState<ChangeLogEntry[]>(() =>
    sortChangeLogEntries(initialChangeLogEntries),
  );
  const [limit, setLimit] = useState(CHANGELOG_FEED_PAGE_SIZE);
  const [loadedCount, setLoadedCount] = useState(0);
  // The ids the last server page held; kept while a wider page loads.
  const [serverIds, setServerIds] = useState<ReadonlySet<string>>(() => new Set());

  // A failed read is drawn by the tab (with Try again) instead of throwing to
  // the route error boundary, which would take the whole editor down with it.
  const {
    data: dataChangelogEntries,
    error: readError,
    fetching,
    retry,
  } = useEditorReadState("changelog:getRecent", active ? { limit } : "skip", "list");

  useEffect(() => {
    if (!dataChangelogEntries) {
      return;
    }

    setLoadedCount(dataChangelogEntries.length);
    setServerIds(new Set(dataChangelogEntries.map((entry) => entry.entryId)));
    setChangeLogEntries((previous) => {
      const merged = mergeStaticAndDataChangelogEntries(
        initialChangeLogEntries,
        normalizeDataChangelogEntries(dataChangelogEntries),
      );

      // Keep locally appended entries (a save's entry can land here before
      // the server feed catches up) instead of rebuilding from the static
      // snapshot.
      const mergedIds = new Set(merged.map((entry) => entry.id));
      const localOnlyEntries = previous.filter((entry) => !mergedIds.has(entry.id));

      return localOnlyEntries.length > 0
        ? sortChangeLogEntries([...localOnlyEntries, ...merged])
        : merged;
    });
  }, [dataChangelogEntries]);

  const appendChangeLogEntryToState = useCallback((entry: ChangeLogEntry) => {
    setChangeLogEntries((previous) => appendChangeLogEntry(previous, entry));
  }, []);

  // A page is loading whenever the read is live but has no answer: a changed
  // `limit` reads as undefined until the wider page lands.
  const archivedIds = useMemo<ReadonlySet<string>>(
    () => new Set([...STATIC_IDS].filter((id) => !serverIds.has(id))),
    [serverIds],
  );

  const error = active ? readError : null;
  const loading = active && dataChangelogEntries === undefined && error === null;
  const retrying = error !== null && fetching;
  const atServerCap = loadedCount >= CHANGELOG_FEED_MAX_ROWS;
  const hasMore = !atServerCap && loadedCount >= limit && limit < CHANGELOG_FEED_MAX_ROWS;

  // A failed page is retried as it is, never skipped past for a wider one.
  const loadMore = useCallback(() => {
    if (loading || error !== null) {
      return;
    }
    setLimit((previous) => Math.min(previous + CHANGELOG_FEED_PAGE_SIZE, CHANGELOG_FEED_MAX_ROWS));
  }, [error, loading]);

  const feedWindow = useMemo<ChangelogFeedWindow>(
    () => ({ loadedCount, hasMore, atServerCap, loading, loadMore, error, retrying, retry, archivedIds }),
    [archivedIds, atServerCap, error, hasMore, loadMore, loadedCount, loading, retry, retrying],
  );

  return {
    changeLogEntries,
    appendChangeLogEntryToState,
    feedWindow,
  };
}


