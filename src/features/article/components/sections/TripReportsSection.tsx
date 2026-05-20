"use client";

import Link from "next/link";
import { memo, useMemo, useState } from "react";
import { ExpandButton } from "@/components/common/ExpandButton";
import { Icon } from "@/components/common/Icon";
import { SectionHeader } from "@/components/common/SectionHeader";
import { AuthorAvatar } from "@/features/reports/components/AuthorAvatar";
import { AuthorLink } from "@/features/reports/components/AuthorLink";
import {
  getVisibleSubstanceTripReports,
  prepareSubstanceTripReports,
  type PreparedSubstanceTripReports,
} from "@/features/reports/domain/tripReportIndex";
import type { TripReport } from "@/types/tripReport";
import { isPlainLeftClick } from "@/utils/navigation";
import { publicHref } from "@/utils/publicHref";

const COLLAPSED_LIMIT = 3;

interface TripReportsSectionProps {
  reports?: TripReport[];
  preparedReports?: PreparedSubstanceTripReports<TripReport>;
  fromSubstanceSlug?: string;
  /** Called when a report is clicked */
  onSelectReport?: (slug: string) => void;
}

/**
 * Displays trip reports related to the current substance article.
 * Automatically queries Convex for reports where this substance was used.
 */
export const TripReportsSection = memo(function TripReportsSection({
  reports = [],
  preparedReports,
  fromSubstanceSlug,
  onSelectReport,
}: TripReportsSectionProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const prepared = useMemo(
    () => preparedReports ?? prepareSubstanceTripReports(reports, { collapsedLimit: COLLAPSED_LIMIT }),
    [preparedReports, reports],
  );

  // Don't render if no reports found
  if (prepared.allReports.length === 0) {
    return null;
  }

  const {
    singleSubstanceReports: singleSubstanceVisible,
    combinationReports: combinationVisible,
  } = getVisibleSubstanceTripReports(prepared, {
    collapsedLimit: COLLAPSED_LIMIT,
    isExpanded,
  });

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
        {prepared.hasMore && (
          <div className="flex justify-center">
            <ExpandButton
              isExpanded={isExpanded}
              onToggle={() => setIsExpanded(!isExpanded)}
              variant="count"
              count={prepared.totalHidden}
              ariaLabel={isExpanded ? "Collapse trip reports" : "Expand trip reports"}
            />
          </div>
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

  const href = publicHref.report(slug, { fromSubstanceSlug });

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
              profileKey={subject.profile_key}
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
