/**
 * The read a locale article route uses in place of `getPublicSubstanceBySlug`:
 * the cached English record composed with every stored translation. The
 * composition itself is request-cached only; the `/zh/[slug]` page is ISR and
 * every article publication revalidates its locale paths alongside `/[slug]`.
 */
import "server-only";

import { cache } from "react";

import type { PublicSubstanceRecord } from "@server/convex/publicData.shared";
import { getPublicSubstanceBySlug } from "@server/convex/publicData.substances";

import { localizeSubstanceRecord } from "./liveTranslation";

export const getLocalizedPublicSubstanceBySlug = cache(async (
  slug: string,
  locale: string,
): Promise<PublicSubstanceRecord | null> => {
  const substance = await getPublicSubstanceBySlug(slug);
  if (!substance) return null;
  const localized = await localizeSubstanceRecord({ ...substance, slug }, locale);
  return localized.record;
});
