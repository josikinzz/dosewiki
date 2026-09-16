"use client";

import { type ReactNode } from "react";
import { ArticleSection } from "@/components/common/ArticleSection";
import { SmartLink } from "@/components/common/SmartLink";
import { Icon, type IconName } from "@/components/common/Icon";
import { ContributorAvatar } from "@/components/layout/PublicPagePrimitives";
import { RecentChangesList } from "@/components/changelog/RecentChangesList";
import type { CitationContext } from "@/components/changelog/ProseDiff";
import type { ArticleRecentChange } from "@/data/changelog/articleRecentChanges";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";
import { splitReviewerCopy } from "./articleReviewCopy";

const creditLinkClassName = cn(
  "theme-accent-heading rounded font-semibold",
  "underline decoration-[color-mix(in_srgb,currentColor_35%,transparent)] decoration-1 underline-offset-2",
  "transition-[text-decoration-color,opacity] hover:decoration-current",
  "theme-focus-ring",
);
const creditTextClassName = "theme-text-secondary font-semibold";

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
      <Icon
        icon={icon}
        size={18}
        className={pending ? undefined : "opacity-80"}
      />
    </span>
  );
}

function CreditLink({
  href,
  children,
}: {
  href?: string | null;
  children: ReactNode;
}) {
  return href ? (
    <SmartLink href={href} className={creditLinkClassName}>
      {children}
    </SmartLink>
  ) : (
    <span className={creditTextClassName}>{children}</span>
  );
}

interface StatusStepProps {
  step: number;
  name?: string;
  profileHref?: string | null;
  avatarSrc?: string | null;
  roleIcon: IconName;
  roleLabel: string;
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
  const t = useT();
  return (
    <li className="flex items-start gap-3 sm:items-center">
      {name ? (
        profileHref ? (
          <SmartLink
            href={profileHref}
            aria-label={t("View {{name}}'s contributor profile", { name })}
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
          <Icon
            icon={
              pending
                ? "material-symbols:gpp-bad-outline-rounded"
                : "bi:check2-square"
            }
            size={14}
            className={
              pending
                ? "theme-status-step-pending-mark shrink-0"
                : "theme-status-step-done-mark shrink-0"
            }
          />
          <span>
            {t("Step {{step}}", { step })} · {roleLabel}
          </span>
          {pending ? (
            <span className="theme-status-step-pending-surface rounded border px-1 py-px text-[0.6rem] leading-none">
              {t("Pending")}
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

export interface RecentChangesProjection {
  changes: ArticleRecentChange[];
  citations: CitationContext;
  latestCreatedAt: string;
  latestDateLabel: string;
  articleChangesHref: string;
  allChangesHref: string;
  hasArticleSlug: boolean;
}

function RecentChangesDisclosure({
  projection,
}: {
  projection: RecentChangesProjection;
}) {
  const t = useT();
  const {
    changes,
    citations,
    latestCreatedAt,
    latestDateLabel,
    articleChangesHref,
    allChangesHref,
    hasArticleSlug,
  } = projection;
  const count = changes.length;
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
            {t("Recent changes")}
          </span>
          <span className="theme-text-secondary mt-0.5 block text-sm leading-snug">
            {count === 1
              ? t("1 human edit")
              : t("{{count}} human edits", { count })}
            <span className="theme-text-faint">
              {" · "}
              {t("latest")}{" "}
              <time dateTime={latestCreatedAt}>{latestDateLabel}</time>
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
        <RecentChangesList changes={changes} article={{ citations }} />
        <p className="mt-3 text-sm">
          <SmartLink
            href={articleChangesHref}
            className="theme-accent-heading theme-focus-ring rounded font-semibold underline decoration-[color-mix(in_srgb,currentColor_35%,transparent)] decoration-1 underline-offset-2 hover:decoration-current"
          >
            {hasArticleSlug
              ? t("All changes to this article")
              : t("All recent changes")}
          </SmartLink>
          <span className="theme-text-faint"> · </span>
          <SmartLink
            href={allChangesHref}
            className="theme-text-secondary theme-focus-ring rounded underline decoration-[color-mix(in_srgb,currentColor_35%,transparent)] decoration-1 underline-offset-2 hover:decoration-current"
          >
            {t("Site-wide recent changes")}
          </SmartLink>
        </p>
      </div>
    </details>
  );
}

export interface ContributorsSectionViewProps {
  expertReviewed: boolean;
  josieAvatarSrc: string;
  lyreaAvatarSrc?: string | null;
  josieProfileHref?: string | null;
  lyreaProfileHref?: string | null;
  expertReviewCredit: string;
  reviewStatusCopy: string;
  docsHowHref: string;
  recentChanges?: RecentChangesProjection;
}

export function ContributorsSectionView({
  expertReviewed,
  josieAvatarSrc,
  lyreaAvatarSrc,
  josieProfileHref,
  lyreaProfileHref,
  expertReviewCredit,
  reviewStatusCopy,
  docsHowHref,
  recentChanges,
}: ContributorsSectionViewProps) {
  const t = useT();
  const reviewSegments = splitReviewerCopy(t(expertReviewCredit));
  const pendingSegments = splitReviewerCopy(t(reviewStatusCopy));
  return (
    <ArticleSection
      id="article-status"
      icon="lucide:shield-check"
      heading={t("Article Status")}
    >
      <ul className="flex flex-col gap-4">
        <StatusStep
          step={1}
          name="Josie Kins"
          profileHref={josieProfileHref}
          avatarSrc={josieAvatarSrc}
          roleIcon="lucide:workflow"
          roleLabel={t("Automated synthesis")}
        >
          {t("An")}{" "}
          <CreditLink href={docsHowHref}>{t("autonomous workflow")}</CreditLink>{" "}
          {t("built by")}{" "}
          <CreditLink href={josieProfileHref}>Josie Kins</CreditLink>{" "}
          {t(
            "compiled this article's foundation from information published across the web.",
          )}
        </StatusStep>
        {expertReviewed ? (
          <StatusStep
            step={2}
            name="Lyrea"
            profileHref={lyreaProfileHref}
            avatarSrc={lyreaAvatarSrc}
            roleIcon="lucide:shield-check"
            roleLabel={t("First-pass review")}
          >
            {reviewSegments.before}
            {reviewSegments.hasReviewer && (
              <CreditLink href={lyreaProfileHref}>Lyrea</CreditLink>
            )}
            {reviewSegments.after}
          </StatusStep>
        ) : (
          <StatusStep
            step={2}
            roleIcon="lucide:shield-check"
            roleLabel={t("First-pass review")}
            pending
          >
            {pendingSegments.before}
            {pendingSegments.hasReviewer && (
              <CreditLink href={lyreaProfileHref}>Lyrea</CreditLink>
            )}
            {pendingSegments.after}
          </StatusStep>
        )}
        <StatusStep
          step={3}
          roleIcon="lucide:quote"
          roleLabel={t("Citation review")}
          pending
        >
          {t(
            "No one has reviewed this article's citations yet. That second pass checks each claim against the source it cites.",
          )}
        </StatusStep>
      </ul>
      {recentChanges ? (
        <RecentChangesDisclosure projection={recentChanges} />
      ) : null}
    </ArticleSection>
  );
}
