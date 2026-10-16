import { findContributorProfileByAuthorName } from "./contributorProfileIdentity";
import { publicHref } from "../src/utils/publicHref";

type ContributorDirectoryEntry = {
  key: string;
  displayName: string;
  aliases: string[];
  avatarUrl?: string | null;
  approvedReplicator?: boolean;
}

export type ContributorDirectory = readonly ContributorDirectoryEntry[];

export function resolveContributorHref(
  name: string,
  directory: ContributorDirectory,
): string | null {
  const profile = findContributorProfileByAuthorName(directory, name);
  if (!profile) {
    return null;
  }

  return publicHref.contributor(profile.key.toLowerCase());
}
