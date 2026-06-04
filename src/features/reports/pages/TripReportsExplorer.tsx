"use client";

import { useMemo, useState } from "react";
import { Icon, type IconName } from "@/components/common/Icon";
import { StateCard } from "@/components/common/StateCard";
import { PublicSegmentedTabs } from "@/components/layout/PublicSegmentedTabs";
import type { ReportCardModel, ReportViewMode } from "@/types/tripReport";
import type { PublicRouteEmptyState } from "@server/next/publicRouteOutcomes";
import { publicHref } from "@/utils/publicHref";
import { ReportCard } from "../components/ReportCard";
import {
  groupTripReports,
  type ReportSortDirection,
  type TripReportGroup,
} from "../domain/tripReportIndex";

interface TripReportsExplorerProps {
  reports: ReportCardModel[];
  reportHrefPrefix?: string;
  emptyState?: PublicRouteEmptyState;
}

const VIEW_MODES: { key: ReportViewMode; label: string; icon: IconName }[] = [
  { key: "substance", label: "Substance", icon: "lucide:flask-conical" },
  { key: "title", label: "Title", icon: "lucide:layout-list" },
  { key: "author", label: "Author", icon: "lucide:user" },
];

const INITIAL_VISIBLE_REPORT_COUNT = 24;
const REPORTS_PER_REVEAL = 24;
const REPORT_RESULTS_ID = "trip-reports-results";

interface VisibleReportWindow {
  count: number;
  key: string;
}

export function TripReportsExplorer({
  reports,
  reportHrefPrefix,
  emptyState,
}: TripReportsExplorerProps) {
  const [viewMode, setViewMode] = useState<ReportViewMode>("substance");
  const [sortDirection, setSortDirection] = useState<ReportSortDirection>("asc");
  const [visibleReportWindow, setVisibleReportWindow] = useState<VisibleReportWindow>({
    count: INITIAL_VISIBLE_REPORT_COUNT,
    key: "",
  });

  const groupedReports = useMemo(
    () => groupTripReports(reports, viewMode, sortDirection),
    [reports, viewMode, sortDirection],
  );
  const reportsFingerprint = useMemo(
    () => reports.map((report) => report.slug).join("\u001f"),
    [reports],
  );
  const visibleWindowKey = `${viewMode}:${sortDirection}:${reportsFingerprint}`;
  const visibleReportLimit =
    visibleReportWindow.key === visibleWindowKey
      ? visibleReportWindow.count
      : INITIAL_VISIBLE_REPORT_COUNT;
  const totalReportCount = reports.length;
  const visibleReportCount = Math.min(visibleReportLimit, totalReportCount);
  const visibleGroups = useMemo(
    () => getVisibleReportGroups(groupedReports, visibleReportCount),
    [groupedReports, visibleReportCount],
  );
  const hiddenReportCount = Math.max(0, totalReportCount - visibleReportCount);
  const hasHiddenReports = hiddenReportCount > 0;
  const showProgressiveControls = totalReportCount > INITIAL_VISIBLE_REPORT_COUNT;
  const paginationActionLabel = hasHiddenReports
    ? `Show ${Math.min(REPORTS_PER_REVEAL, hiddenReportCount)} more reports`
    : `Show first ${INITIAL_VISIBLE_REPORT_COUNT} reports`;

  const handleViewModeClick = (mode: ReportViewMode) => {
    if (viewMode === mode) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setViewMode(mode);
      setSortDirection("asc");
    }
  };

  const handleProgressiveControlClick = () => {
    if (!hasHiddenReports) {
      setVisibleReportWindow({
        count: INITIAL_VISIBLE_REPORT_COUNT,
        key: visibleWindowKey,
      });
      return;
    }

    setVisibleReportWindow((current) => {
      const currentCount =
        current.key === visibleWindowKey
          ? current.count
          : INITIAL_VISIBLE_REPORT_COUNT;

      return {
        count: Math.min(totalReportCount, currentCount + REPORTS_PER_REVEAL),
        key: visibleWindowKey,
      };
    });
  };

  return (
    <>
      <PublicSegmentedTabs
        value={viewMode}
        onItemSelect={(item) => handleViewModeClick(item.id)}
        items={VIEW_MODES.map(({ key, label, icon }) => ({
          id: key,
          label,
          icon,
          suffix: viewMode === key ? (sortDirection === "asc" ? "↑" : "↓") : null,
        }))}
        className="mt-6 mb-8"
        ariaLabel="Trip report grouping"
      />

      <div id={REPORT_RESULTS_ID}>
        {visibleGroups.map((group) => (
          <div key={group.name} className="mt-8">
            {viewMode !== "title" && (
              <h2 className="theme-text-primary mb-3 border-b border-dose-divider pb-2 text-sm font-semibold uppercase tracking-[0.16em]">
                {group.name}
              </h2>
            )}
            <div className="space-y-2.5">
              {group.reports.map((report) => (
                <ReportCard
                  key={report.slug}
                  report={report}
                  href={reportHrefPrefix ? `${reportHrefPrefix}${report.slug}` : publicHref.report(report.slug)}
                  surfaceTone="dense"
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {showProgressiveControls && (
        <div className="mt-8 flex flex-col items-center gap-3 text-center">
          <p className="theme-report-metadata-text text-sm" aria-live="polite">
            Showing {visibleReportCount} of {totalReportCount} reports
          </p>
          <button
            type="button"
            className="theme-control-pill-quiet theme-text-primary inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition-colors"
            aria-controls={REPORT_RESULTS_ID}
            aria-expanded={!hasHiddenReports}
            onClick={handleProgressiveControlClick}
          >
            <Icon
              icon={hasHiddenReports ? "lucide:chevrons-down" : "lucide:chevrons-up"}
              size={18}
            />
            {paginationActionLabel}
          </button>
        </div>
      )}

      {reports.length === 0 && (
        <div className="mt-12">
          <StateCard
            badge={emptyState?.badge ?? "No reports yet"}
            badgeVariant="secondary"
            title={emptyState?.title ?? "No trip reports found"}
            description={emptyState?.description ?? "There aren’t any public reports in this deployment yet. Once reports are available, they’ll appear here grouped by substance, title, or author."}
            icon={emptyState?.icon ?? "lucide:file-search"}
            tone="neutral"
          />
        </div>
      )}
    </>
  );
}

function getVisibleReportGroups<TReport>(
  groups: TripReportGroup<TReport>[],
  visibleReportCount: number,
): TripReportGroup<TReport>[] {
  let remainingReports = visibleReportCount;
  const visibleGroups: TripReportGroup<TReport>[] = [];

  for (const group of groups) {
    if (remainingReports <= 0) {
      break;
    }

    const reports = group.reports.slice(0, remainingReports);

    if (reports.length > 0) {
      visibleGroups.push({
        ...group,
        reports,
      });
    }

    remainingReports -= reports.length;
  }

  return visibleGroups;
}
