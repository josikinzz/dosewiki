import "server-only";

import { unstable_cache } from "next/cache";
import { cache } from "react";
import { PUBLIC_CONVEX_CACHE_REVALIDATE_SECONDS, PUBLIC_CONVEX_CACHE_TAGS } from "./publicData.cache";
import { getPublicDataReadAdapter, type PublicFullSubstanceDocument } from "./publicData.reads";
import type { PublicSubstanceArticleRecord } from "./publicData.substanceContract";
import type {
  ContributorReviewedArticle,
  ReviewedArticleCredit,
} from "../../src/types/reviewedArticles";
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

/**
 * The complete substance corpus in the committed `SubstanceIndex.json` record
 * shape, for the public open-data download. Request-deduped only: the full
 * corpus is far past `unstable_cache`'s entry size limit, so daily caching
 * lives on the serving route's ISR revalidate instead.
 */
export const getPublicFullSubstanceDocuments = cache(
  async (): Promise<PublicFullSubstanceDocument[]> =>
    getPublicDataReadAdapter().getPublicFullSubstanceDocuments(),
);

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

/**
 * Every substance article one contributor expert-reviewed, alphabetically.
 * Keyed by profile key only: the reviewer-email matching (membershipEmail plus
 * legacy alias handles) happens inside the Convex deployment, so no reviewer
 * email ever reaches this process, let alone the client payload.
 */
export const getReviewedArticlesByContributor = cache(unstable_cache(async (
  profileKey: string,
): Promise<ContributorReviewedArticle[]> => {
  const reviewed = await getPublicDataReadAdapter().getPublicReviewedArticlesByContributor(profileKey);
  return [...reviewed].sort((left, right) => left.title.localeCompare(right.title));
}, ["convex-public-reviewed-articles-by-contributor"], {
  revalidate: PUBLIC_CONVEX_CACHE_REVALIDATE_SECONDS,
  tags: [
    PUBLIC_CONVEX_CACHE_TAGS.all,
    PUBLIC_CONVEX_CACHE_TAGS.substances,
    PUBLIC_CONVEX_CACHE_TAGS.contributors,
  ],
}));

/**
 * Every completed expert review as a public-safe (slug, profileKey) credit,
 * for the About roster's page-reference counts. Like the per-contributor read
 * above, the reviewer-email matching happens inside the Convex deployment; no
 * email reaches this process. Sorted by slug then key so identical corpora
 * produce identical payloads between builds.
 */
export const getReviewedArticleCredits = cache(unstable_cache(async (): Promise<ReviewedArticleCredit[]> => {
  const credits = await getPublicDataReadAdapter().getPublicReviewedArticleCredits();
  return [...credits].sort((left, right) =>
    left.slug === right.slug
      ? left.profileKey.localeCompare(right.profileKey)
      : left.slug.localeCompare(right.slug),
  );
}, ["convex-public-reviewed-article-credits"], {
  revalidate: PUBLIC_CONVEX_CACHE_REVALIDATE_SECONDS,
  tags: [
    PUBLIC_CONVEX_CACHE_TAGS.all,
    PUBLIC_CONVEX_CACHE_TAGS.substances,
    PUBLIC_CONVEX_CACHE_TAGS.contributors,
  ],
}));

export const getPublicSubstanceBySlug = cache(unstable_cache(async (slug: string): Promise<PublicSubstanceRecord | null> => {
  return await getPublicDataReadAdapter().getPublicSubstanceBySlug(slug);
}, ["convex-public-substance-by-slug"], {
  revalidate: PUBLIC_CONVEX_CACHE_REVALIDATE_SECONDS,
  tags: [PUBLIC_CONVEX_CACHE_TAGS.all, PUBLIC_CONVEX_CACHE_TAGS.substances],
}));
