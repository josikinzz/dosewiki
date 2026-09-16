import { memo } from "react";
import type { SubstanceArticle } from "@/schema";
import { REVIEW_STATUS_BANNER_FALLBACK } from "./articleReviewCopy";
import { ReviewStatusBannerView } from "./ReviewStatusBannerView.client";

export interface ReviewStatusBannerProps {
  article: SubstanceArticle;
  /** Lyrea's profile avatar, resolved server-side; initials fallback when absent. */
  avatarSrc?: string | null;
  /** Lyrea's public profile href, resolved server-side; unlinked text when absent. */
  profileHref?: string | null;
  /** Copy containing the optional `{{reviewer}}` substitution token. */
  copy?: string;
  className?: string;
}

/** Server-compatible projection boundary for the pending editorial-review chip. */
export const ReviewStatusBanner = memo(function ReviewStatusBanner({
  article,
  avatarSrc,
  profileHref,
  copy,
  className,
}: ReviewStatusBannerProps) {
  const expertReviewed =
    ("expert_reviewed" in article && article.expert_reviewed === true) ||
    article.editorial_review?.status === "completed";
  if (expertReviewed) return null;

  return (
    <ReviewStatusBannerView
      avatarSrc={avatarSrc}
      profileHref={profileHref}
      copy={copy ?? REVIEW_STATUS_BANNER_FALLBACK}
      className={className}
    />
  );
});
