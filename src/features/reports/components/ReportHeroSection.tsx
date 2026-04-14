"use client";

import { memo } from "react";
import { Icon } from "@/components/common/Icon";
import type { TripReport } from "@/types/tripReport";
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
  const profileUrl = report.subject.profile_key ? `/contributors/${report.subject.profile_key.toLowerCase()}` : null;

  return (
    <section className="theme-article-hero relative overflow-hidden rounded-2xl border p-6 shadow-2xl ring-1 ring-white/5">
      {report.featured && (
        <div className="absolute right-4 top-4 flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-300">
          <Icon icon="lucide:star" className="h-3 w-3 fill-amber-400" />
          Featured
        </div>
      )}

      <div className="relative flex flex-col gap-6 pr-0 md:pr-24">
        <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0 flex-1 space-y-4">
            <h1 className="theme-accent-heading font-display pr-16 text-[2rem] font-bold tracking-tight sm:text-[2.5rem] md:pr-0">
              {report.title}
            </h1>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-white/70">
              <span className="inline-flex items-center gap-2">
                <Icon icon="lucide:user" className="h-4 w-4 text-fuchsia-200" />
                <span>
                  by <AuthorLink authorName={report.subject.name} profileKey={report.subject.profile_key} className="font-medium text-white/90 hover:text-fuchsia-200" />
                </span>
              </span>
              {hasTripDate ? (
                <span className="inline-flex items-center gap-2 text-white/55">
                  <Icon icon="lucide:calendar" className="h-4 w-4" />
                  {report.subject.trip_date}
                </span>
              ) : null}
            </div>

            {hasTags ? (
              <div className="flex flex-wrap gap-2">
                {report.tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/65"
                  >
                    <Icon icon="lucide:tag" className="h-3 w-3" />
                    {tag}
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          <div className="absolute right-0 top-0 md:static md:flex-shrink-0">
            <div className="theme-molecule-panel overflow-hidden rounded-2xl border p-1.5 shadow-[0_18px_40px_-24px_var(--theme-shadow-strong)]">
              {profileUrl ? (
                <a
                  href={profileUrl}
                  className="block transition-transform hover:scale-[1.03]"
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
            </div>
          </div>
        </div>
      </div>
    </section>
  );
});
