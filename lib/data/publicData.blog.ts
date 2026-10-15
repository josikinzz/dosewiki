import "server-only";

import { publicDataCache, PUBLIC_DATA_CACHE_REVALIDATE_SECONDS } from "./publicData.cache";
import { PUBLIC_DATA_CACHE_TAGS } from "./publicData.cacheTags";
import { cache } from "react";
import { getPublicDataReadAdapter } from "./publicData.reads";
import type { PublicEffectIndexPost } from "../../src/data/projections/effectIndexArchiveProjections";

export const getPublicEffectIndexPosts = cache(
  publicDataCache(async (): Promise<PublicEffectIndexPost[]> =>
    await getPublicDataReadAdapter().getPublicEffectIndexPosts(),
  ["data-public-effect-index-posts"],
  {
    revalidate: PUBLIC_DATA_CACHE_REVALIDATE_SECONDS,
    tags: [PUBLIC_DATA_CACHE_TAGS.all, PUBLIC_DATA_CACHE_TAGS.blog],
  },),
);

export const getPublicEffectIndexPostBySlug = cache(
  publicDataCache(async (slug: string): Promise<PublicEffectIndexPost | null> =>
    await getPublicDataReadAdapter().getPublicEffectIndexPostBySlug(slug),
  ["data-public-effect-index-post-by-slug"],
  {
    revalidate: PUBLIC_DATA_CACHE_REVALIDATE_SECONDS,
    tags: [PUBLIC_DATA_CACHE_TAGS.all, PUBLIC_DATA_CACHE_TAGS.blog],
  },),
);
