/**
 * The read a locale article route uses in place of `getPublicSubstanceBySlug`:
 * the cached English record composed with every stored translation. The
 * composition itself is request-cached only; the `/zh/[slug]` page is ISR and
 * every article publication revalidates its locale paths alongside `/[slug]`.
 *
 * The page review state rides along so the article notice is computed with
 * the page and cached with it; an approval's cache receipt refreshes both.
 */
import "server-only";

import { cache } from "react";

import type { PublicSubstanceRecord } from "@server/data/publicData.shared";
import { getPublicSubstanceBySlug } from "@server/data/publicData.substances";

import { localizeRecord } from "./liveTranslation";
import type { PageReviewState } from "./pageReview";

export type LocalizedPublicSubstance = { substance: PublicSubstanceRecord; review: PageReviewState };

export const getLocalizedPublicSubstanceBySlug = cache(async (
  slug: string,
  locale: string,
): Promise<LocalizedPublicSubstance | null> => {
  const substance = await getPublicSubstanceBySlug(slug);
  if (!substance) return null;
  const localized = await localizeRecord({ ...substance, slug }, locale, "article");
  return { substance: localized.record, review: localized.review };
});
