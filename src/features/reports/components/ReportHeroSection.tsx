"use client";

import { memo } from "react";
import { Icon } from "@/components/common/Icon";
import { PublicPill } from "@/components/common/PublicTokens";
import type { TripReport } from "@/types/tripReport";
import { publicHref } from "@/utils/publicHref";
import { AuthorAvatar } from "./AuthorAvatar";
import { AuthorLink } from "./AuthorLink";

interface ReportHeroSectionProps {
  report: TripReport;
}

/**
 * Hero for trip reports: title, byline, and tags set directly on the page
 * canvas so the story itself is the most prominent surface on the page.
 */
export const ReportHeroSection = memo(function ReportHeroSection({
  report,
}: ReportHeroSectionProps) {
  const hasTags = report.tags.length > 0;
  const hasTripDate = report.subject.trip_date && report.subject.trip_date.trim().length > 0;
  const hasAvatar = !!report.subject.avatar_url;
  const profileUrl = report.subject.profile_key ? publicHref.contributor(report.subject.profile_key) : null;

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
            Featured
          </PublicPill>
        ) : null}
      </div>

      <div className="theme-text-muted flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
        {hasAvatar ? (
          profileUrl ? (
            <a href={profileUrl} title={`View ${report.subject.name}'s profile`}>
              <AuthorAvatar
                authorName={report.subject.name}
                avatarUrl={report.subject.avatar_url}
                size={32}
              />
            </a>
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
          by{" "}
          <AuthorLink
            authorName={report.subject.name}
            profileKey={report.subject.profile_key}
            className="theme-accent-heading font-medium hover:opacity-90"
          />
        </span>
        {hasTripDate ? (
          <span className="flex items-center gap-1.5">
            <Icon icon="lucide:calendar" size={15} className="theme-icon-muted" />
            {report.subject.trip_date}
          </span>
        ) : null}
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
