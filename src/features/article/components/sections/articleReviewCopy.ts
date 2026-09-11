/**
 * The article's two expert-review sentences, editable in the /dev Copy Studio
 * under the `review-status-banner` and `expert-review-credit` blocks.
 *
 * Same shape as `articleDisclaimerCopy.ts`: the substance route loader (a
 * server module) reads these keys and fallbacks to build the article props, so
 * the strings live apart from the client components that render them. Both are
 * pinned to their checked-in copy defaults by `copyBlockMigration.test.tsx`.
 *
 * Each sentence names the reviewer through the `{{reviewer}}` placeholder: the
 * components substitute Lyrea's linked name at that position, so an editor can
 * reword the sentence without being able to break the profile link markup.
 */
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
  /** Text before the reviewer's name; may be empty. */
  before: string;
  /** Text after the reviewer's name; may be empty. */
  after: string;
  /** False when the copy carries no `{{reviewer}}` token: render `before` alone. */
  hasReviewer: boolean;
}

/**
 * Split an editable review sentence around its first `{{reviewer}}` token.
 * Copy without the token renders verbatim with no name: the placeholder is
 * how an editor opts the linked credit in, exactly like the About page's
 * `{{compoundCount}}` tokens.
 */
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
