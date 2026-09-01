"use client";

import { memo, type ReactNode } from "react";
import { SmartLink } from "@/components/common/SmartLink";

import { Icon, type IconName } from "@/components/common/Icon";
import { ContributorAvatar } from "@/components/layout/PublicPagePrimitives";
import { cn } from "@/lib/utils";
import type { SubstanceArticle } from "@/schema";
import {
  EXPERT_REVIEW_CREDIT_FALLBACK,
  splitReviewerCopy,
} from "./articleReviewCopy";

/**
 * Avatar URLs resolved from contributor profiles (Convex storage), keyed by the
 * two fixed credit roles. Threaded in from the server-rendered article route.
 */
export interface ContributorAvatarMap {
  josie?: string | null;
  lyrea?: string | null;
}

interface ContributorsSectionProps {
  article: SubstanceArticle;
  /**
   * Profile-resolved avatars. When absent (e.g. the dev Generator preview,
   * which has no server-resolved profiles) Josie falls back to her committed
   * asset and Lyrea falls back to an initials chip.
   */
  avatars?: ContributorAvatarMap;
  /**
   * Profile hrefs for the two fixed credits, resolved server-side. Absent when
   * the named contributor has no profile, in which case the credit is text.
   */
  profileHrefs?: { josie?: string | null; lyrea?: string | null };
  /**
   * The `expert-review-credit` copy block, threaded from the route loader.
   * Absent renders the checked-in default sentence. The `{{reviewer}}` token
   * marks where Lyrea's linked name is substituted.
   */
  expertReviewCredit?: string;
}

/** How dose.wiki articles are assembled, for the synthesis credit. */
const DOCS_HOW_HREF = "/docs/how";

/** Committed fallback used only when the profile avatar can't be resolved. */
const JOSIE_FALLBACK_AVATAR_SRC = "/profile-avatars/josie/avatar.webp";

const creditLinkClassName = cn(
  "theme-accent-heading rounded font-semibold",
  "underline decoration-[color-mix(in_srgb,currentColor_35%,transparent)] decoration-1 underline-offset-2",
  "transition-[text-decoration-color,opacity] hover:decoration-current",
  "theme-focus-ring",
);

// An unlinked credit keeps the name emphasized but drops the accent colour,
// underline, and hover response, so it does not invite a click it cannot serve.
const creditTextClassName = "theme-text-secondary font-semibold";

function CreditLink({ href, children }: { href?: string | null; children: ReactNode }) {
  return href ? (
    <SmartLink href={href} className={creditLinkClassName}>
      {children}
    </SmartLink>
  ) : (
    <span className={creditTextClassName}>{children}</span>
  );
}

interface ContributorCreditProps {
  name: string;
  profileHref?: string | null;
  avatarSrc?: string | null;
  roleIcon: IconName;
  roleLabel: string;
  children: ReactNode;
}

function ContributorCredit({
  name,
  profileHref,
  avatarSrc,
  roleIcon,
  roleLabel,
  children,
}: ContributorCreditProps) {
  return (
    <li className="flex items-start gap-3 sm:items-center">
      {profileHref ? (
        <SmartLink
          href={profileHref}
          aria-label={`View ${name}'s contributor profile`}
          className="theme-focus-ring group mt-0.5 shrink-0 rounded-full sm:mt-0"
        >
          <ContributorAvatar imageUrl={avatarSrc} name={name} size="xs" />
        </SmartLink>
      ) : (
        <span className="mt-0.5 shrink-0 sm:mt-0">
          <ContributorAvatar imageUrl={avatarSrc} name={name} size="xs" />
        </span>
      )}
      <div className="min-w-0">
        <span className="theme-text-faint flex items-center gap-1.5 text-[0.66rem] font-semibold uppercase tracking-[0.15em]">
          <Icon icon={roleIcon} size={12} className="shrink-0 opacity-80" />
          {roleLabel}
        </span>
        <p className="theme-text-secondary mt-0.5 text-sm leading-snug [text-wrap:pretty]">
          {children}
        </p>
      </div>
    </li>
  );
}

/**
 * Closing credits for a substance article. The synthesis credit (Josie Kins)
 * always renders; the expert-review credit (Lyrea) appears only once an editor
 * has marked the article's review complete, surfaced publicly as the derived
 * `expert_reviewed` flag (falling back to `editorial_review.status` in the dev
 * Generator preview, where the full editor record is available).
 *
 * Rendered title-less and card-less by request: free-floating credit rows that
 * sit quietly at the foot of the article.
 */
export const ContributorsSection = memo(function ContributorsSection({
  article,
  avatars,
  profileHrefs,
  expertReviewCredit,
}: ContributorsSectionProps) {
  // Same `in` narrowing as ReviewStatusBanner: `expert_reviewed` is stamped on
  // the public projection at runtime and SubstanceArticle doesn't type it.
  const expertReviewed =
    ("expert_reviewed" in article && article.expert_reviewed === true) ||
    article.editorial_review?.status === "completed";

  const reviewSegments = splitReviewerCopy(
    expertReviewCredit ?? EXPERT_REVIEW_CREDIT_FALLBACK,
  );

  return (
    <section id="contributors" aria-label="Contributors" className="scroll-mt-6">
      <ul className="flex flex-col gap-4">
        {expertReviewed ? (
          <ContributorCredit
            name="Lyrea"
            profileHref={profileHrefs?.lyrea}
            avatarSrc={avatars?.lyrea}
            roleIcon="lucide:shield-check"
            roleLabel="Reviewed & approved"
          >
            {reviewSegments.before}
            {reviewSegments.hasReviewer && (
              <CreditLink href={profileHrefs?.lyrea}>Lyrea</CreditLink>
            )}
            {reviewSegments.after}
          </ContributorCredit>
        ) : null}

        <ContributorCredit
          name="Josie Kins"
          profileHref={profileHrefs?.josie}
          avatarSrc={avatars?.josie ?? JOSIE_FALLBACK_AVATAR_SRC}
          roleIcon="lucide:workflow"
          roleLabel="Automated synthesis"
        >
          Information aggregated and synthesized using an{" "}
          <CreditLink href={DOCS_HOW_HREF}>autonomous workflow</CreditLink> built by{" "}
          <CreditLink href={profileHrefs?.josie}>Josie Kins</CreditLink>.
        </ContributorCredit>
      </ul>
    </section>
  );
});
