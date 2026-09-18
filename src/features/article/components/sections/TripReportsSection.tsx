"use client";

import { SmartLink } from "@/components/common/SmartLink";
import { memo, useMemo } from "react";
import { ExpandableList } from "@/components/common/ArticleExpandable";
import { ArticleSection } from "@/components/common/ArticleSection";
import { Icon } from "@/components/common/Icon";
import { AuthorAvatar } from "@/features/reports/components/AuthorAvatar";
import {
  getVisibleSubstanceTripReports,
  prepareSubstanceTripReports,
  type PreparedSubstanceTripReports,
} from "@/features/reports/domain/tripReportIndex";
import { useT } from "@/i18n/client";
import { toReportCardModel, type ReportCardModel, type TripReport } from "@/types/tripReport";
import { SUBSTANCE_SECTION_ICONS } from "@/schema/substance/sectionManifest";
import { isPlainLeftClick } from "@/utils/navigation";
import { publicHref } from "@/utils/publicHref";

const COLLAPSED_LIMIT = 3;
const MIN_HIDDEN_REPORTS_FOR_COLLAPSE = 3;

interface TripReportsSectionProps {
  reports?: TripReport[];
  preparedReports?: PreparedSubstanceTripReports<ReportCardModel>;
  fromSubstanceSlug?: string;
  /** Called when a report is clicked */
  onSelectReport?: (slug: string) => void;
}

/**
 * Displays the compact report cards prepared for the current substance.
 */
export const TripReportsSection = memo(function TripReportsSection({
  reports = [],
  preparedReports,
  fromSubstanceSlug,
  onSelectReport,
}: TripReportsSectionProps) {
  const t = useT();
  const prepared = useMemo(
    () =>
      preparedReports ??
      prepareSubstanceTripReports(reports.map(toReportCardModel), {
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
      icon={SUBSTANCE_SECTION_ICONS["trip-reports"]}
      heading={t("Trip Reports")}
    >
      <ExpandableList
        ariaLabelBase={t("trip reports")}
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
            <div>
              {/* Single-substance reports — open index rows, matching the
                  report index aesthetic rather than nested cards. */}
              {singleSubstanceVisible.length > 0 && (
                <ul>
                  {singleSubstanceVisible.map((report) => (
                    <CompactReportRow
                      key={report.slug}
                      report={report}
                      fromSubstanceSlug={fromSubstanceSlug}
                      onSelectReport={onSelectReport}
                    />
                  ))}
                </ul>
              )}

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
                    {t("Combinations")}
                  </h3>
                  <div className="theme-horizontal-divider flex-1" />
                </div>
              )}

              {/* Combination reports */}
              {combinationVisible.length > 0 && (
                <ul>
                  {combinationVisible.map((report) => (
                    <CompactReportRow
                      key={report.slug}
                      report={report}
                      fromSubstanceSlug={fromSubstanceSlug}
                      onSelectReport={onSelectReport}
                    />
                  ))}
                </ul>
              )}
            </div>
          );
        }}
      </ExpandableList>
    </ArticleSection>
  );
});

/**
 * One related trip report rendered as an open index row, mirroring the report
 * index (`ReportIndexRow`): hairline-separated, accent title with an inline
 * featured star, and muted "on {date} — {author}" metadata with a hover tint
 * instead of card chrome. The avatar appears only when the author actually has
 * one, so authorless reports collapse to clean text rows like the index.
 */
const CompactReportRow = memo(function CompactReportRow({
  report,
  fromSubstanceSlug,
  onSelectReport,
}: {
  report: ReportCardModel;
  fromSubstanceSlug?: string;
  onSelectReport?: (slug: string) => void;
}) {
  const t = useT();
  const { title, subject, featured, slug } = report;
  const href = publicHref.report(slug, { fromSubstanceSlug });

  return (
    <li className="theme-report-index-row">
      <SmartLink
        href={href}
        onClick={(event) => {
          if (!onSelectReport || !isPlainLeftClick(event)) {
            return;
          }

          event.preventDefault();
          onSelectReport(slug);
        }}
        className="theme-report-index-link group flex items-center gap-3 rounded-lg px-3 py-2.5"
      >
        {subject.avatar_url ? (
          <span className="shrink-0">
            <AuthorAvatar
              authorName={subject.name}
              avatarUrl={subject.avatar_url}
              size={32}
            />
          </span>
        ) : null}
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="theme-accent-heading text-[0.9375rem] font-medium transition group-hover:opacity-90">
              {title}
            </span>
            {featured ? (
              <Icon
                icon="lucide:star"
                size={14}
                className="theme-icon-accent shrink-0 fill-current"
                aria-label={t("Featured report")}
              />
            ) : null}
          </span>
          <span className="theme-report-metadata-text mt-0.5 flex flex-wrap items-center gap-x-2 text-xs">
            {subject.trip_date ? <span>{t("on {{date}}", { date: subject.trip_date })}</span> : null}
            <span className="italic">— {subject.name}</span>
          </span>
        </span>
      </SmartLink>
    </li>
  );
});
