import { memo } from "react";
import type { SubstanceArticle } from "@/schema";
import { REVIEW_STATUS_BANNER_FALLBACK } from "./articleReviewCopy";
import { ReviewStatusBannerView } from "./ReviewStatusBannerView.client";

export interface ReviewStatusBannerProps {
  article: SubstanceArticle;
  avatarSrc?: string | null;
  profileHref?: string | null;
  copy?: string;
  className?: string;
}

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
