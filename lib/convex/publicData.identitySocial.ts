import "server-only";

import { unstable_cache } from "next/cache";
import { cache } from "react";
import {
  PUBLIC_CONVEX_CACHE_REVALIDATE_SECONDS,
  PUBLIC_CONVEX_CACHE_TAGS,
} from "./publicData.cache";
import { queryConvex } from "./serverClient";

export type PublicIdentityParty = {
  display_name: string;
  profile_key: string | null;
};

export type PublicReplicationIdentityAttribution = {
  poster: PublicIdentityParty & {
    profile_url: string | null;
    platform: string | null;
    posted_at: number;
  };
  creator: PublicIdentityParty;
  proven_different_creator: boolean;
};

export type PublicContributorIdentity = {
  canonical_key: string;
  aliases: string[];
  avatar_url: string | null;
  verified_replicator: boolean;
};

export const getPublicReplicationIdentityAttribution = cache(
  unstable_cache(
    async (replicationId: string): Promise<PublicReplicationIdentityAttribution | null> =>
      await queryConvex<
        PublicReplicationIdentityAttribution | null,
        { replication_id: string }
      >("publicReplicationIdentitySocial:getAttributionByReplicationId", {
        replication_id: replicationId,
      }),
    ["convex-public-replication-identity-attribution-v1"],
    {
      revalidate: PUBLIC_CONVEX_CACHE_REVALIDATE_SECONDS,
      tags: [
        PUBLIC_CONVEX_CACHE_TAGS.all,
        PUBLIC_CONVEX_CACHE_TAGS.replications,
        PUBLIC_CONVEX_CACHE_TAGS.contributors,
      ],
    },
  ),
);

export const getPublicContributorIdentity = cache(
  unstable_cache(
    async (canonicalKey: string): Promise<PublicContributorIdentity | null> =>
      await queryConvex<PublicContributorIdentity | null, { key: string }>(
        "publicReplicationIdentitySocial:getProfileIdentityByKey",
        { key: canonicalKey },
      ),
    ["convex-public-contributor-identity-v1"],
    {
      revalidate: PUBLIC_CONVEX_CACHE_REVALIDATE_SECONDS,
      tags: [PUBLIC_CONVEX_CACHE_TAGS.all, PUBLIC_CONVEX_CACHE_TAGS.contributors],
    },
  ),
);
