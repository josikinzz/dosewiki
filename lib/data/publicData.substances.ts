import "server-only";

import {
  publicDataCache,
  publicSubstanceTag,
  PUBLIC_SUBSTANCE_CONTENT_TAG,
  PUBLIC_SUBSTANCE_LISTS_TAG,
} from "./publicData.cache";
import { cache } from "react";
import { PUBLIC_DATA_CACHE_REVALIDATE_SECONDS, PUBLIC_DATA_CACHE_TAGS } from "./publicData.cache";
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
import type { CoverageRow } from "../../src/features/coverage/coverageModel";

export const getRawSubstances = cache(async (): Promise<PublicSubstanceLibraryRecord[]> => {
  return await getPublicDataReadAdapter().getRawSubstances();
});

/** Bounded persisted leaf pages; never normalize the full library for effect membership. */
export const getPublicEffectMembershipInput = cache(async () =>
  getPublicDataReadAdapter().getPublicEffectMembershipInput(),
);

export const getPublicMechanismRouteInput = cache(
  async (): Promise<PublicMechanismRouteInput[]> =>
    getPublicDataReadAdapter().getPublicMechanismRouteInput(),
);

export const getPublicAboutPreviewSubstances = cache(
  async (): Promise<PublicSubstanceArticleRecord[]> =>
    getPublicDataReadAdapter().getPublicAboutPreviewSubstances(),
);

/**
 * Compact coverage rows assembled from bounded, persistently cached native
 * pages. The row policy itself runs in the native handler from the shared
 * coverage model; this composition remains request-deduped only.
 */
export const getPublicCoverageSubstances = cache(async (): Promise<CoverageRow[]> => {
  return await getPublicDataReadAdapter().getPublicCoverageSubstances();
});

/**
 * The complete substance corpus in the archival `SubstanceIndex.json` record
 * shape, for the public open-data download. The composition is request-deduped;
 * its bounded adapter pages persist across requests and process restarts.
 */
export const getPublicFullSubstanceDocuments = cache(
  async (): Promise<PublicFullSubstanceDocument[]> =>
    getPublicDataReadAdapter().getPublicFullSubstanceDocuments(),
);

export const getPublicCategoryLayout = cache(publicDataCache(async (): Promise<PublicCategoryLayout | null> => {
  return await getPublicDataReadAdapter().getPublicCategoryLayout();
}, ["data-public-category-layout"], {
  revalidate: PUBLIC_DATA_CACHE_REVALIDATE_SECONDS,
  tags: [PUBLIC_DATA_CACHE_TAGS.all, PUBLIC_DATA_CACHE_TAGS.layouts],
}));

export const getPublicSubstanceLookup = cache(publicDataCache(async (): Promise<PublicSubstanceLookupEntry[]> => {
  return await getPublicDataReadAdapter().getPublicSubstanceLookup();
}, ["data-public-substance-lookup"], {
  revalidate: PUBLIC_DATA_CACHE_REVALIDATE_SECONDS,
  tags: [PUBLIC_DATA_CACHE_TAGS.all, PUBLIC_DATA_CACHE_TAGS.substances, PUBLIC_SUBSTANCE_LISTS_TAG],
}));

export const getPublicSubstanceLookupBySlug = cache(publicDataCache(async (
  slug: string,
): Promise<Pick<PublicSubstanceLookupEntry, "slug" | "name"> | null> => {
  return slug ? getPublicDataReadAdapter().getPublicSubstanceLookupBySlug(slug) : null;
}, ["data-public-substance-lookup-by-slug"], {
  revalidate: PUBLIC_DATA_CACHE_REVALIDATE_SECONDS,
  tags: (slug) => [
    PUBLIC_DATA_CACHE_TAGS.all,
    PUBLIC_DATA_CACHE_TAGS.substances,
    PUBLIC_SUBSTANCE_LISTS_TAG,
    publicSubstanceTag(slug),
  ],
}));

export const getPublicSubstances = cache(publicDataCache(async (): Promise<PublicSubstancePreview[]> => {
  return await getPublicDataReadAdapter().getPublicSubstancePreviews();
}, ["data-public-substance-previews"], {
  revalidate: PUBLIC_DATA_CACHE_REVALIDATE_SECONDS,
  tags: [PUBLIC_DATA_CACHE_TAGS.all, PUBLIC_DATA_CACHE_TAGS.substances, PUBLIC_SUBSTANCE_CONTENT_TAG],
}));

export const getPublicSubstanceSearchSummaries = cache(publicDataCache(async () => {
  return await getPublicDataReadAdapter().getPublicSubstanceSearchSummaries();
}, ["data-public-substance-search-summaries"], {
  revalidate: PUBLIC_DATA_CACHE_REVALIDATE_SECONDS,
  tags: [PUBLIC_DATA_CACHE_TAGS.all, PUBLIC_DATA_CACHE_TAGS.substances, PUBLIC_SUBSTANCE_CONTENT_TAG],
}));

/**
 * Every public substance slug, sorted, for deciding which wiki links resolve.
 * Deliberately separate from `getPublicSubstances`: article routes need only
 * the slug set, and draining the preview pages for it cost 19 sequential
 * Postgres round trips on every cold cache. Wrapped at the top level so
 * `unstable_cache` actually caches it (Next bypasses a nested entry).
 */
export const getPublicSubstanceSlugs = cache(publicDataCache(async (): Promise<string[]> => {
  return await getPublicDataReadAdapter().getPublicSubstanceSlugs();
}, ["data-public-substance-slugs"], {
  revalidate: PUBLIC_DATA_CACHE_REVALIDATE_SECONDS,
  tags: [PUBLIC_DATA_CACHE_TAGS.all, PUBLIC_DATA_CACHE_TAGS.substances, PUBLIC_SUBSTANCE_LISTS_TAG],
}));

export const getPublicSubstanceSlugsByCandidates = cache(publicDataCache(async (
  candidates: string[],
): Promise<string[]> => {
  const normalized = [...new Set(candidates.filter(Boolean))];
  if (normalized.length === 0) return [];
  return getPublicDataReadAdapter().getPublicSubstanceSlugsByCandidates(normalized);
}, ["data-public-substance-slugs-by-candidates"], {
  revalidate: PUBLIC_DATA_CACHE_REVALIDATE_SECONDS,
  tags: [PUBLIC_DATA_CACHE_TAGS.all, PUBLIC_DATA_CACHE_TAGS.substances, PUBLIC_SUBSTANCE_LISTS_TAG],
}));

export const getFeaturedSubstances = cache(async (limit = 8) => {
  return (await getPublicSubstances()).slice(0, limit);
});

/**
 * Every substance article one contributor expert-reviewed, alphabetically.
 * Keyed by profile key only: the reviewer-email matching (membershipEmail plus
 * legacy alias handles) happens inside the Postgres deployment, so no reviewer
 * email ever reaches this process, let alone the client payload.
 */
export const getReviewedArticlesByContributor = cache(publicDataCache(async (
  profileKey: string,
): Promise<ContributorReviewedArticle[]> => {
  const reviewed = await getPublicDataReadAdapter().getPublicReviewedArticlesByContributor(profileKey);
  return [...reviewed].sort((left, right) => left.title.localeCompare(right.title));
}, ["data-public-reviewed-articles-by-contributor"], {
  revalidate: PUBLIC_DATA_CACHE_REVALIDATE_SECONDS,
  tags: [PUBLIC_DATA_CACHE_TAGS.all, PUBLIC_DATA_CACHE_TAGS.substances, PUBLIC_SUBSTANCE_LISTS_TAG, PUBLIC_DATA_CACHE_TAGS.contributors],
}));

/**
 * Every completed expert review as a public-safe (slug, profileKey) credit,
 * for the About roster's page-reference counts. Like the per-contributor read
 * above, the reviewer-email matching happens inside the Postgres deployment; no
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
}, ["data-public-reviewed-article-credits"], {
  revalidate: PUBLIC_DATA_CACHE_REVALIDATE_SECONDS,
  tags: [PUBLIC_DATA_CACHE_TAGS.all, PUBLIC_DATA_CACHE_TAGS.substances, PUBLIC_SUBSTANCE_LISTS_TAG, PUBLIC_DATA_CACHE_TAGS.contributors],
}));

export const getPublicSubstanceBySlug = cache(publicDataCache(async (slug: string): Promise<PublicSubstanceRecord | null> => {
  return await getPublicDataReadAdapter().getPublicSubstanceBySlug(slug);
}, ["data-public-substance-by-slug"], {
  revalidate: PUBLIC_DATA_CACHE_REVALIDATE_SECONDS,
  tags: (slug) => [PUBLIC_DATA_CACHE_TAGS.all, PUBLIC_DATA_CACHE_TAGS.substances, publicSubstanceTag(slug)],
}));
