import "server-only";

import { publicDataCache, PUBLIC_DATA_CACHE_REVALIDATE_SECONDS } from "./publicData.cache";
import { PUBLIC_DATA_CACHE_TAGS } from "./publicData.cacheTags";
import { cache } from "react";
import { getPublicDataReadAdapter } from "./publicData.reads";
import type { PublicEffectIndexArticle, PublicPublicationIndexEntry } from "./publicData.shared";

export const getPublicEffectIndexArticles = cache(
  publicDataCache(async (): Promise<PublicEffectIndexArticle[]> =>
    await getPublicDataReadAdapter().getPublicEffectIndexArticles(),
  ["data-public-effect-index-articles"],
  {
    revalidate: PUBLIC_DATA_CACHE_REVALIDATE_SECONDS,
    tags: [PUBLIC_DATA_CACHE_TAGS.all, PUBLIC_DATA_CACHE_TAGS.articles],
  },),
);

export const getPublishedEffectIndexArticles = cache(
  publicDataCache(async (): Promise<PublicEffectIndexArticle[]> =>
    await getPublicDataReadAdapter().getPublishedEffectIndexArticles(),
  ["data-published-effect-index-articles"],
  {
    revalidate: PUBLIC_DATA_CACHE_REVALIDATE_SECONDS,
    tags: [PUBLIC_DATA_CACHE_TAGS.all, PUBLIC_DATA_CACHE_TAGS.articles],
  },),
);

export const getPublishedPublicationIndex = cache(publicDataCache(
  async (kind: "article" | "blog"): Promise<PublicPublicationIndexEntry[]> =>
    getPublicDataReadAdapter().getPublishedPublicationIndex(kind),
  ["data-published-publication-index"],
  {
    revalidate: PUBLIC_DATA_CACHE_REVALIDATE_SECONDS,
    tags: [PUBLIC_DATA_CACHE_TAGS.all, PUBLIC_DATA_CACHE_TAGS.articles],
  },
));

export const getPublicEffectIndexArticleBySlug = cache(
  publicDataCache(async (slug: string): Promise<PublicEffectIndexArticle | null> =>
    await getPublicDataReadAdapter().getPublicEffectIndexArticleBySlug(slug),
  ["data-public-effect-index-article-by-slug"],
  {
    revalidate: PUBLIC_DATA_CACHE_REVALIDATE_SECONDS,
    tags: [PUBLIC_DATA_CACHE_TAGS.all, PUBLIC_DATA_CACHE_TAGS.articles],
  },),
);
