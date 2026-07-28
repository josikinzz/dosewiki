"use client";

import { memo, type ReactNode } from "react";
import Link from "next/link";

import { Icon, type IconName } from "@/components/common/Icon";
import { ContributorAvatar } from "@/components/layout/PublicPagePrimitives";
import { cn } from "@/lib/utils";
import type { SubstanceArticle } from "@/schema";

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
}

/** How dose.wiki articles are assembled, for the synthesis credit. */
const DOCS_HOW_HREF = "/docs/how";

/** Committed fallback used only when the profile avatar can't be resolved. */
const JOSIE_FALLBACK_AVATAR_SRC = "/profile-avatars/josie/avatar.webp";

const creditLinkClassName = cn(
  "theme-accent-heading rounded font-semibold",
  "underline decoration-[color-mix(in_srgb,currentColor_35%,transparent)] decoration-1 underline-offset-2",
  "transition-[text-decoration-color,opacity] hover:decoration-current",
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400",
);

// An unlinked credit keeps the name emphasized but drops the accent colour,
// underline, and hover response, so it does not invite a click it cannot serve.
const creditTextClassName = "theme-text-secondary font-semibold";

function CreditLink({ href, children }: { href?: string | null; children: ReactNode }) {
  return href ? (
    <Link href={href} className={creditLinkClassName}>
      {children}
    </Link>
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
        <Link
          href={profileHref}
          aria-label={`View ${name}'s contributor profile`}
          className="group mt-0.5 shrink-0 rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400 sm:mt-0"
        >
          <ContributorAvatar imageUrl={avatarSrc} name={name} size="xs" />
        </Link>
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
}: ContributorsSectionProps) {
  const expertReviewed =
    (article as { expert_reviewed?: boolean }).expert_reviewed === true ||
    article.editorial_review?.status === "completed";

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
            Reviewed, edited, and approved by subject-matter expert{" "}
            <CreditLink href={profileHrefs?.lyrea}>Lyrea</CreditLink>.
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

export default ContributorsSection;
