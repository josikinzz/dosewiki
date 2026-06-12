"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Icon, type IconName } from "@/components/common/Icon";
import { StateCard } from "@/components/common/StateCard";
import { PublicSegmentedTabs } from "@/components/layout/PublicSegmentedTabs";
import type { ReportCardModel, ReportViewMode } from "@/types/tripReport";
import type { PublicRouteEmptyState } from "@server/next/publicRouteOutcomes";
import { publicHref } from "@/utils/publicHref";
import { AuthorAvatar } from "../components/AuthorAvatar";
import { cn } from "@/lib/utils";
import {
  groupTripReports,
  type ReportSortDirection,
  type ReportSortKey,
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

export function TripReportsExplorer({
  reports,
  reportHrefPrefix,
  emptyState,
}: TripReportsExplorerProps) {
  const [viewMode, setViewMode] = useState<ReportViewMode>("substance");
  const [sortKey, setSortKey] = useState<ReportSortKey>("alphabetical");
  const [sortDirection, setSortDirection] = useState<ReportSortDirection>("asc");

  const groupedReports = useMemo(
    () => groupTripReports(reports, viewMode, sortDirection, sortKey),
    [reports, viewMode, sortDirection, sortKey],
  );

  const handleViewModeClick = (mode: ReportViewMode) => {
    if (viewMode === mode) {
      return;
    }
    setViewMode(mode);
    setSortKey("alphabetical");
    setSortDirection("asc");
  };

  const handleSortClick = (key: ReportSortKey) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    // Count sorting defaults to most-reports-first; names default to A-Z.
    setSortDirection(key === "count" ? "desc" : "asc");
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
        }))}
        className="mt-6 mb-3"
        ariaLabel="Trip report grouping"
      />

      <div className="mb-10 flex flex-wrap items-center justify-center gap-1" role="group" aria-label="Sort order">
        <SortControl
          active={sortKey === "alphabetical"}
          direction={sortDirection}
          label={viewMode === "title" ? "Title" : "Name"}
          ascIcon="lucide:arrow-down-a-z"
          descIcon="lucide:arrow-up-z-a"
          onClick={() => handleSortClick("alphabetical")}
        />
        {viewMode !== "title" ? (
          <SortControl
            active={sortKey === "count"}
            direction={sortDirection}
            label="Report count"
            ascIcon="lucide:arrow-up-narrow-wide"
            descIcon="lucide:arrow-down-wide-narrow"
            onClick={() => handleSortClick("count")}
          />
        ) : null}
      </div>

      <div>
        {groupedReports.map((group) => (
          <div key={group.name} className="mt-8">
            {viewMode !== "title" && (
              <div className="mb-3">
                <h2 className="text-dose-accent-muted pb-2 text-sm font-semibold uppercase tracking-[0.16em]">
                  {group.name}
                </h2>
                <div className="theme-horizontal-divider h-px" />
              </div>
            )}
            <ul>
              {group.reports.map((report) => (
                <ReportIndexRow
                  key={report.slug}
                  report={report}
                  href={reportHrefPrefix ? `${reportHrefPrefix}${report.slug}` : publicHref.report(report.slug)}
                  showSubstances={viewMode !== "substance"}
                />
              ))}
            </ul>
          </div>
        ))}
      </div>

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

/**
 * Secondary sort control: quiet icon-and-label text button under the view
 * tabs. The active key shows in accent with a direction icon; clicking it
 * again flips the direction.
 */
function SortControl({
  active,
  direction,
  label,
  ascIcon,
  descIcon,
  onClick,
}: {
  active: boolean;
  direction: ReportSortDirection;
  label: string;
  ascIcon: IconName;
  descIcon: IconName;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex min-h-8 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors duration-200",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--theme-accent-strong)]",
        active
          ? "theme-accent-emphasis"
          : "theme-text-faint hover:text-[var(--theme-text-primary)]",
        "[@media(pointer:coarse)]:min-h-11",
      )}
    >
      <Icon icon={direction === "asc" || !active ? ascIcon : descIcon} size={15} />
      {label}
    </button>
  );
}

/**
 * One report as an open index row: hairline-separated, accent title, muted
 * metadata, hover tint instead of card chrome. Avatar appears only when the
 * author actually has one; substances are listed only in views where the
 * group heading doesn't already say them.
 */
function ReportIndexRow({
  href,
  report,
  showSubstances,
}: {
  href: string;
  report: ReportCardModel;
  showSubstances: boolean;
}) {
  const substanceSummary = showSubstances
    ? report.substances.map((substance) => substance.name).join(", ")
    : "";

  return (
    <li className="theme-report-index-row">
      <Link
        href={href}
        className="theme-report-index-link group flex items-center gap-3 rounded-lg px-3 py-2.5"
      >
        {report.subject.avatar_url ? (
          <span className="shrink-0">
            <AuthorAvatar
              authorName={report.subject.name}
              avatarUrl={report.subject.avatar_url}
              size={32}
            />
          </span>
        ) : null}
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="theme-accent-heading text-[0.9375rem] font-medium transition group-hover:opacity-90">
              {report.title}
            </span>
            {report.featured ? (
              <Icon
                icon="lucide:star"
                size={14}
                className="theme-icon-accent shrink-0 fill-current"
                aria-label="Featured report"
              />
            ) : null}
          </span>
          <span className="theme-report-metadata-text mt-0.5 flex flex-wrap items-center gap-x-2 text-xs">
            {report.subject.trip_date ? <span>on {report.subject.trip_date}</span> : null}
            <span className="italic">— {report.subject.name}</span>
          </span>
        </span>
        {substanceSummary ? (
          <span className="theme-text-faint hidden shrink-0 text-xs sm:block">
            {substanceSummary}
          </span>
        ) : null}
      </Link>
    </li>
  );
}
