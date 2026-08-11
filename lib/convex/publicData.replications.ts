import "server-only";

import { unstable_cache } from "next/cache";
import { cache } from "react";
import { contributorMatchNames } from "../contributorProfileIdentity";
import { PUBLIC_CONVEX_CACHE_REVALIDATE_SECONDS, PUBLIC_CONVEX_CACHE_TAGS } from "./publicData.cache";
import { getPublicDataReadAdapter } from "./publicData.reads";
import type { NormalizedUserProfile } from "../../src/data/userProfiles";
import { isPublishableReplication, type ReplicationWithUrl } from "../../src/types/replications";

/**
 * Every replication credited to one contributor.
 *
 * The join is resolved inside Convex (`replications:getByArtistNames`) rather
 * than by filtering a whole-table read here, so only the contributor's own works
 * cross the wire and only they pay storage URL resolution.
 *
 * `contributorMatchNames` is the app's single definition of "this name is that
 * contributor" and is shared with the trip-report join, so a profile's works and
 * their reports can never disagree about which credits belong to them.
 *
 * A figure credited to the same person is not one of their works: the rail is
 * headed "Replications" and a diagram under it would also inflate the count
 * beside that heading and add a step to the permalink's artist walk. See the
 * note on `getPublicReplications` in `publicData.effects` for why the gate sits
 * on this side of Convex.
 */
export const getReplicationsByContributor = cache(unstable_cache(async (
  profile: NormalizedUserProfile,
): Promise<ReplicationWithUrl[]> => {
  const artistNames = contributorMatchNames(profile);
  if (artistNames.length === 0) {
    return [];
  }

  return (await getPublicDataReadAdapter().getPublicReplicationsByArtistNames(artistNames)).filter(
    isPublishableReplication,
  );
}, ["convex-public-replications-by-contributor"], {
  revalidate: PUBLIC_CONVEX_CACHE_REVALIDATE_SECONDS,
  tags: [
    PUBLIC_CONVEX_CACHE_TAGS.all,
    PUBLIC_CONVEX_CACHE_TAGS.replications,
    PUBLIC_CONVEX_CACHE_TAGS.contributors,
  ],
}));
