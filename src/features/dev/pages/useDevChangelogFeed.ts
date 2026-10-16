import { useCallback, useEffect, useMemo, useState } from "react";

import {
  appendChangeLogEntry,
  initialChangeLogEntries,
  sortChangeLogEntries,
  type ChangeLogEntry,
} from "@/data/changelog/changeLog";
import { useEditorReadState } from "@/hooks/useEditorRead";

export const CHANGELOG_FEED_PAGE_SIZE = 100;
export const CHANGELOG_FEED_MAX_ROWS = 500;

export type ChangelogFeedWindow = {
  loadedCount: number;
  hasMore: boolean;
  atServerCap: boolean;
  loading: boolean;
  loadMore: () => void;
  error: string | null;
  retrying: boolean;
  retry: () => void;
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

export function useDevChangelogFeed({ active = true }: { active?: boolean }) {
  const [changeLogEntries, setChangeLogEntries] = useState<ChangeLogEntry[]>(() =>
    sortChangeLogEntries(initialChangeLogEntries),
  );
  const [limit, setLimit] = useState(CHANGELOG_FEED_PAGE_SIZE);
  const [loadedCount, setLoadedCount] = useState(0);
  const [serverIds, setServerIds] = useState<ReadonlySet<string>>(() => new Set());

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

  const archivedIds = useMemo<ReadonlySet<string>>(
    () => new Set([...STATIC_IDS].filter((id) => !serverIds.has(id))),
    [serverIds],
  );

  const error = active ? readError : null;
  const loading = active && dataChangelogEntries === undefined && error === null;
  const retrying = error !== null && fetching;
  const atServerCap = loadedCount >= CHANGELOG_FEED_MAX_ROWS;
  const hasMore = !atServerCap && loadedCount >= limit && limit < CHANGELOG_FEED_MAX_ROWS;

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


