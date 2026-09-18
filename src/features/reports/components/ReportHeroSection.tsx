"use client";

import { useT } from "@/i18n/client";
import { memo } from "react";
import Link from "next/link";
import { Icon } from "@/components/common/Icon";
import { PublicPill } from "@/components/common/PublicTokens";
import { resolveTripReportLicense } from "@/types/tripReport";
import { publicHref } from "@/utils/publicHref";
import { AuthorAvatar } from "./AuthorAvatar";
import { AuthorLink } from "./AuthorLink";

/**
 * Minimal projection of a `TripReport` containing only the fields the hero
 * renders. The full report carries the entire narrative (introduction,
 * timeline phases, conclusion), so projecting here keeps that bulk out of the
 * `"use client"` RSC/HTML payload for this component.
 */
export interface ReportHeroProps {
  title: string;
  featured?: boolean;
  tags: string[];
  license?: string;
  subject: {
    name: string;
    avatar_url?: string;
    profile_key?: string;
    trip_date?: string;
  };
}

/**
 * Hero for trip reports: title, byline, and tags set directly on the page
 * canvas so the story itself is the most prominent surface on the page.
 */
export const ReportHeroSection = memo(function ReportHeroSection(
  report: ReportHeroProps,
) {
  const hasTags = report.tags.length > 0;
  const hasTripDate = report.subject.trip_date && report.subject.trip_date.trim().length > 0;
  const hasAvatar = !!report.subject.avatar_url;
  const t = useT();
  const profileUrl = report.subject.profile_key ? publicHref.contributor(report.subject.profile_key) : null;
  const license = resolveTripReportLicense(report.license);
  const isPublicDomain = license === "public-domain";
  const licenseLabel = isPublicDomain ? t("Public domain (CC0)") : t("© Author");
  const licenseIcon = isPublicDomain ? "lucide:globe" : "lucide:copyright";
  const licenseTitle = isPublicDomain
    ? t("Dedicated to the public domain (CC0) by its submitter. See the license page for reuse terms.")
    : t("Rights to this report are retained by its author — reuse is up to them. See the license page.");

  return (
    <header className="space-y-4 pt-2">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
        <h1 className="theme-accent-heading text-3xl font-bold tracking-tight md:text-4xl">
          {report.title}
        </h1>
        {report.featured ? (
          <PublicPill
            icon="lucide:star"
            tone="warning"
            size="sm"
            className="theme-report-featured-text"
          >
            {t("Featured")}
          </PublicPill>
        ) : null}
      </div>

      <div className="theme-text-muted flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
        {hasAvatar ? (
          profileUrl ? (
            // The adjacent author name (AuthorLink) is the announced, tabbable
            // link to this same profile; the avatar is a decorative second
            // affordance to it, so keep it out of the tab order and the a11y
            // tree to avoid a duplicate stop announcing one destination.
            <Link
              href={profileUrl}
              aria-hidden="true"
              tabIndex={-1}
              className="inline-flex rounded-full theme-focus-ring"
            >
              <AuthorAvatar
                authorName={report.subject.name}
                avatarUrl={report.subject.avatar_url}
                size={32}
              />
            </Link>
          ) : (
            <AuthorAvatar
              authorName={report.subject.name}
              avatarUrl={report.subject.avatar_url}
              size={32}
            />
          )
        ) : null}
        <span className="flex items-center gap-1.5">
          <Icon icon="lucide:user" size={15} className="theme-icon-muted" />
          {t("by")}{" "}
          <AuthorLink
            authorName={report.subject.name}
            profileKey={report.subject.profile_key}
            className="font-medium"
          />
        </span>
        {hasTripDate ? (
          <span className="flex items-center gap-1.5">
            <Icon icon="lucide:calendar" size={15} className="theme-icon-muted" />
            {report.subject.trip_date}
          </span>
        ) : null}
        <Link
          href="/docs/license"
          scroll={false}
          title={licenseTitle}
          aria-label={licenseTitle}
          className="inline-flex rounded-full theme-focus-ring"
        >
          <PublicPill icon={licenseIcon} tone="neutral" size="sm">
            {licenseLabel}
          </PublicPill>
        </Link>
      </div>

      {hasTags ? (
        <div className="flex flex-wrap gap-1.5">
          {report.tags.map((tag) => (
            <PublicPill key={tag} icon="lucide:tag" tone="neutral" size="sm">
              {tag}
            </PublicPill>
          ))}
        </div>
      ) : null}
    </header>
  );
});
