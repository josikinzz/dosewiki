import type { Reference, SubstanceArticle } from "@/schema";
import {
  applyInlineFieldEdits,
  type InlineFieldEdits,
} from "./inlineFieldEdits";

/** Persisted review writes that the editor working set has not reloaded yet. */
type ReviewArticleOverlay = {
  fieldEdits?: InlineFieldEdits;
  savedReferences?: readonly Reference[];
  /** References deleted through the citation panel that the article copy still lists. */
  removedReferenceIds?: readonly string[];
  /**
   * The `editorial_review` record the review tick wrote, when the working set
   * still predates it. Null once the working set has caught up.
   */
  editorialReview?: SubstanceArticle["editorial_review"] | null;
};

/**
 * Rebuild the article Convex now holds without dirtying the editor working set.
 *
 * A reference save and its later marker edit are separate writes, but the
 * review preview and citation diagnostics must see their combined result.
 * References already present in a refreshed article win, so an old overlay
 * cannot replace newer metadata from the working set.
 */
export function applyReviewArticleOverlay(
  article: SubstanceArticle,
  {
    fieldEdits,
    savedReferences = [],
    removedReferenceIds = [],
    editorialReview = null,
  }: ReviewArticleOverlay,
): SubstanceArticle {
  const removedIds = new Set(removedReferenceIds);
  const keptReferences = (article.references ?? []).filter(
    (reference) => !removedIds.has(reference.id),
  );
  const knownIds = new Set(keptReferences.map((reference) => reference.id));
  const missingReferences = savedReferences.filter((reference) => {
    if (removedIds.has(reference.id)) return false;
    if (knownIds.has(reference.id)) return false;
    knownIds.add(reference.id);
    return true;
  });
  const referencesChanged =
    missingReferences.length > 0 ||
    keptReferences.length !== (article.references ?? []).length;
  const articleWithReferences = referencesChanged
    ? {
        ...article,
        references: [...keptReferences, ...missingReferences],
      }
    : article;
  const articleWithReview = editorialReview
    ? { ...articleWithReferences, editorial_review: editorialReview }
    : articleWithReferences;

  return applyInlineFieldEdits(articleWithReview, fieldEdits);
}
