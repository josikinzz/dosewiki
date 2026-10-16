import "server-only";

import { getReplicationsByContributor } from "@server/data/publicData";
import type { NormalizedUserProfile } from "../../src/data/userProfiles";
import type { ReplicationWithUrl } from "../../src/types/replications";

export async function readContributorReplications(
  profile: NormalizedUserProfile,
): Promise<ReplicationWithUrl[]> {
  try {
    return await getReplicationsByContributor(profile);
  } catch (error) {
    console.warn(
      `[routeLoaders] replication credits unavailable for ${profile.key}; rendering without them.`,
      error,
    );
    return [];
  }
}
