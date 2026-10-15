import "server-only";

import { cache } from "react";
import { PUBLIC_DATA_CACHE_REVALIDATE_SECONDS, publicDataCache } from "./publicData.cache";
import { PUBLIC_DATA_CACHE_TAGS } from "./publicData.cacheTags";
import { getPublicDataReadAdapter } from "./publicData.reads";
import type {
  PublicContributorIdentity,
  PublicReplicationIdentityAttribution,
} from "./publicData.shared";

export type {
  PublicContributorIdentity,
  PublicReplicationIdentityAttribution,
} from "./publicData.shared";

export const getPublicReplicationIdentityAttribution = cache(
  publicDataCache(async (replicationId: string): Promise<PublicReplicationIdentityAttribution | null> =>
    await getPublicDataReadAdapter().getPublicReplicationIdentityAttribution(replicationId),
  ["data-public-replication-identity-attribution-v1"],
  {
    revalidate: PUBLIC_DATA_CACHE_REVALIDATE_SECONDS,
    tags: [
      PUBLIC_DATA_CACHE_TAGS.all,
      PUBLIC_DATA_CACHE_TAGS.replications,
      PUBLIC_DATA_CACHE_TAGS.contributors,
    ],
  },),
);

export const getPublicContributorIdentity = cache(
  publicDataCache(async (canonicalKey: string): Promise<PublicContributorIdentity | null> =>
    await getPublicDataReadAdapter().getPublicContributorIdentityByKey(canonicalKey),
  ["data-public-contributor-identity-v1"],
  {
    revalidate: PUBLIC_DATA_CACHE_REVALIDATE_SECONDS,
    tags: [PUBLIC_DATA_CACHE_TAGS.all, PUBLIC_DATA_CACHE_TAGS.contributors],
  },),
);
