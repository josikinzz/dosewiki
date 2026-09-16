import type { SubstanceArticle } from "@/schema";

/** Persisted review writes that the editor working set has not reloaded yet. */
type ReviewArticleOverlay = {
  /**
   * The `editorial_review` record the review tick wrote, when the working set
   * still predates it. Null once the working set has caught up.
   */
  editorialReview?: SubstanceArticle["editorial_review"] | null;
};

/** Rebuild the article Postgres now holds without dirtying the editor working set. */
export function applyReviewArticleOverlay(
  article: SubstanceArticle,
  { editorialReview = null }: ReviewArticleOverlay,
): SubstanceArticle {
  return editorialReview
    ? { ...article, editorial_review: editorialReview }
    : article;
}
