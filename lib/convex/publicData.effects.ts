import "server-only";

import { cache } from "react";
import type { ReplicationWithUrl } from "../../src/types/replications";
import { queryConvex } from "./serverClient";
import {
  trimExcerpt,
  type PublicEffectArticle,
  type PublicEffectPreview,
  type SubjectiveEffectDetailRecord,
  type SubjectiveEffectRecord,
} from "./publicData.shared";

export const getPublicEffects = cache(async (): Promise<PublicEffectPreview[]> => {
  const effects = await queryConvex<SubjectiveEffectRecord[]>("subjectiveEffects:getAll", {});

  return effects
    .map((effect) => ({
      name: effect.name,
      slug: effect.slug,
      summary: trimExcerpt(effect.summary, 170),
      featured: effect.featured === true,
      tags: effect.tags,
    }))
    .sort((left, right) => {
      if (left.featured !== right.featured) {
        return left.featured ? -1 : 1;
      }

      return left.name.localeCompare(right.name);
    });
});

export const getFeaturedEffects = cache(async (limit = 8) => {
  return (await getPublicEffects()).slice(0, limit);
});

export const getPublicEffectBySlug = cache(async (slug: string): Promise<SubjectiveEffectDetailRecord | null> => {
  return await queryConvex<SubjectiveEffectDetailRecord | null, { slug: string }>("subjectiveEffects:getBySlug", {
    slug,
  });
});

export const getPublicEffectArticles = cache(async (): Promise<PublicEffectArticle[]> => {
  return await queryConvex<PublicEffectArticle[]>("subjectiveEffects:getAll", {});
});

export const getEffectsByCategory = cache(async (category: string): Promise<PublicEffectPreview[]> => {
  const effects = await queryConvex<SubjectiveEffectRecord[], { category: string }>("subjectiveEffects:getByCategory", {
    category,
  });

  return effects.map((effect) => ({
    name: effect.name,
    slug: effect.slug,
    summary: trimExcerpt(effect.summary, 170),
    featured: effect.featured === true,
    tags: effect.tags,
  }));
});

export const getPublicReplicationsByEffect = cache(async (effectSlug: string): Promise<ReplicationWithUrl[]> => {
  return await queryConvex<ReplicationWithUrl[], { effect_slug: string }>("replications:getReplicationsByEffect", {
    effect_slug: effectSlug,
  });
});
