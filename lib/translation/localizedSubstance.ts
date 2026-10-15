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
  const noteSlug = "slug" in substance && typeof substance.slug === "string" ? substance.slug : slug;
  const [localized, notes] = await Promise.all([
    localizeRecord({ ...substance, slug }, locale, "article"),
    readApprovedTranslatorNotes(locale, noteSlug, substance),
  ]);
  return { substance: localized.record, review: localized.review, notes };
});
