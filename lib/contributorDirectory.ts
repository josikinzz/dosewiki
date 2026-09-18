import { findContributorProfileByAuthorName } from "./contributorProfileIdentity";
import { publicHref } from "../src/utils/publicHref";

type ContributorDirectoryEntry = {
  key: string;
  displayName: string;
  aliases: string[];
  /**
   * The profile's avatar, carried so credit-line surfaces (viewer byline chip,
   * artist groups) can render the claiming profile's face without reading
   * profiles themselves. Null when the profile has none.
   */
  avatarUrl?: string | null;
  /**
   * dose.wiki's endorsement of the artist (`contributorProfiles.approved_replicator`),
   * carried so the gallery can star and lift the artist's group. Absent means
   * an ordinary artist.
   */
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
