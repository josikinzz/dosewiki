import "server-only";

import { cache } from "react";
import { queryConvex } from "./serverClient";
import {
  priorityScore,
  trimExcerpt,
  type PublicCategoryLayout,
  type PublicSubstanceLookupEntry,
  type PublicSubstancePreview,
  type SubstanceRecord,
} from "./publicData.shared";

export const getRawSubstances = cache(async (): Promise<SubstanceRecord[]> => {
  return await queryConvex<SubstanceRecord[]>("substanceIndex:getAll", {});
});

export const getPublicCategoryLayout = cache(async (): Promise<PublicCategoryLayout | null> => {
  return await queryConvex<PublicCategoryLayout | null>("categoryLayout:get", {});
});

export const getPublicSubstanceLookup = cache(async (): Promise<PublicSubstanceLookupEntry[]> => {
  return await queryConvex<PublicSubstanceLookupEntry[]>("substanceIndex:getSlugNameMap", {});
});

export const getPublicSubstances = cache(async (): Promise<PublicSubstancePreview[]> => {
  const substances = await queryConvex<SubstanceRecord[]>("substanceIndex:getAll", {});

  return substances
    .map((substance) => ({
      title: substance.title,
      slug:
        substance.slug ??
        substance.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""),
      summary: trimExcerpt(substance.summary, 200),
      priority: substance.priority ?? "normal",
      indexCategories: substance.index_categories,
    }))
    .sort((left, right) => {
      const priorityDelta = priorityScore[left.priority] - priorityScore[right.priority];
      if (priorityDelta !== 0) {
        return priorityDelta;
      }

      return left.title.localeCompare(right.title);
    });
});

export const getFeaturedSubstances = cache(async (limit = 8) => {
  return (await getPublicSubstances()).slice(0, limit);
});

export const getPublicSubstanceBySlug = cache(async (slug: string): Promise<SubstanceRecord | null> => {
  return await queryConvex<SubstanceRecord | null, { slug: string }>("substanceIndex:getBySlug", { slug });
});
