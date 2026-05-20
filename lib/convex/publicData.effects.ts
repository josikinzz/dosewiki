import "server-only";

import { cache } from "react";
import type { ReplicationWithUrl } from "../../src/types/replications";
import { getPublicDataReadAdapter } from "./publicData.reads";
import {
  type PublicEffectArticle,
  type PublicEffectPreview,
  type SubjectiveEffectDetailRecord,
} from "./publicData.shared";

export const getPublicEffects = cache(async (): Promise<PublicEffectPreview[]> => {
  return await getPublicDataReadAdapter().getPublicEffects();
});

export const getFeaturedEffects = cache(async (limit = 8) => {
  return (await getPublicEffects()).slice(0, limit);
});

export const getPublicEffectBySlug = cache(async (slug: string): Promise<SubjectiveEffectDetailRecord | null> => {
  return await getPublicDataReadAdapter().getPublicEffectBySlug(slug);
});

export const getPublicEffectArticles = cache(async (): Promise<PublicEffectArticle[]> => {
  return await getPublicDataReadAdapter().getPublicEffectArticles();
});

export const getEffectsByCategory = cache(async (category: string): Promise<PublicEffectPreview[]> => {
  return await getPublicDataReadAdapter().getPublicEffectsByCategory(category);
});

export const getPublicReplicationsByEffect = cache(async (effectSlug: string): Promise<ReplicationWithUrl[]> => {
  return await getPublicDataReadAdapter().getPublicReplicationsByEffect(effectSlug);
});
