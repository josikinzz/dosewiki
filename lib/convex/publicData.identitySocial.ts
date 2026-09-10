import "server-only";

import { cache } from "react";
import {
  PUBLIC_CONVEX_CACHE_REVALIDATE_SECONDS,
  PUBLIC_CONVEX_CACHE_TAGS,
  publicDataCache,
} from "./publicData.cache";
import { getPublicDataReadAdapter } from "./publicData.reads";
import type {
  PublicContributorIdentity,
  PublicReplicationIdentityAttribution,
} from "./publicData.shared";

export type {
  PublicContributorIdentity,
  PublicIdentityParty,
  PublicReplicationIdentityAttribution,
} from "./publicData.shared";

export const getPublicReplicationIdentityAttribution = cache(
  publicDataCache(async (replicationId: string): Promise<PublicReplicationIdentityAttribution | null> =>
    await getPublicDataReadAdapter().getPublicReplicationIdentityAttribution(replicationId),
  ["convex-public-replication-identity-attribution-v1"],
  {
    revalidate: PUBLIC_CONVEX_CACHE_REVALIDATE_SECONDS,
    tags: [
      PUBLIC_CONVEX_CACHE_TAGS.all,
      PUBLIC_CONVEX_CACHE_TAGS.replications,
      PUBLIC_CONVEX_CACHE_TAGS.contributors,
    ],
  },),
);

export const getPublicContributorIdentity = cache(
  publicDataCache(async (canonicalKey: string): Promise<PublicContributorIdentity | null> =>
    await getPublicDataReadAdapter().getPublicContributorIdentityByKey(canonicalKey),
  ["convex-public-contributor-identity-v1"],
  {
    revalidate: PUBLIC_CONVEX_CACHE_REVALIDATE_SECONDS,
    tags: [PUBLIC_CONVEX_CACHE_TAGS.all, PUBLIC_CONVEX_CACHE_TAGS.contributors],
  },),
);
