import { memo } from "react";
import { Star } from "lucide-react";
import type { TripReport } from "../../types/tripReport";
import { AuthorAvatar } from "./AuthorAvatar";
import { AuthorLink } from "./AuthorLink";

interface ReportCardProps {
  report: TripReport;
  onClick?: () => void;
}

/**
 * Card component for displaying a trip report in a list.
 */
export const ReportCard = memo(function ReportCard({ report, onClick }: ReportCardProps) {
  const { title, subject, substances, featured } = report;

  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative flex w-full flex-col gap-3 rounded-xl border border-white/10 bg-white/5 p-4 text-left transition-all hover:border-fuchsia-400/30 hover:bg-white/[0.08] hover:shadow-[0_10px_30px_-12px_rgba(0,0,0,0.35)] sm:flex-row sm:items-center sm:gap-4"
    >
      {/* Featured star badge */}
      {featured && (
        <div className="absolute right-3 top-3 sm:relative sm:right-auto sm:top-auto sm:order-last">
          <Star className="h-5 w-5 fill-amber-400/80 text-amber-400" />
        </div>
      )}

      {/* Author avatar */}
      <div className="hidden sm:block shrink-0">
        <AuthorAvatar
          authorName={subject.name}
          avatarUrl={subject.avatar_url}
          size={40}
        />
      </div>

      {/* Title and author info */}
      <div className="flex-1 min-w-0">
        <h3 className="text-base font-medium text-fuchsia-200 transition-colors group-hover:text-fuchsia-100 sm:text-lg">
          {title}
        </h3>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-white/50">
          {subject.trip_date && (
            <span>on {subject.trip_date}</span>
          )}
          <span className="italic">
            — <AuthorLink authorName={subject.name} className="text-white/50 hover:text-fuchsia-200" />
          </span>
        </div>
      </div>

      {/* Substances list */}
      <div className="flex flex-col gap-1 border-t border-white/10 pt-3 sm:min-w-[200px] sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0">
        {substances.map((substance, index) => (
          <div key={`${substance.name}-${index}`} className="flex flex-col">
            <span className="text-sm font-medium tracking-wide text-white/70">
              {substance.name}
            </span>
            {(substance.dose || substance.roa) && (
              <span className="text-xs text-white/40">
                {[substance.dose, substance.roa].filter(Boolean).join(" ")}
              </span>
            )}
          </div>
        ))}
      </div>
    </button>
  );
});
