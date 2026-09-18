import "server-only";

import { publicDataCache } from "./publicData.cache";
import { cache } from "react";
import { PUBLIC_DATA_CACHE_REVALIDATE_SECONDS, PUBLIC_DATA_CACHE_TAGS } from "./publicData.cache";
import { getPublicDataReadAdapter } from "./publicData.reads";
import type { IndexLayoutRecord, IndexLayoutType } from "./publicData.shared";

export const getIndexLayoutByType = cache(publicDataCache(async (type: IndexLayoutType): Promise<IndexLayoutRecord | null> => {
  return await getPublicDataReadAdapter().getPublicIndexLayoutByType(type);
}, ["data-public-index-layout-by-type"], {
  revalidate: PUBLIC_DATA_CACHE_REVALIDATE_SECONDS,
  tags: [PUBLIC_DATA_CACHE_TAGS.all, PUBLIC_DATA_CACHE_TAGS.layouts],
}));

export const getPublicDataOverview = cache(publicDataCache(async () => {
  return getPublicDataReadAdapter().getPublicOverviewCounts();
}, ["data-public-overview-counts-v1"], {
  revalidate: PUBLIC_DATA_CACHE_REVALIDATE_SECONDS,
  tags: [
    PUBLIC_DATA_CACHE_TAGS.all,
    PUBLIC_DATA_CACHE_TAGS.substances,
    PUBLIC_DATA_CACHE_TAGS.effects,
    PUBLIC_DATA_CACHE_TAGS.reports,
    PUBLIC_DATA_CACHE_TAGS.replications,
    PUBLIC_DATA_CACHE_TAGS.about,
    PUBLIC_DATA_CACHE_TAGS.layouts,
  ],
}));
