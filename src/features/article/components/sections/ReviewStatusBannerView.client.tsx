"use client";

import { SmartLink } from "@/components/common/SmartLink";
import { Icon } from "@/components/common/Icon";
import { ContributorAvatar } from "@/components/layout/PublicPagePrimitives";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";
import { splitReviewerCopy } from "./articleReviewCopy";

const REVIEW_ICON = "lucide:shield-check";
const reviewerLinkClassName = cn(
  "theme-accent-heading rounded font-semibold",
  "underline decoration-[color-mix(in_srgb,currentColor_35%,transparent)] decoration-1 underline-offset-2",
  "transition-[text-decoration-color,opacity] hover:decoration-current",
  "theme-focus-ring",
);

interface ReviewStatusBannerViewProps {
  avatarSrc?: string | null;
  profileHref?: string | null;
  copy: string;
  className?: string;
}

export function ReviewStatusBannerView({
  avatarSrc,
  profileHref,
  copy,
  className,
}: ReviewStatusBannerViewProps) {
  const t = useT();
  const segments = splitReviewerCopy(t(copy));
  return (
    <div
      role="status"
      className={cn(
        "theme-article-stub-banner flex items-center gap-3 self-start rounded-xl border py-2 pl-2.5 pr-4",
        className,
      )}
    >
      <ContributorAvatar
        imageUrl={avatarSrc}
        name="Lyrea"
        size="xs"
        className="shrink-0"
      />
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
            <SmartLink href={profileHref} className={reviewerLinkClassName}>
              Lyrea
            </SmartLink>
          ) : (
            <span className="font-semibold">Lyrea</span>
          ))}
        {segments.after}
      </p>
    </div>
  );
}
