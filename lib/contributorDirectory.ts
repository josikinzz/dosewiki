import { findContributorProfileByAuthorName } from "./contributorProfileIdentity";
import { publicHref } from "../src/utils/publicHref";

export type ContributorDirectoryEntry = {
  key: string;
  displayName: string;
  aliases: string[];
  /**
   * The contributor's curated work ordering, carried on the directory because
   * the gallery groups by credit line and never reads profiles itself. Absent
   * on a profile that has curated nothing, which means "default sort".
   */
  replicationOrder?: string[];
  /**
   * The profile's avatar, carried so credit-line surfaces (viewer byline chip,
   * artist groups) can render the claiming profile's face without reading
   * profiles themselves. Null when the profile has none.
   */
  avatarUrl?: string | null;
};

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

/**
 * The curated work ordering for a credit line, or `undefined` when the credit
 * resolves to no profile or that profile has curated nothing.
 *
 * Resolution goes through the same alias-aware matcher as `resolveContributorHref`
 * so an artist heading and the ordering under it can never disagree about which
 * profile the credit belongs to.
 */
export function resolveContributorReplicationOrder(
  name: string,
  directory: ContributorDirectory,
): string[] | undefined {
  const profile = findContributorProfileByAuthorName(directory, name);
  return profile?.replicationOrder?.length
    ? profile.replicationOrder
    : undefined;
}
