"use client";

import Link from "next/link";
import { memo, useMemo } from "react";
import { ExpandableList } from "@/components/common/ArticleExpandable";
import {
  ArticleSection,
  ArticleSubsectionCard,
} from "@/components/common/ArticleSection";
import { Icon } from "@/components/common/Icon";
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
const MIN_HIDDEN_REPORTS_FOR_COLLAPSE = 3;

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
  const prepared = useMemo(
    () =>
      preparedReports ??
      prepareSubstanceTripReports(reports, {
        collapsedLimit: COLLAPSED_LIMIT,
        minHiddenForCollapse: MIN_HIDDEN_REPORTS_FOR_COLLAPSE,
      }),
    [preparedReports, reports],
  );

  // Don't render if no reports found
  if (prepared.allReports.length === 0) {
    return null;
  }

  return (
    <ArticleSection
      id="trip-reports"
      icon="lucide:file-signature"
      heading="Trip Reports"
    >
      <ExpandableList
        ariaLabelBase="trip reports"
        collapsedCount={prepared.totalHidden}
        hasCollapsedItems={prepared.hasMore}
        items={prepared.allReports}
        toggleAdornment
      >
        {({ isExpanded }) => {
          const {
            singleSubstanceReports: singleSubstanceVisible,
            combinationReports: combinationVisible,
          } = getVisibleSubstanceTripReports(prepared, {
            collapsedLimit: COLLAPSED_LIMIT,
            isExpanded,
          });

          return (
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
                  <div className="theme-horizontal-divider flex-1" />
                  <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider theme-text-faint">
                    <Icon
                      icon="lucide:blend"
                      size={14}
                      className="theme-accent-icon theme-accent-emphasis"
                    />
                    Combinations
                  </h3>
                  <div className="theme-horizontal-divider flex-1" />
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
            </div>
          );
        }}
      </ExpandableList>
    </ArticleSection>
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
        <h3 className="text-sm font-medium theme-accent-emphasis transition-colors group-">
          {title}
        </h3>

        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs theme-text-faint">
          <span className="flex items-center gap-1">
            <Icon icon="lucide:user" size={12} />
            <AuthorLink
              authorName={subject.name}
              profileKey={subject.profile_key}
              className="theme-text-faint "
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
        <Icon
          icon="lucide:star"
          size={20}
          className="flex-shrink-0 self-center fill-fuchsia-400/80 theme-accent-emphasis"
        />
      )}
    </>
  );

  return (
    <ArticleSubsectionCard
      asChild
      padding="xs"
      variant="interactive"
      className="group flex w-full items-center gap-3 text-left"
    >
      <Link
        href={href}
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
    </ArticleSubsectionCard>
  );
});
