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

export function useContributorProfiles() {
  const enabled = isConvexEnabled();
  const queryResult = useQuery(
    enabled ? api.contributorProfiles.getAll : (undefined as never),
    enabled ? {} : (undefined as never),
  );

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
