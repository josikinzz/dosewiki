"use client";

import { memo } from "react";
import { PublicPill } from "@/components/common/PublicTokens";
import { PublicDetailHero } from "@/components/layout/PublicContentPrimitives";
import { Surface } from "@/components/ui/surface";
import type { TripReport } from "@/types/tripReport";
import { publicHref } from "@/utils/publicHref";
import { AuthorAvatar } from "./AuthorAvatar";
import { AuthorLink } from "./AuthorLink";

interface ReportHeroSectionProps {
  report: TripReport;
}

/**
 * Hero section for trip reports, matching the aesthetic of substance article HeroSection.
 * Displays title, author, trip date, and tags.
 */
export const ReportHeroSection = memo(function ReportHeroSection({
  report,
}: ReportHeroSectionProps) {
  const hasTags = report.tags.length > 0;
  const hasTripDate = report.subject.trip_date && report.subject.trip_date.trim().length > 0;
  const profileUrl = report.subject.profile_key ? publicHref.contributor(report.subject.profile_key) : null;

  return (
    <PublicDetailHero
      kind="report"
      title={report.title}
      badges={
        report.featured ? (
          <PublicPill
            icon="lucide:star"
            tone="warning"
            size="sm"
            className="theme-report-featured-text"
          >
            Featured
          </PublicPill>
        ) : null
      }
      metadata={[
        {
          key: "author",
          icon: "lucide:user",
          label: "Author",
          value: (
            <span>
              by{" "}
                <AuthorLink
                  authorName={report.subject.name}
                  profileKey={report.subject.profile_key}
                  className="theme-accent-heading font-medium hover:opacity-90"
                />
            </span>
          ),
        },
        {
          key: "trip-date",
          icon: "lucide:calendar",
          label: "Trip date",
          value: hasTripDate ? report.subject.trip_date : null,
        },
      ]}
      tags={
        hasTags
          ? report.tags.map((tag) => ({
              id: tag,
              icon: "lucide:tag",
              label: tag,
            }))
          : []
      }
      media={
        <Surface variant="moleculePanel" padding="none" radius="xl" className="p-1.5">
          {profileUrl ? (
            <a
              href={profileUrl}
              className="block transition-transform duration-[300ms] ease-[cubic-bezier(0.25,1,0.5,1)] hover:scale-[1.015] motion-reduce:transition-none motion-reduce:hover:scale-100"
              title={`View ${report.subject.name}'s profile`}
            >
              <AuthorAvatar
                authorName={report.subject.name}
                avatarUrl={report.subject.avatar_url}
                size={64}
              />
            </a>
          ) : (
            <AuthorAvatar
              authorName={report.subject.name}
              avatarUrl={report.subject.avatar_url}
              size={64}
            />
          )}
        </Surface>
      }
    />
  );
});
