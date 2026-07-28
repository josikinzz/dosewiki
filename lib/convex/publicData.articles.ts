import "server-only";

import { unstable_cache } from "next/cache";
import { cache } from "react";
import {
  PUBLIC_CONVEX_CACHE_REVALIDATE_SECONDS,
  PUBLIC_CONVEX_CACHE_TAGS,
} from "./publicData.cache";
import { getPublicDataReadAdapter } from "./publicData.reads";
import type { PublicEffectIndexArticle } from "./publicData.shared";

export const getPublicEffectIndexArticles = cache(
  unstable_cache(
    async (): Promise<PublicEffectIndexArticle[]> =>
      await getPublicDataReadAdapter().getPublicEffectIndexArticles(),
    ["convex-public-effect-index-articles"],
    {
      revalidate: PUBLIC_CONVEX_CACHE_REVALIDATE_SECONDS,
      tags: [PUBLIC_CONVEX_CACHE_TAGS.all, PUBLIC_CONVEX_CACHE_TAGS.articles],
    },
  ),
);

export const getPublishedEffectIndexArticles = cache(
  unstable_cache(
    async (): Promise<PublicEffectIndexArticle[]> =>
      await getPublicDataReadAdapter().getPublishedEffectIndexArticles(),
    ["convex-published-effect-index-articles"],
    {
      revalidate: PUBLIC_CONVEX_CACHE_REVALIDATE_SECONDS,
      tags: [PUBLIC_CONVEX_CACHE_TAGS.all, PUBLIC_CONVEX_CACHE_TAGS.articles],
    },
  ),
);

export const getPublicEffectIndexArticleBySlug = cache(
  unstable_cache(
    async (slug: string): Promise<PublicEffectIndexArticle | null> =>
      await getPublicDataReadAdapter().getPublicEffectIndexArticleBySlug(slug),
    ["convex-public-effect-index-article-by-slug"],
    {
      revalidate: PUBLIC_CONVEX_CACHE_REVALIDATE_SECONDS,
      tags: [PUBLIC_CONVEX_CACHE_TAGS.all, PUBLIC_CONVEX_CACHE_TAGS.articles],
    },
  ),
);
