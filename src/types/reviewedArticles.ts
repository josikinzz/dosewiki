export type ContributorReviewedArticle = {
  slug: string;
  title: string;
  reviewed_at: string | null;
};

export type ReviewedArticleCredit = {
  slug: string;
  profileKey: string;
};
