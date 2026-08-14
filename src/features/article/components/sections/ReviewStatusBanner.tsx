"use client";

import { memo } from "react";
import Link from "next/link";

import { Icon } from "@/components/common/Icon";
import { ContributorAvatar } from "@/components/layout/PublicPagePrimitives";
import { cn } from "@/lib/utils";
import type { SubstanceArticle } from "@/schema";

/** Lyrea's review icon, matching the expert-review credit in ContributorsSection. */
const REVIEW_ICON = "lucide:shield-check";

// Same link idiom as the contributor credits at the foot of the article.
const reviewerLinkClassName = cn(
  "theme-accent-heading rounded font-semibold",
  "underline decoration-[color-mix(in_srgb,currentColor_35%,transparent)] decoration-1 underline-offset-2",
  "transition-[text-decoration-color,opacity] hover:decoration-current",
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400",
);

export interface ReviewStatusBannerProps {
  article: SubstanceArticle;
  /** Lyrea's profile avatar, resolved server-side; initials fallback when absent. */
  avatarSrc?: string | null;
  /** Lyrea's public profile href, resolved server-side; unlinked text when absent. */
  profileHref?: string | null;
  className?: string;
}

/**
 * Compact status chip above the hero on articles that have not yet cleared
 * editorial review. Deliberately a status/credit line, not a quality warning —
 * it names the pending reviewer the same way the contributors footer credits a
 * completed review. Reviewed articles render nothing; the review tick
 * revalidates the article path, so the banner disappears without a redeploy.
 *
 * Mirrors the `expert_reviewed` detection in ContributorsSection: the derived
 * public flag, falling back to `editorial_review.status` so Review Portal and
 * Generator previews (which see the full editor record) stay accurate.
 */
export const ReviewStatusBanner = memo(function ReviewStatusBanner({
  article,
  avatarSrc,
  profileHref,
  className,
}: ReviewStatusBannerProps) {
  // `expert_reviewed` is stamped onto the public projection at runtime
  // (editorialReviewVisibilityPolicy); SubstanceArticle doesn't type it, so
  // narrow with `in` rather than asserting a shape.
  const expertReviewed =
    ("expert_reviewed" in article && article.expert_reviewed === true) ||
    article.editorial_review?.status === "completed";
  if (expertReviewed) return null;

  return (
    <div
      role="status"
      className={cn(
        "theme-article-stub-banner flex flex-wrap items-center gap-x-2 gap-y-1.5 self-start rounded-full border px-4 py-2",
        className,
      )}
    >
      <Icon icon={REVIEW_ICON} size={16} aria-hidden className="theme-icon-muted shrink-0" />
      <span className="theme-text-secondary text-sm">
        Not yet reviewed — this article is pending editorial review by
      </span>
      <span className="inline-flex items-center gap-1.5">
        <ContributorAvatar imageUrl={avatarSrc} name="Lyrea" size="xs" />
        <span className="theme-text-secondary text-sm">
          {profileHref ? (
            <Link href={profileHref} className={reviewerLinkClassName}>
              Lyrea
            </Link>
          ) : (
            <span className="theme-text-secondary font-semibold">Lyrea</span>
          )}
          .
        </span>
      </span>
    </div>
  );
});

export default ReviewStatusBanner;
