// Not a client component on purpose: the chip is static markup, so on the
// public route it renders on the server and ships no JavaScript of its own.
import { memo } from "react";
import Link from "next/link";

import { Icon } from "@/components/common/Icon";
import { ContributorAvatar } from "@/components/layout/PublicPagePrimitives";
import { cn } from "@/lib/utils";
import type { SubstanceArticle } from "@/schema";
import {
  REVIEW_STATUS_BANNER_FALLBACK,
  splitReviewerCopy,
} from "./articleReviewCopy";

/** Lyrea's review icon, matching the expert-review credit in ContributorsSection. */
const REVIEW_ICON = "lucide:shield-check";

// Same link idiom as the contributor credits at the foot of the article.
const reviewerLinkClassName = cn(
  "theme-accent-heading rounded font-semibold",
  "underline decoration-[color-mix(in_srgb,currentColor_35%,transparent)] decoration-1 underline-offset-2",
  "transition-[text-decoration-color,opacity] hover:decoration-current",
  "theme-focus-ring",
);

export interface ReviewStatusBannerProps {
  article: SubstanceArticle;
  /** Lyrea's profile avatar, resolved server-side; initials fallback when absent. */
  avatarSrc?: string | null;
  /** Lyrea's public profile href, resolved server-side; unlinked text when absent. */
  profileHref?: string | null;
  /**
   * The `review-status-banner` copy block, threaded from the route loader.
   * Absent renders the checked-in default sentence. The `{{reviewer}}` token
   * marks where Lyrea's linked name is substituted.
   */
  copy?: string;
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
  copy,
  className,
}: ReviewStatusBannerProps) {
  // `expert_reviewed` is stamped onto the public projection at runtime
  // (editorialReviewVisibilityPolicy); SubstanceArticle doesn't type it, so
  // narrow with `in` rather than asserting a shape.
  const expertReviewed =
    ("expert_reviewed" in article && article.expert_reviewed === true) ||
    article.editorial_review?.status === "completed";
  if (expertReviewed) return null;

  const segments = splitReviewerCopy(copy ?? REVIEW_STATUS_BANNER_FALLBACK);

  return (
    <div
      role="status"
      className={cn(
        "theme-article-stub-banner flex items-center gap-3 self-start rounded-xl border py-2 pl-2.5 pr-4",
        className,
      )}
    >
      <ContributorAvatar imageUrl={avatarSrc} name="Lyrea" size="xs" className="shrink-0" />
      <p className="theme-text-secondary text-sm leading-snug">
        <Icon
          icon={REVIEW_ICON}
          size={16}
          aria-hidden
          className="theme-icon-muted mr-1.5 inline-block align-[-0.1875em]"
        />
        {segments.before}
        {segments.hasReviewer &&
          (profileHref ? (
            <Link href={profileHref} className={reviewerLinkClassName}>
              Lyrea
            </Link>
          ) : (
            <span className="font-semibold">Lyrea</span>
          ))}
        {segments.after}
      </p>
    </div>
  );
});
