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

export function useDevChangelogFeed({ profileKey }: { profileKey: string }) {
  const [changeLogEntries, setChangeLogEntries] = useState<ChangeLogEntry[]>(() =>
    sortChangeLogEntries(initialChangeLogEntries),
  );
  const convexEnabled = isConvexEnabled();

  const convexChangelogEntries = useConvexQuery(
    api.changelog.getRecent,
    convexEnabled ? { limit: CHANGELOG_FEED_LIMIT } : "skip",
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

      // Keep locally appended entries (GitHub archives are not persisted to
      // the Convex changelog) instead of rebuilding from the static snapshot.
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

  const getProfileHistory = useCallback(
    (nextProfileKey: string) => {
      if (!nextProfileKey) {
        return [] as ChangeLogEntry[];
      }

      return changeLogEntries
        .filter((entry) => (entry.submittedBy ?? "").toUpperCase() === nextProfileKey)
        .slice(0, 6);
    },
    [changeLogEntries],
  );

  const profileHistory = useMemo(() => {
    if (!profileKey) {
      return [] as ChangeLogEntry[];
    }

    return getProfileHistory(profileKey);
  }, [getProfileHistory, profileKey]);

  return {
    changeLogEntries,
    profileHistory,
    getProfileHistory,
    convexEnabled,
    appendChangeLogEntryToState,
  };
}

export const devChangelogFeedTestAdapters = {
  mergeStaticAndConvexChangelogEntries,
  normalizeConvexChangelogEntries,
};
