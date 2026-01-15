import { memo } from "react";
import { Star, Tag, User, Calendar } from "lucide-react";
import type { TripReport } from "../../types/tripReport";
import { AuthorAvatar } from "./AuthorAvatar";
import { AuthorLink } from "./AuthorLink";
import { findProfileByAuthorName } from "../../data/userProfiles";

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

  // Check if author has a profile page
  const authorProfile = findProfileByAuthorName(report.subject.name);
  const profileUrl = authorProfile ? `/contributors/${authorProfile.key.toLowerCase()}` : null;

  return (
    <div className="relative rounded-2xl border border-white/10 bg-gradient-to-br from-fuchsia-950/40 via-purple-950/30 to-slate-950/50 p-6 shadow-lg">
      {/* Featured badge */}
      {report.featured && (
        <div className="absolute right-4 top-4 flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-300">
          <Star className="h-3 w-3 fill-amber-400" />
          Featured
        </div>
      )}

      {/* Author avatar - positioned right side */}
      <div className={`absolute right-4 ${report.featured ? "top-14" : "top-4"}`}>
        {profileUrl ? (
          <a
            href={profileUrl}
            className="block transition-transform hover:scale-105"
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

      {/* Title */}
      <h1 className="font-display text-[2rem] font-bold tracking-tight text-fuchsia-300 sm:text-[2.5rem] pr-24">
        {report.title}
      </h1>

      {/* Author byline with icon */}
      <div className="mt-3 flex items-center gap-3 text-base text-white/70">
        <User className="h-5 w-5 text-fuchsia-200" />
        <span>
          by <AuthorLink authorName={report.subject.name} className="font-medium text-white/90 hover:text-fuchsia-200" />
        </span>
      </div>

      {/* Trip date */}
      {hasTripDate && (
        <div className="mt-2 flex items-center gap-2 text-sm text-white/50">
          <Calendar className="h-4 w-4" />
          <span>{report.subject.trip_date}</span>
        </div>
      )}

      {/* Tags (matching index_categories styling) */}
      {hasTags && (
        <div className="mt-5 flex flex-wrap gap-2">
          {report.tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-1 text-xs text-white/50"
            >
              <Tag className="h-3 w-3" />
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
});
