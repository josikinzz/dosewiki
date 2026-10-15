"use client";

import { useMemo } from "react";
import {
  findProfileByAuthorNameInList,
  getProfileByKeyFromList,
  type NormalizedUserProfile,
} from "@/data/userProfiles";
import { useEditorRead } from "./useEditorRead";

export function useContributorProfiles(active = true) {
  const queryResult = useEditorRead("contributorProfiles:getAll", active ? {} : "skip", "list");

  const profiles = useMemo<NormalizedUserProfile[]>(
    () => (Array.isArray(queryResult) ? queryResult : []),
    [queryResult],
  );

  const byKey = useMemo(() => new Map(profiles.map((profile) => [profile.key, profile])), [profiles]);

  return {
    profiles,
    byKey,
    isLoading: active && queryResult === undefined,
    findByAuthorName: (authorName: string) => findProfileByAuthorNameInList(profiles, authorName),
    getByKey: (key: string) => getProfileByKeyFromList(profiles, key),
  };
}
