import "server-only";

import { publicDataCache } from "./publicData.cache"
import { cache } from "react";
import {
  PUBLIC_DATA_CACHE_REVALIDATE_SECONDS,
  PUBLIC_DATA_CACHE_TAGS,
} from "./publicData.cache";
import { getPublicDataReadAdapter } from "./publicData.reads";
import type { PublicEffectIndexPost } from "../../src/data/projections/effectIndexArchiveProjections";

/**
 * Public reader for the archived Effect Index blog. The posts live in the lossless
 * `effectIndexArchive` table rather than a first-class content table, so the read adapter
 * decodes them through the archive read projection before they reach any page.
 *
 * Only reached from the Effect Index flavor's routes; on dose.wiki the pages 404 before
 * a read is issued.
 */
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
