"use client";

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import {
  findProfileByAuthorNameInList,
  getProfileByKeyFromList,
  type NormalizedUserProfile,
} from "@/data/userProfiles";
import { isConvexEnabled } from "@/lib/convex";

/**
 * @param active - Callers that only need the directory on some surfaces pass
 * false to skip the subscription entirely; the shape of the result is
 * unchanged (an empty directory that is not loading).
 */
export function useContributorProfiles(active = true) {
  const enabled = active && isConvexEnabled();
  // "skip" on the args is the only supported way to disable a Convex query —
  // an undefined function reference crashes getFunctionName at render time.
  const queryResult = useQuery(api.contributorProfiles.getAll, enabled ? {} : "skip");

  const profiles = useMemo<NormalizedUserProfile[]>(
    () => (Array.isArray(queryResult) ? queryResult : []),
    [queryResult],
  );

  const byKey = useMemo(() => new Map(profiles.map((profile) => [profile.key, profile])), [profiles]);

  return {
    profiles,
    byKey,
    isLoading: enabled && queryResult === undefined,
    findByAuthorName: (authorName: string) => findProfileByAuthorNameInList(profiles, authorName),
    getByKey: (key: string) => getProfileByKeyFromList(profiles, key),
  };
}
