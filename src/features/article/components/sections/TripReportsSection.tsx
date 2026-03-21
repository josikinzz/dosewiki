"use client";

import Link from "next/link";
import { memo, useMemo, useState } from "react";
import { ExpandButton } from "@/components/common/ExpandButton";
import { Icon } from "@/components/common/Icon";
import { SectionHeader } from "@/components/common/SectionHeader";
import { AuthorAvatar } from "@/features/reports/components/AuthorAvatar";
import { AuthorLink } from "@/features/reports/components/AuthorLink";
import type { SubstanceArticle } from "@/schema";
import type { TripReport } from "@/types/tripReport";
import { isPlainLeftClick } from "@/utils/navigation";

const COLLAPSED_LIMIT = 3;

interface TripReportsSectionProps {
  article: SubstanceArticle;
  reports?: TripReport[];
  fromSubstanceSlug?: string;
  /** Called when a report is clicked */
  onSelectReport?: (slug: string) => void;
}

/**
 * Displays trip reports related to the current substance article.
 * Automatically queries Convex for reports where this substance was used.
 */
export const TripReportsSection = memo(function TripReportsSection({
  article,
  reports = [],
  fromSubstanceSlug,
  onSelectReport,
}: TripReportsSectionProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Collect all candidate names to search for
  const searchNames = useMemo(() => {
    const names = new Set<string>();

    // Add article title
    if (article.title?.trim()) {
      names.add(article.title.trim());
    }

    // Add common name if different from title
    if (article.identification?.common_name?.trim()) {
      names.add(article.identification.common_name.trim());
    }

    // Add all alternative names
    const altNames = article.identification?.alternative_names ?? [];
    for (const altName of altNames) {
      if (altName?.trim()) {
        names.add(altName.trim());
      }
    }

    return Array.from(names);
  }, [article.title, article.identification?.common_name, article.identification?.alternative_names]);

  // Sort reports by featured first, then by title
  const allReports = useMemo(() => {
    if (searchNames.length === 0) return [];

    return [...reports].sort((a, b) => {
      if (a.featured && !b.featured) return -1;
      if (!a.featured && b.featured) return 1;
      return a.title.localeCompare(b.title);
    });
  }, [reports, searchNames.length]);

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
    <div id="trip-reports" className="space-y-6 pt-12 scroll-mt-6">
      <SectionHeader icon="lucide:file-signature" title="Trip Reports" />

      <div className="space-y-3">
        {/* Single-substance reports */}
        {singleSubstanceVisible.map((report) => (
          <CompactReportCard
            key={report.slug}
            report={report}
            fromSubstanceSlug={fromSubstanceSlug}
            onSelectReport={onSelectReport}
          />
        ))}

        {/* Combinations section header - show if there are visible combination reports */}
        {combinationVisible.length > 0 && (
          <div className="theme-accent-icon-scope mt-5 mb-3 flex items-center gap-3">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/15 to-transparent" />
            <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-white/50">
              <Icon icon="lucide:blend" size={14} className="theme-accent-icon text-fuchsia-300/60" />
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
            fromSubstanceSlug={fromSubstanceSlug}
            onSelectReport={onSelectReport}
          />
        ))}

        {/* Expand/Collapse button */}
        {hasMore && (
          <ExpandButton
            isExpanded={isExpanded}
            onToggle={() => setIsExpanded(!isExpanded)}
            variant="count"
            count={totalHidden}
            className="mx-auto"
            ariaLabel={isExpanded ? "Collapse trip reports" : "Expand trip reports"}
          />
        )}
      </div>
    </div>
  );
});

/**
 * Compact report card for display within the substance article.
 */
const CompactReportCard = memo(function CompactReportCard({
  report,
  fromSubstanceSlug,
  onSelectReport,
}: {
  report: TripReport;
  fromSubstanceSlug?: string;
  onSelectReport?: (slug: string) => void;
}) {
  const { title, subject, featured, slug } = report;
  const disableNestedLinks = true;

  const href = fromSubstanceSlug
    ? `/reports/${slug}?from=${encodeURIComponent(fromSubstanceSlug)}`
    : `/reports/${slug}`;

  const className = "group flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3 text-left transition-all hover:border-fuchsia-400/30 hover:bg-white/[0.08] disabled:cursor-default disabled:hover:border-white/10 disabled:hover:bg-white/5";

  const content = (
    <>
      <div className="shrink-0 self-center">
        <AuthorAvatar
          authorName={subject.name}
          avatarUrl={subject.avatar_url}
          size={32}
        />
      </div>

      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-medium text-fuchsia-200 transition-colors group-hover:text-fuchsia-100">
          {title}
        </h3>

        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white/50">
          <span className="flex items-center gap-1">
            <Icon icon="lucide:user" size={12} />
            <AuthorLink
              authorName={subject.name}
              className="text-white/50 hover:text-fuchsia-200"
              disableLink={disableNestedLinks}
            />
          </span>
          {subject.trip_date && (
            <span className="flex items-center gap-1">
              <Icon icon="lucide:calendar" size={12} />
              {subject.trip_date}
            </span>
          )}
        </div>
      </div>

      {featured && (
        <Icon icon="lucide:star" size={20} className="flex-shrink-0 self-center fill-fuchsia-400/80 text-fuchsia-400" />
      )}
    </>
  );

  return (
    <Link
      href={href}
      className={className}
      onClick={(event) => {
        if (!onSelectReport || !isPlainLeftClick(event)) {
          return;
        }

        event.preventDefault();
        onSelectReport(slug);
      }}
    >
      {content}
    </Link>
  );
});
