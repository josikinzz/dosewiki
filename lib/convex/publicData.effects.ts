import "server-only";

import { unstable_cache } from "next/cache";
import { cache } from "react";
import type { GalleryReplication, ReplicationWithUrl } from "../../src/types/replications";
import { PUBLIC_CONVEX_CACHE_REVALIDATE_SECONDS, PUBLIC_CONVEX_CACHE_TAGS } from "./publicData.cache";
import { getPublicDataReadAdapter } from "./publicData.reads";
import {
  type PublicEffectArticle,
  type PublicEffectPreview,
  type SubjectiveEffectDetailRecord,
} from "./publicData.shared";

export const getPublicEffects = cache(unstable_cache(async (): Promise<PublicEffectPreview[]> => {
  return await getPublicDataReadAdapter().getPublicEffects();
}, ["convex-public-effect-previews"], {
  revalidate: PUBLIC_CONVEX_CACHE_REVALIDATE_SECONDS,
  tags: [PUBLIC_CONVEX_CACHE_TAGS.all, PUBLIC_CONVEX_CACHE_TAGS.effects],
}));

export const getFeaturedEffects = cache(async (limit = 8) => {
  return (await getPublicEffects()).slice(0, limit);
});

export const getPublicEffectBySlug = cache(unstable_cache(async (slug: string): Promise<SubjectiveEffectDetailRecord | null> => {
  return await getPublicDataReadAdapter().getPublicEffectBySlug(slug);
}, ["convex-public-effect-by-slug"], {
  revalidate: PUBLIC_CONVEX_CACHE_REVALIDATE_SECONDS,
  tags: [PUBLIC_CONVEX_CACHE_TAGS.all, PUBLIC_CONVEX_CACHE_TAGS.effects],
}));

export const getPublicEffectArticles = cache(unstable_cache(async (): Promise<PublicEffectArticle[]> => {
  return await getPublicDataReadAdapter().getPublicEffectArticles();
}, ["convex-public-effect-articles"], {
  revalidate: PUBLIC_CONVEX_CACHE_REVALIDATE_SECONDS,
  tags: [PUBLIC_CONVEX_CACHE_TAGS.all, PUBLIC_CONVEX_CACHE_TAGS.effects],
}));

export const getEffectsByCategory = cache(unstable_cache(async (category: string): Promise<PublicEffectPreview[]> => {
  return await getPublicDataReadAdapter().getPublicEffectsByCategory(category);
}, ["convex-public-effects-by-category"], {
  revalidate: PUBLIC_CONVEX_CACHE_REVALIDATE_SECONDS,
  tags: [PUBLIC_CONVEX_CACHE_TAGS.all, PUBLIC_CONVEX_CACHE_TAGS.effects],
}));

export const getPublicReplicationsByEffect = cache(unstable_cache(async (effectSlug: string): Promise<ReplicationWithUrl[]> => {
  return await getPublicDataReadAdapter().getPublicReplicationsByEffect(effectSlug);
}, ["convex-public-replications-by-effect"], {
  revalidate: PUBLIC_CONVEX_CACHE_REVALIDATE_SECONDS,
  tags: [PUBLIC_CONVEX_CACHE_TAGS.all, PUBLIC_CONVEX_CACHE_TAGS.replications],
}));

export const getPublicReplications = cache(unstable_cache(async (): Promise<GalleryReplication[]> => {
  return await getPublicDataReadAdapter().getPublicReplications();
}, ["convex-public-replications"], {
  revalidate: PUBLIC_CONVEX_CACHE_REVALIDATE_SECONDS,
  tags: [PUBLIC_CONVEX_CACHE_TAGS.all, PUBLIC_CONVEX_CACHE_TAGS.replications],
}));
