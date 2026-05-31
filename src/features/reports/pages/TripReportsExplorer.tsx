"use client";

import { useMemo, useState } from "react";
import { Icon, type IconName } from "@/components/common/Icon";
import { StateCard } from "@/components/common/StateCard";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
      <Tabs value={viewMode} className="mt-6 mb-8 flex justify-center">
        <TabsList className="flex-wrap h-auto rounded-2xl border border-white/12 bg-white/[0.04] p-1.5 shadow-[0_18px_36px_-28px_rgba(0,0,0,0.55)] gap-1">
          {VIEW_MODES.map(({ key, label, icon }) => (
            <TabsTrigger
              key={key}
              value={key}
              onClick={() => handleViewModeClick(key)}
              className="gap-2.5 rounded-xl px-5 py-2.5 text-[0.9375rem] font-medium text-white/68 transition-[background-color,color,box-shadow] duration-300 hover:bg-white/[0.05] hover:text-white data-[state=active]:bg-[color:var(--theme-surface-muted)] data-[state=active]:text-white data-[state=active]:shadow-[inset_0_0_0_1px_rgba(244,114,182,0.18)]"
            >
              <Icon icon={icon} size={18} />
              {label}
              {viewMode === key && (
                <span className="text-xs opacity-70">
                  {sortDirection === "asc" ? "↑" : "↓"}
                </span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {groupedReports.map((group) => (
        <div key={group.name} className="mt-8">
          {viewMode !== "title" && (
            <h2 className="mb-4 text-lg font-semibold text-fuchsia-300">
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
