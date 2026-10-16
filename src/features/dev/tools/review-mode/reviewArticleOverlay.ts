import type { SubstanceArticle } from "@/schema";

type ReviewArticleOverlay = {
  editorialReview?: SubstanceArticle["editorial_review"] | null;
};

export function applyReviewArticleOverlay(
  article: SubstanceArticle,
  { editorialReview = null }: ReviewArticleOverlay,
): SubstanceArticle {
  return editorialReview
    ? { ...article, editorial_review: editorialReview }
    : article;
}
