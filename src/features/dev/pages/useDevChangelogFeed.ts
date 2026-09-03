import { useQuery as useConvexQuery } from "convex/react";
import { useCallback, useEffect, useState } from "react";

import { api } from "../../../../convex/_generated/api";
import {
  appendChangeLogEntry,
  initialChangeLogEntries,
  sortChangeLogEntries,
  type ChangeLogEntry,
} from "@/data/changelog/changeLog";
import { isConvexEnabled } from "@/lib/convex";

const CHANGELOG_FEED_LIMIT = 100;

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
  const convexEnabled = isConvexEnabled();

  const convexChangelogEntries = useConvexQuery(
    api.changelog.getRecent,
    convexEnabled && active ? { limit: CHANGELOG_FEED_LIMIT } : "skip",
  );

  useEffect(() => {
    if (!convexEnabled || !convexChangelogEntries) {
      return;
    }

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

  return {
    changeLogEntries,
    convexEnabled,
    appendChangeLogEntryToState,
  };
}

export const devChangelogFeedTestAdapters = {
  mergeStaticAndConvexChangelogEntries,
  normalizeConvexChangelogEntries,
};
