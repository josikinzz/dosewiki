/**
 * The read a locale article route uses in place of `getPublicSubstanceBySlug`:
 * the cached English record composed with every stored translation. The
 * composition itself is request-cached only; the `/zh/[slug]` page is ISR and
 * every article publication revalidates its locale paths alongside `/[slug]`.
 *
 * The page review state rides along so the article notice is computed with
 * the page and cached with it; an approval's cache receipt refreshes both.
 * Approved translator's notes ride along the same way, read against the
 * English record so a note whose section left the English stays hidden.
 */
import "server-only";

import { cache } from "react";

import type { PublicSubstanceRecord } from "@server/data/publicData.shared";
import { getPublicSubstanceBySlug } from "@server/data/publicData.substances";

import { localizeRecord } from "./liveTranslation";
import type { PageReviewState } from "./pageReview";
import { readApprovedTranslatorNotes } from "./translatorNotes";
import type { ApprovedTranslatorNotes } from "./translatorNoteTypes";

export type LocalizedPublicSubstance = { substance: PublicSubstanceRecord; review: PageReviewState; notes: ApprovedTranslatorNotes };

export const getLocalizedPublicSubstanceBySlug = cache(async (
  slug: string,
  locale: string,
): Promise<LocalizedPublicSubstance | null> => {
  const substance = await getPublicSubstanceBySlug(slug);
  if (!substance) return null;
  // Notes are keyed by the slug the article reader writes: the record's own, else the requested one.
  const noteSlug = "slug" in substance && typeof substance.slug === "string" ? substance.slug : slug;
  const [localized, notes] = await Promise.all([
    localizeRecord({ ...substance, slug }, locale, "article"),
    readApprovedTranslatorNotes(locale, noteSlug, substance),
  ]);
  return { substance: localized.record, review: localized.review, notes };
});
