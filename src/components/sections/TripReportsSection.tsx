import { memo, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Icon } from "../common/Icon";
import { SectionCard } from "../common/SectionCard";
import { IconBadge } from "../common/IconBadge";
import { AuthorAvatar } from "../reports/AuthorAvatar";
import { AuthorLink } from "../reports/AuthorLink";
import type { SubstanceArticle } from "../../schema";
import type { TripReport } from "../../types/tripReport";

const COLLAPSED_LIMIT = 3;

interface TripReportsSectionProps {
  article: SubstanceArticle;
  /** Called when a report is clicked */
  onSelectReport?: (slug: string) => void;
}

/**
 * Displays trip reports related to the current substance article.
 * Automatically queries Convex for reports where this substance was used.
 */
export const TripReportsSection = memo(function TripReportsSection({
  article,
  onSelectReport,
}: TripReportsSectionProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Collect all candidate names to search for
  const searchNames = useMemo(() => {
    const names = new Set<string>();
    
    // Add article title
    if (article.title?.trim()) {
      names.add(article.title.trim().toLowerCase());
    }
    
    // Add common name if different from title
    if (article.identification?.common_name?.trim()) {
      names.add(article.identification.common_name.trim().toLowerCase());
    }
    
    // Add all alternative names
    const altNames = article.identification?.alternative_names ?? [];
    for (const altName of altNames) {
      if (altName?.trim()) {
        names.add(altName.trim().toLowerCase());
      }
    }
    
    return Array.from(names);
  }, [article.title, article.identification?.common_name, article.identification?.alternative_names]);

  // Query for reports using the primary name (title)
  // The getBySubstance query does case-insensitive matching
  const primaryName = article.title?.trim() ?? "";
  const reports = useQuery(
    api.tripReports.getBySubstance,
    primaryName ? { substanceName: primaryName } : "skip"
  ) as TripReport[] | undefined;

  // Also query for alternative names if they exist and differ from primary
  const altNames = searchNames.filter(n => n !== primaryName.toLowerCase());
  
  // Query for first alternative name if exists
  const altReports1 = useQuery(
    api.tripReports.getBySubstance,
    altNames[0] ? { substanceName: altNames[0] } : "skip"
  ) as TripReport[] | undefined;
  
  // Query for second alternative name if exists
  const altReports2 = useQuery(
    api.tripReports.getBySubstance,
    altNames[1] ? { substanceName: altNames[1] } : "skip"
  ) as TripReport[] | undefined;

  // Combine and deduplicate reports
  const allReports = useMemo(() => {
    const seen = new Set<string>();
    const combined: TripReport[] = [];
    
    const addReports = (reportList: TripReport[] | undefined) => {
      if (!reportList) return;
      for (const report of reportList) {
        if (!seen.has(report.slug)) {
          seen.add(report.slug);
          combined.push(report);
        }
      }
    };
    
    addReports(reports);
    addReports(altReports1);
    addReports(altReports2);
    
    // Sort by featured first, then by title
    return combined.sort((a, b) => {
      if (a.featured && !b.featured) return -1;
      if (!a.featured && b.featured) return 1;
      return a.title.localeCompare(b.title);
    });
  }, [reports, altReports1, altReports2]);

  // Classify reports into single-substance and combination groups
  const { singleSubstanceReports, combinationReports } = useMemo(() => {
    const single: TripReport[] = [];
    const combinations: TripReport[] = [];
    
    for (const report of allReports) {
      if (report.substances.length === 1) {
        single.push(report);
      } else if (report.substances.length > 1) {
        combinations.push(report);
      }
    }
    
    // Maintain existing sort order (featured first, then by title) for each group
    const sortReports = (reports: TripReport[]) => {
      return reports.sort((a, b) => {
        if (a.featured && !b.featured) return -1;
        if (!a.featured && b.featured) return 1;
        return a.title.localeCompare(b.title);
      });
    };
    
    return {
      singleSubstanceReports: sortReports(single),
      combinationReports: sortReports(combinations),
    };
  }, [allReports]);

  // Don't render if no reports found
  if (!allReports || allReports.length === 0) {
    return null;
  }

  // Calculate visible reports - show 3 total when collapsed (single-substance first, then combinations)
  const totalReports = singleSubstanceReports.length + combinationReports.length;
  const hasMore = totalReports > COLLAPSED_LIMIT;
  const totalHidden = Math.max(0, totalReports - COLLAPSED_LIMIT);

  // When collapsed, show up to COLLAPSED_LIMIT total (single-substance first)
  let singleSubstanceVisible: TripReport[];
  let combinationVisible: TripReport[];

  if (isExpanded) {
    // When expanded, show all reports
    singleSubstanceVisible = singleSubstanceReports;
    combinationVisible = combinationReports;
  } else {
    // When collapsed, show up to COLLAPSED_LIMIT total reports
    // Single-substance reports get priority
    const singleCount = Math.min(singleSubstanceReports.length, COLLAPSED_LIMIT);
    singleSubstanceVisible = singleSubstanceReports.slice(0, singleCount);
    
    // Fill remaining slots with combinations
    const remainingSlots = COLLAPSED_LIMIT - singleCount;
    combinationVisible = combinationReports.slice(0, remainingSlots);
  }

  return (
    <SectionCard delay={0}>
      <h2 className="mb-4 flex items-center gap-3 text-lg font-semibold text-fuchsia-300">
        <IconBadge icon="lucide:file-signature" label="Trip Reports" />
        Trip Reports
      </h2>

      <div className="space-y-3">
        {/* Single-substance reports */}
        {singleSubstanceVisible.map((report) => (
          <CompactReportCard
            key={report.slug}
            report={report}
            onClick={onSelectReport ? () => onSelectReport(report.slug) : undefined}
          />
        ))}

        {/* Combinations section header - show if there are visible combination reports */}
        {combinationVisible.length > 0 && (
          <div className="mt-5 mb-3 flex items-center gap-3">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/15 to-transparent" />
            <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-white/50">
              <Icon icon="lucide:blend" size={14} className="text-fuchsia-300/60" />
              Combinations
            </h3>
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/15 to-transparent" />
          </div>
        )}

        {/* Combination reports */}
        {combinationVisible.map((report) => (
          <CompactReportCard
            key={report.slug}
            report={report}
            onClick={onSelectReport ? () => onSelectReport(report.slug) : undefined}
          />
        ))}

        {/* Expand/Collapse button - matching ReagentSection style */}
        {hasMore && (
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="mx-auto flex items-center gap-1 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-sm text-white/60 transition-colors hover:border-white/25 hover:bg-white/10 hover:text-white/80"
          >
            <span className="font-medium">+{totalHidden}</span>
            <Icon icon="lucide:chevron-down" size={16} className={`transition-transform ${isExpanded ? "rotate-180" : ""}`} />
          </button>
        )}
      </div>
    </SectionCard>
  );
});

/**
 * Compact report card for display within the substance article.
 */
function CompactReportCard({
  report,
  onClick,
}: {
  report: TripReport;
  onClick?: () => void;
}) {
  const { title, subject, featured } = report;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className="group flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3 text-left transition-all hover:border-fuchsia-400/30 hover:bg-white/[0.08] disabled:cursor-default disabled:hover:border-white/10 disabled:hover:bg-white/5"
    >
      {/* Author avatar */}
      <div className="shrink-0 self-center">
        <AuthorAvatar
          authorName={subject.name}
          avatarUrl={subject.avatar_url}
          size={32}
        />
      </div>

      <div className="flex-1 min-w-0">
        {/* Title */}
        <h3 className="text-sm font-medium text-fuchsia-200 transition-colors group-hover:text-fuchsia-100">
          {title}
        </h3>

        {/* Author and date */}
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white/50">
          <span className="flex items-center gap-1">
            <Icon icon="lucide:user" size={12} />
            <AuthorLink authorName={subject.name} className="text-white/50 hover:text-fuchsia-200" />
          </span>
          {subject.trip_date && (
            <span className="flex items-center gap-1">
              <Icon icon="lucide:calendar" size={12} />
              {subject.trip_date}
            </span>
          )}
        </div>
      </div>

      {/* Featured star - right aligned, vertically centered */}
      {featured && (
        <Icon icon="lucide:star" size={20} className="flex-shrink-0 self-center fill-fuchsia-400/80 text-fuchsia-400" />
      )}
    </button>
  );
}
