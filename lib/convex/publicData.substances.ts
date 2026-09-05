import "server-only";

import { publicDataCache, publicSubstanceTag, PUBLIC_SUBSTANCE_LISTS_TAG } from "./publicData.cache";
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

export const getPublicCategoryLayout = cache(publicDataCache(async (): Promise<PublicCategoryLayout | null> => {
  return await getPublicDataReadAdapter().getPublicCategoryLayout();
}, ["convex-public-category-layout"], {
  revalidate: PUBLIC_CONVEX_CACHE_REVALIDATE_SECONDS,
  tags: [PUBLIC_CONVEX_CACHE_TAGS.all, PUBLIC_CONVEX_CACHE_TAGS.layouts],
}));

export const getPublicSubstanceLookup = cache(publicDataCache(async (): Promise<PublicSubstanceLookupEntry[]> => {
  return await getPublicDataReadAdapter().getPublicSubstanceLookup();
}, ["convex-public-substance-lookup"], {
  revalidate: PUBLIC_CONVEX_CACHE_REVALIDATE_SECONDS,
  tags: [PUBLIC_CONVEX_CACHE_TAGS.all, PUBLIC_CONVEX_CACHE_TAGS.substances, PUBLIC_SUBSTANCE_LISTS_TAG],
}));

export const getPublicSubstances = cache(publicDataCache(async (): Promise<PublicSubstancePreview[]> => {
  return await getPublicDataReadAdapter().getPublicSubstancePreviews();
}, ["convex-public-substance-previews"], {
  revalidate: PUBLIC_CONVEX_CACHE_REVALIDATE_SECONDS,
  tags: [PUBLIC_CONVEX_CACHE_TAGS.all, PUBLIC_CONVEX_CACHE_TAGS.substances, PUBLIC_SUBSTANCE_LISTS_TAG],
}));

/**
 * Every public substance slug, sorted, for deciding which wiki links resolve.
 * Deliberately separate from `getPublicSubstances`: article routes need only
 * the slug set, and draining the preview pages for it cost 19 sequential
 * Convex round trips on every cold cache. Wrapped at the top level so
 * `unstable_cache` actually caches it (Next bypasses a nested entry).
 */
export const getPublicSubstanceSlugs = cache(publicDataCache(async (): Promise<string[]> => {
  return await getPublicDataReadAdapter().getPublicSubstanceSlugs();
}, ["convex-public-substance-slugs"], {
  revalidate: PUBLIC_CONVEX_CACHE_REVALIDATE_SECONDS,
  tags: [PUBLIC_CONVEX_CACHE_TAGS.all, PUBLIC_CONVEX_CACHE_TAGS.substances, PUBLIC_SUBSTANCE_LISTS_TAG],
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
export const getReviewedArticlesByContributor = cache(publicDataCache(async (
  profileKey: string,
): Promise<ContributorReviewedArticle[]> => {
  const reviewed = await getPublicDataReadAdapter().getPublicReviewedArticlesByContributor(profileKey);
  return [...reviewed].sort((left, right) => left.title.localeCompare(right.title));
}, ["convex-public-reviewed-articles-by-contributor"], {
  revalidate: PUBLIC_CONVEX_CACHE_REVALIDATE_SECONDS,
  tags: [PUBLIC_CONVEX_CACHE_TAGS.all, PUBLIC_CONVEX_CACHE_TAGS.substances, PUBLIC_SUBSTANCE_LISTS_TAG, PUBLIC_CONVEX_CACHE_TAGS.contributors],
}));

/**
 * Every completed expert review as a public-safe (slug, profileKey) credit,
 * for the About roster's page-reference counts. Like the per-contributor read
 * above, the reviewer-email matching happens inside the Convex deployment; no
 * email reaches this process. Sorted by slug then key so identical corpora
 * produce identical payloads between builds.
 */
export const getReviewedArticleCredits = cache(publicDataCache(async (): Promise<ReviewedArticleCredit[]> => {
  const credits = await getPublicDataReadAdapter().getPublicReviewedArticleCredits();
  return [...credits].sort((left, right) =>
    left.slug === right.slug
      ? left.profileKey.localeCompare(right.profileKey)
      : left.slug.localeCompare(right.slug),
  );
}, ["convex-public-reviewed-article-credits"], {
  revalidate: PUBLIC_CONVEX_CACHE_REVALIDATE_SECONDS,
  tags: [PUBLIC_CONVEX_CACHE_TAGS.all, PUBLIC_CONVEX_CACHE_TAGS.substances, PUBLIC_SUBSTANCE_LISTS_TAG, PUBLIC_CONVEX_CACHE_TAGS.contributors],
}));

export const getPublicSubstanceBySlug = cache(publicDataCache(async (slug: string): Promise<PublicSubstanceRecord | null> => {
  return await getPublicDataReadAdapter().getPublicSubstanceBySlug(slug);
}, ["convex-public-substance-by-slug"], {
  revalidate: PUBLIC_CONVEX_CACHE_REVALIDATE_SECONDS,
  tags: (slug) => [PUBLIC_CONVEX_CACHE_TAGS.all, PUBLIC_CONVEX_CACHE_TAGS.substances, publicSubstanceTag(slug)],
}));
