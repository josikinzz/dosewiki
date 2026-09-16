import "server-only";

import { cache } from "react";
import { isPublishableReplication, type ReplicationWithUrl } from "../../src/types/replications";
import { publicDataCache, PUBLIC_DATA_CACHE_REVALIDATE_SECONDS, PUBLIC_DATA_CACHE_TAGS } from "./publicData.cache";
import { getPublicDataReadAdapter } from "./publicData.reads";

/** Leaf cache: callers assembling corpus collections must remain request-scoped. */
const getPublicReplicationsBySlugBatch = cache(publicDataCache(async (
  slugs: string[],
): Promise<ReplicationWithUrl[]> => {
  return await getPublicDataReadAdapter().getPublicReplicationsBySlugs(slugs);
}, ["data-public-replications-by-slug-batch-v1"], {
  revalidate: PUBLIC_DATA_CACHE_REVALIDATE_SECONDS,
  awaitRefresh: true,
  tags: [PUBLIC_DATA_CACHE_TAGS.all, PUBLIC_DATA_CACHE_TAGS.replications],
}));

/** Hydrate slim catalog selections with complete public media and rights metadata. */
export const getPublicReplicationsBySlugs = cache(async (
  slugs: string[],
): Promise<ReplicationWithUrl[]> => {
  const uniqueSlugs = [...new Set(slugs)];
  const replications: ReplicationWithUrl[] = [];
  for (let offset = 0; offset < uniqueSlugs.length; offset += 100) {
    replications.push(...await getPublicReplicationsBySlugBatch(uniqueSlugs.slice(offset, offset + 100)));
  }
  return replications.filter(isPublishableReplication);
});
