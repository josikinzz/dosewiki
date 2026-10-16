import { msg } from "@/i18n/messages";

export const REVIEW_STATUS_BANNER_KEY = "review-status-banner";

export const REVIEW_STATUS_BANNER_FALLBACK = msg(
  "Not yet reviewed: this article is pending editorial review by {{reviewer}}.",
);

export const EXPERT_REVIEW_CREDIT_KEY = "expert-review-credit";

export const EXPERT_REVIEW_CREDIT_FALLBACK = msg(
  "Subject-matter expert {{reviewer}} has reviewed this article's essentials: dosage, duration, prose, and copy. This does not guarantee factual accuracy.",
);

const REVIEWER_TOKEN = /\{\{\s*reviewer\s*\}\}/;

export interface ReviewerCopySegments {
  before: string;
  after: string;
  hasReviewer: boolean;
}

export function splitReviewerCopy(copy: string): ReviewerCopySegments {
  const match = REVIEWER_TOKEN.exec(copy);
  if (!match) {
    return { before: copy, after: "", hasReviewer: false };
  }
  return {
    before: copy.slice(0, match.index),
    after: copy.slice(match.index + match[0].length),
    hasReviewer: true,
  };
}
