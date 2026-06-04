"use client";

import { useMemo, useState } from "react";
import { type IconName } from "@/components/common/Icon";
import { StateCard } from "@/components/common/StateCard";
import { PublicSegmentedTabs } from "@/components/layout/PublicSegmentedTabs";
import type { ReportCardModel, ReportViewMode } from "@/types/tripReport";
import type { PublicRouteEmptyState } from "@server/next/publicRouteOutcomes";
import { publicHref } from "@/utils/publicHref";
import { ReportCard } from "../components/ReportCard";
import { groupTripReports, type ReportSortDirection } from "../domain/tripReportIndex";

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

export function TripReportsExplorer({
  reports,
  reportHrefPrefix,
  emptyState,
}: TripReportsExplorerProps) {
  const [viewMode, setViewMode] = useState<ReportViewMode>("substance");
  const [sortDirection, setSortDirection] = useState<ReportSortDirection>("asc");

  const groupedReports = useMemo(
    () => groupTripReports(reports, viewMode, sortDirection),
    [reports, viewMode, sortDirection],
  );

  const handleViewModeClick = (mode: ReportViewMode) => {
    if (viewMode === mode) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setViewMode(mode);
      setSortDirection("asc");
    }
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

      {groupedReports.map((group) => (
        <div key={group.name} className="mt-8">
          {viewMode !== "title" && (
            <h2 className="theme-accent-heading mb-4 text-lg font-semibold">
              {group.name}
            </h2>
          )}
          <div className="space-y-3">
            {group.reports.map((report) => (
              <ReportCard
                key={report.slug}
                report={report}
                href={reportHrefPrefix ? `${reportHrefPrefix}${report.slug}` : publicHref.report(report.slug)}
              />
            ))}
          </div>
        </div>
      ))}

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
