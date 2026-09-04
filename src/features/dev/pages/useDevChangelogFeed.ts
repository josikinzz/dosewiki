import { useQuery as useConvexQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { api } from "../../../../convex/_generated/api";
import {
  appendChangeLogEntry,
  initialChangeLogEntries,
  sortChangeLogEntries,
  type ChangeLogEntry,
} from "@/data/changelog/changeLog";
import { isConvexEnabled } from "@/lib/convex";

/** Server rows fetched per page; each "Load older saves" adds one more page. */
export const CHANGELOG_FEED_PAGE_SIZE = 100;
/** The most rows `changelog.getRecent` will return; older saves are unreachable here. */
export const CHANGELOG_FEED_MAX_ROWS = 500;

/**
 * What the change log knows about the slice of server history it holds, so
 * the tab can say so instead of presenting a capped feed as the whole record.
 */
export type ChangelogFeedWindow = {
  /** Server rows currently held; 0 until the first page arrives or when Convex is off. */
  loadedCount: number;
  /** The last page came back full and the server cap is not reached: older saves can be loaded. */
  hasMore: boolean;
  /** The window is as large as the server allows; anything older cannot be loaded from this page. */
  atServerCap: boolean;
  /** A page is in flight (the first one, or an older one after `loadMore`). */
  loading: boolean;
  loadMore: () => void;
};

function normalizeConvexChangelogEntries(
  convexEntries: readonly {
    entryId: string;
    createdAt: string;
    message: string;
    articles: ChangeLogEntry["articles"];
    markdown: string;
    submittedBy?: string | null;
  }[],
): ChangeLogEntry[] {
  return convexEntries.map((entry) => ({
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

function mergeStaticAndConvexChangelogEntries(
  staticEntries: readonly ChangeLogEntry[],
  convexEntries: readonly ChangeLogEntry[],
): ChangeLogEntry[] {
  const staticIds = new Set(staticEntries.map((entry) => entry.id));
  return sortChangeLogEntries([
    ...convexEntries.filter((entry) => !staticIds.has(entry.id)),
    ...staticEntries,
  ]);
}

/**
 * @param active - Only the change log displays the feed, so only it subscribes.
 * `convexEnabled` is reported independently of this, because the save path
 * uses it to decide where a commit goes.
 */
export function useDevChangelogFeed({ active = true }: { active?: boolean }) {
  const [changeLogEntries, setChangeLogEntries] = useState<ChangeLogEntry[]>(() =>
    sortChangeLogEntries(initialChangeLogEntries),
  );
  const [limit, setLimit] = useState(CHANGELOG_FEED_PAGE_SIZE);
  const [loadedCount, setLoadedCount] = useState(0);
  const convexEnabled = isConvexEnabled();

  const convexChangelogEntries = useConvexQuery(
    api.changelog.getRecent,
    convexEnabled && active ? { limit } : "skip",
  );

  useEffect(() => {
    if (!convexEnabled || !convexChangelogEntries) {
      return;
    }

    setLoadedCount(convexChangelogEntries.length);
    setChangeLogEntries((previous) => {
      const merged = mergeStaticAndConvexChangelogEntries(
        initialChangeLogEntries,
        normalizeConvexChangelogEntries(convexChangelogEntries),
      );

      // Keep locally appended entries (a save's entry can land here before
      // the Convex subscription catches up) instead of rebuilding from the
      // static snapshot.
      const mergedIds = new Set(merged.map((entry) => entry.id));
      const localOnlyEntries = previous.filter((entry) => !mergedIds.has(entry.id));

      return localOnlyEntries.length > 0
        ? sortChangeLogEntries([...localOnlyEntries, ...merged])
        : merged;
    });
  }, [convexChangelogEntries, convexEnabled]);

  const appendChangeLogEntryToState = useCallback((entry: ChangeLogEntry) => {
    setChangeLogEntries((previous) => appendChangeLogEntry(previous, entry));
  }, []);

  // A page is loading whenever the subscription is live but has no answer:
  // Convex reports the changed `limit` as undefined until the wider page lands.
  const loading = convexEnabled && active && convexChangelogEntries === undefined;
  const atServerCap = convexEnabled && loadedCount >= CHANGELOG_FEED_MAX_ROWS;
  const hasMore = convexEnabled && !atServerCap && loadedCount >= limit && limit < CHANGELOG_FEED_MAX_ROWS;

  const loadMore = useCallback(() => {
    if (loading) {
      return;
    }
    setLimit((previous) => Math.min(previous + CHANGELOG_FEED_PAGE_SIZE, CHANGELOG_FEED_MAX_ROWS));
  }, [loading]);

  const feedWindow = useMemo<ChangelogFeedWindow>(
    () => ({ loadedCount, hasMore, atServerCap, loading, loadMore }),
    [atServerCap, hasMore, loadMore, loadedCount, loading],
  );

  return {
    changeLogEntries,
    convexEnabled,
    appendChangeLogEntryToState,
    feedWindow,
  };
}

export const devChangelogFeedTestAdapters = {
  mergeStaticAndConvexChangelogEntries,
  normalizeConvexChangelogEntries,
};
