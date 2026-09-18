/**
 * One substance article a contributor expert-reviewed, as listed on their
 * public profile. Deliberately public-safe: the reviewer is identified by the
 * profile page the list renders on, never by the stored reviewer email —
 * `editorial_review` itself (notes, reviewer identity) stays editor-only.
 */
export type ContributorReviewedArticle = {
  slug: string;
  title: string;
  /** ISO timestamp of the completed review, when the stamp recorded one. */
  reviewed_at: string | null;
};

/**
 * One completed expert review as a public-safe credit: which contributor
 * profile reviewed which article. The stored reviewer email is matched inside
 * Postgres and discarded there — only the article slug and the claiming profile
 * key leave the deployment. Feeds the About roster's page-reference counts.
 */
export type ReviewedArticleCredit = {
  slug: string;
  profileKey: string;
};
