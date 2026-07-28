import "server-only";

import { unstable_cache } from "next/cache";
import { cache } from "react";
import { PUBLIC_CONVEX_CACHE_REVALIDATE_SECONDS, PUBLIC_CONVEX_CACHE_TAGS } from "./publicData.cache";
import { getPublicDataReadAdapter } from "./publicData.reads";
import type { PublicSubstanceArticleRecord } from "./publicData.substanceContract";
import {
  type PublicCategoryLayout,
  type PublicMechanismRouteInput,
  type PublicSubstanceLibraryRecord,
  type PublicSubstanceLookupEntry,
  type PublicSubstancePreview,
  type PublicSubstanceRecord,
} from "./publicData.shared";

export const getRawSubstances = cache(async (): Promise<PublicSubstanceLibraryRecord[]> => {
  return await getPublicDataReadAdapter().getRawSubstances();
});

export const getPublicMechanismRouteInput = cache(
  async (): Promise<PublicMechanismRouteInput[]> =>
    getPublicDataReadAdapter().getPublicMechanismRouteInput(),
);

export const getPublicAboutPreviewSubstances = cache(
  async (): Promise<PublicSubstanceArticleRecord[]> =>
    getPublicDataReadAdapter().getPublicAboutPreviewSubstances(),
);

/**
 * Intentionally uncached full-corpus read for the noIndex internal coverage
 * surface, whose analysis must share the article renderer's complete rules.
 */
export async function getUncachedCoverageSubstances(): Promise<
  PublicSubstanceArticleRecord[]
> {
  return getPublicDataReadAdapter().getPublicCoverageSubstances();
}

export const getPublicCategoryLayout = cache(unstable_cache(async (): Promise<PublicCategoryLayout | null> => {
  return await getPublicDataReadAdapter().getPublicCategoryLayout();
}, ["convex-public-category-layout"], {
  revalidate: PUBLIC_CONVEX_CACHE_REVALIDATE_SECONDS,
  tags: [PUBLIC_CONVEX_CACHE_TAGS.all, PUBLIC_CONVEX_CACHE_TAGS.layouts],
}));

export const getPublicSubstanceLookup = cache(unstable_cache(async (): Promise<PublicSubstanceLookupEntry[]> => {
  return await getPublicDataReadAdapter().getPublicSubstanceLookup();
}, ["convex-public-substance-lookup"], {
  revalidate: PUBLIC_CONVEX_CACHE_REVALIDATE_SECONDS,
  tags: [PUBLIC_CONVEX_CACHE_TAGS.all, PUBLIC_CONVEX_CACHE_TAGS.substances],
}));

export const getPublicSubstances = cache(unstable_cache(async (): Promise<PublicSubstancePreview[]> => {
  return await getPublicDataReadAdapter().getPublicSubstancePreviews();
}, ["convex-public-substance-previews"], {
  revalidate: PUBLIC_CONVEX_CACHE_REVALIDATE_SECONDS,
  tags: [PUBLIC_CONVEX_CACHE_TAGS.all, PUBLIC_CONVEX_CACHE_TAGS.substances],
}));

export const getFeaturedSubstances = cache(async (limit = 8) => {
  return (await getPublicSubstances()).slice(0, limit);
});

export const getPublicSubstanceBySlug = cache(unstable_cache(async (slug: string): Promise<PublicSubstanceRecord | null> => {
  return await getPublicDataReadAdapter().getPublicSubstanceBySlug(slug);
}, ["convex-public-substance-by-slug"], {
  revalidate: PUBLIC_CONVEX_CACHE_REVALIDATE_SECONDS,
  tags: [PUBLIC_CONVEX_CACHE_TAGS.all, PUBLIC_CONVEX_CACHE_TAGS.substances],
}));
