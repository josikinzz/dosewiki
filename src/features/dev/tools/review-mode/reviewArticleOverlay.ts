import type { Reference, SubstanceArticle } from "@/schema";
import {
  applyInlineFieldEdits,
  type InlineFieldEdits,
} from "./inlineFieldEdits";

/** Persisted review writes that the editor working set has not reloaded yet. */
type ReviewArticleOverlay = {
  fieldEdits?: InlineFieldEdits;
  savedReferences?: readonly Reference[];
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
  { fieldEdits, savedReferences = [], editorialReview = null }: ReviewArticleOverlay,
): SubstanceArticle {
  const knownIds = new Set((article.references ?? []).map((reference) => reference.id));
  const missingReferences = savedReferences.filter((reference) => {
    if (knownIds.has(reference.id)) return false;
    knownIds.add(reference.id);
    return true;
  });
  const articleWithReferences = missingReferences.length > 0
    ? {
        ...article,
        references: [...(article.references ?? []), ...missingReferences],
      }
    : article;
  const articleWithReview = editorialReview
    ? { ...articleWithReferences, editorial_review: editorialReview }
    : articleWithReferences;

  return applyInlineFieldEdits(articleWithReview, fieldEdits);
}
