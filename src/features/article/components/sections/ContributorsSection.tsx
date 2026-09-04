// Not a client component on purpose: closing credits have no state or
// handlers, so on the public route they render on the server only. The links
// and avatars they compose are client leaves that hydrate on their own.
import { memo, type ReactNode } from "react";
import { ArticleSection } from "@/components/common/ArticleSection";
import { SmartLink } from "@/components/common/SmartLink";

import { Icon, type IconName } from "@/components/common/Icon";
import { ContributorAvatar } from "@/components/layout/PublicPagePrimitives";
import { cn } from "@/lib/utils";
import type { SubstanceArticle } from "@/schema";
import type { ArticleRecentChange } from "@/data/changelog/articleRecentChanges";
import { buildCitationNumbering } from "@/lib/citations/referenceModel";
import { RecentChangesList } from "./RecentChangesList";
import {
  EXPERT_REVIEW_CREDIT_FALLBACK,
  REVIEW_STATUS_BANNER_FALLBACK,
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
  /**
   * The `review-status-banner` copy block, threaded from the route loader.
   * The pending first-pass step renders this same sentence so the top banner
   * and the status ladder never disagree.
   */
  reviewStatusCopy?: string;
  /**
   * Human edits recorded against this article, newest first, resolved by the
   * route loader. Empty or absent renders no Recent changes disclosure: an
   * article nobody has touched has nothing to disclose.
   */
  recentChanges?: ArticleRecentChange[];
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

/**
 * Personless step marker (the citation-review step has no credited human yet):
 * same 40px circular footprint as the xs ContributorAvatar so the three step
 * rows align into one ladder. A pending step wears the danger surface so the
 * empty seat reads as unfinished, not merely unattributed.
 */
function StepBadge({ icon, pending }: { icon: IconName; pending?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border",
        pending
          ? "theme-status-step-pending-surface"
          : "theme-public-card-subtle theme-text-muted",
      )}
    >
      <Icon icon={icon} size={18} className={pending ? undefined : "opacity-80"} />
    </span>
  );
}

function CreditLink({ href, children }: { href?: string | null; children: ReactNode }) {
  return href ? (
    <SmartLink href={href} className={creditLinkClassName}>
      {children}
    </SmartLink>
  ) : (
    <span className={creditTextClassName}>{children}</span>
  );
}

interface StatusStepProps {
  /** 1-based position in the article's production process. */
  step: number;
  /** Credited human; absent renders the personless StepBadge instead. */
  name?: string;
  profileHref?: string | null;
  avatarSrc?: string | null;
  roleIcon: IconName;
  roleLabel: string;
  /**
   * Step not yet performed: danger-red shield-off marker, "Pending" chip, and
   * badge, the counterpart of the green check on done steps. Red sits only on
   * the status cluster; the label and description keep their neutral ink.
   */
  pending?: boolean;
  children: ReactNode;
}

function StatusStep({
  step,
  name,
  profileHref,
  avatarSrc,
  roleIcon,
  roleLabel,
  pending,
  children,
}: StatusStepProps) {
  return (
    <li className="flex items-start gap-3 sm:items-center">
      {name ? (
        profileHref ? (
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
        )
      ) : (
        <span className="mt-0.5 shrink-0 sm:mt-0">
          <StepBadge icon={roleIcon} pending={pending} />
        </span>
      )}
      <div className="min-w-0">
        <span className="theme-text-faint flex items-center gap-1.5 text-[0.66rem] font-semibold uppercase tracking-[0.15em]">
          {pending ? (
            <Icon
              icon="material-symbols:gpp-bad-outline-rounded"
              size={14}
              className="theme-status-step-pending-mark shrink-0"
            />
          ) : (
            <Icon
              icon="bi:check2-square"
              size={14}
              className="theme-status-step-done-mark shrink-0"
            />
          )}
          <span>
            Step {step} · {roleLabel}
          </span>
          {pending ? (
            <span className="theme-status-step-pending-surface rounded border px-1 py-px text-[0.6rem] leading-none">
              Pending
            </span>
          ) : null}
        </span>
        <p className="theme-text-secondary mt-0.5 text-sm leading-snug [text-wrap:pretty]">
          {children}
        </p>
      </div>
    </li>
  );
}

// Same fixed zone as the rows inside, so the summary and the list never
// disagree about a date across the server/client boundary. The year appears
// only once the latest edit is no longer this year's.
const summaryDayFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const summaryDateWithYearFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/**
 * Collapsed-by-default ledger of the article's human edits, sitting under the
 * process ladder. Native <details>, so the section stays server-rendered; the
 * one-line summary carries the count and the latest date, and nothing about
 * any specific change is visible until the reader opens it. The rows inside
 * are the client leaf.
 */
function RecentChangesDisclosure({
  changes,
  article,
}: {
  changes: ArticleRecentChange[];
  article: SubstanceArticle;
}) {
  const latest = changes[0];
  const count = changes.length;
  const latestDate = new Date(latest.createdAt);
  const summaryDateFormat =
    latestDate.getUTCFullYear() === new Date().getUTCFullYear() ? summaryDayFormat : summaryDateWithYearFormat;
  // Diffs render `[cite:id]` tokens as the article's citation numbers, so a
  // reader can follow one to the reference it points at today.
  const citationNumbers = Object.fromEntries(
    buildCitationNumbering(article.references ?? [], article).numbersById,
  );
  return (
    <details className="group/changes mt-6 border-t border-dose-border pt-3">
      <summary
        className={cn(
          "theme-focus-ring flex cursor-pointer list-none items-center gap-3 rounded-md py-1.5",
          "[&::marker]:content-[''] [&::-webkit-details-marker]:hidden",
        )}
      >
        <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center sm:mt-0">
          <Icon
            icon="lucide:git-commit-horizontal"
            size={18}
            className="theme-icon-muted transition-colors group-open/changes:text-dose-accent-strong"
          />
        </span>
        <span className="min-w-0 flex-1">
          <span className="theme-text-faint flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.15em]">
            Recent changes
          </span>
          <span className="theme-text-secondary mt-0.5 block text-sm leading-snug">
            {count === 1 ? "1 human edit" : `${count} human edits`}
            <span className="theme-text-faint">
              {" · latest "}
              <time dateTime={latest.createdAt}>{summaryDateFormat.format(latestDate)}</time>
            </span>
          </span>
        </span>
        <Icon
          icon="lucide:chevron-down"
          size={16}
          className="theme-icon-muted shrink-0 transition-transform duration-200 motion-reduce:transition-none group-open/changes:rotate-180"
        />
      </summary>
      <div className="sm:pl-[3.25rem]">
        <RecentChangesList changes={changes} citationNumbers={citationNumbers} />
      </div>
    </details>
  );
}

/**
 * Public article status: the article's three-step production process, in
 * order. Step 1 (automated synthesis) is always complete; step 2 (first-pass
 * review) flips from pending to Lyrea's credit via the derived
 * `expert_reviewed` flag (falling back to `editorial_review.status` in the dev
 * Generator preview); step 3 (citation review) is pending on every article
 * until the human citation-review track runs.
 */
export const ContributorsSection = memo(function ContributorsSection({
  article,
  avatars,
  profileHrefs,
  expertReviewCredit,
  reviewStatusCopy,
  recentChanges = [],
}: ContributorsSectionProps) {
  // Same `in` narrowing as ReviewStatusBanner: `expert_reviewed` is stamped on
  // the public projection at runtime and SubstanceArticle doesn't type it.
  const expertReviewed =
    ("expert_reviewed" in article && article.expert_reviewed === true) ||
    article.editorial_review?.status === "completed";

  const reviewSegments = splitReviewerCopy(
    expertReviewCredit ?? EXPERT_REVIEW_CREDIT_FALLBACK,
  );
  // The pending step reuses the top-of-page banner sentence, so both surfaces
  // stay in lockstep when the copy block is edited.
  const pendingSegments = splitReviewerCopy(
    reviewStatusCopy ?? REVIEW_STATUS_BANNER_FALLBACK,
  );

  return (
    <ArticleSection
      id="article-status"
      icon="lucide:shield-check"
      heading="Article Status"
    >
      <ul className="flex flex-col gap-4">
        <StatusStep
          step={1}
          name="Josie Kins"
          profileHref={profileHrefs?.josie}
          avatarSrc={avatars?.josie ?? JOSIE_FALLBACK_AVATAR_SRC}
          roleIcon="lucide:workflow"
          roleLabel="Automated synthesis"
        >
          An <CreditLink href={DOCS_HOW_HREF}>autonomous workflow</CreditLink> built
          by <CreditLink href={profileHrefs?.josie}>Josie Kins</CreditLink>{" "}
          compiled
          this article&apos;s foundation from information published across the web.
        </StatusStep>

        {expertReviewed ? (
          <StatusStep
            step={2}
            name="Lyrea"
            profileHref={profileHrefs?.lyrea}
            avatarSrc={avatars?.lyrea}
            roleIcon="lucide:shield-check"
            roleLabel="First-pass review"
          >
            {reviewSegments.before}
            {reviewSegments.hasReviewer && (
              <CreditLink href={profileHrefs?.lyrea}>Lyrea</CreditLink>
            )}
            {reviewSegments.after}
          </StatusStep>
        ) : (
          <StatusStep
            step={2}
            roleIcon="lucide:shield-check"
            roleLabel="First-pass review"
            pending
          >
            {pendingSegments.before}
            {pendingSegments.hasReviewer && (
              <CreditLink href={profileHrefs?.lyrea}>Lyrea</CreditLink>
            )}
            {pendingSegments.after}
          </StatusStep>
        )}

        <StatusStep
          step={3}
          roleIcon="lucide:quote"
          roleLabel="Citation review"
          pending
        >
          No one has reviewed this article&apos;s citations yet. That second pass
          checks each claim against the source it cites.
        </StatusStep>
      </ul>

      {recentChanges.length > 0 ? (
        <RecentChangesDisclosure changes={recentChanges} article={article} />
      ) : null}
    </ArticleSection>
  );
});
