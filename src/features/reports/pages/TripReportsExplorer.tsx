"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Icon, type IconName } from "@/components/common/Icon";
import { SearchEmptyState } from "@/components/common/SearchEmptyState";
import { StateCard } from "@/components/common/StateCard";
import { PublicSegmentedTabs } from "@/components/layout/PublicSegmentedTabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { ReportCardModel, ReportViewMode } from "@/types/tripReport";
import type { PublicRouteEmptyState } from "@server/next/publicRouteOutcomes";
import { publicHref } from "@/utils/publicHref";
import {
  REPORTS_INDEX_DEFAULT_VIEW,
  replaceCurrentIndexViewPath,
  reportsIndexViewPath,
  type ReportsIndexView,
} from "@/utils/indexViewRoutes";
import { AuthorAvatar } from "../components/AuthorAvatar";
import {
  groupTripReports,
  type ReportSortDirection,
  type ReportSortKey,
} from "../domain/tripReportIndex";

interface TripReportsExplorerProps {
  reports: ReportCardModel[];
  reportHrefPrefix?: string;
  emptyState?: PublicRouteEmptyState;
  /** Server-resolved URL state; must match the first rendered grouping. */
  initialView?: ReportsIndexView;
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
  initialView = REPORTS_INDEX_DEFAULT_VIEW,
}: TripReportsExplorerProps) {
  const [viewMode, setViewMode] = useState<ReportViewMode>(initialView);
  const [sortKey, setSortKey] = useState<ReportSortKey>("alphabetical");
  const [sortDirection, setSortDirection] = useState<ReportSortDirection>("asc");
  const [substanceFilter, setSubstanceFilter] = useState<string | null>(null);

  // The distinct substance list is derived from the shipped corpus, so the
  // picker can only ever offer substances that have at least one report.
  const substanceOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const report of reports) {
      const seen = new Set<string>();
      for (const substance of report.substances) {
        const name = substance.name.trim();
        if (!name || seen.has(name)) continue;
        seen.add(name);
        counts.set(name, (counts.get(name) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  }, [reports]);

  // Narrow the corpus before grouping so the filter applies uniformly to the
  // substance, title, and author views. Combination reports stay visible when
  // they include the selected substance.
  const visibleReports = useMemo(
    () =>
      substanceFilter
        ? reports.filter((report) =>
            report.substances.some((substance) => substance.name.trim() === substanceFilter),
          )
        : reports,
    [reports, substanceFilter],
  );

  const groupedReports = useMemo(
    () => groupTripReports(visibleReports, viewMode, sortDirection, sortKey),
    [visibleReports, viewMode, sortDirection, sortKey],
  );

  const handleViewModeClick = (mode: ReportViewMode) => {
    if (viewMode === mode) {
      return;
    }
    setViewMode(mode);
    setSortKey("alphabetical");
    setSortDirection("asc");
    replaceCurrentIndexViewPath(reportsIndexViewPath(mode));
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
      <div data-nosnippet>
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

        <div className="mb-10 flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
          <div
            className="flex flex-wrap items-center justify-center gap-1.5"
            role="group"
            aria-label="Sort order"
          >
            <span className="theme-text-faint mr-0.5 text-xs">Sort by</span>
            <SortControl
              active={sortKey === "alphabetical"}
              direction={sortDirection}
              label={viewMode === "title" ? "Title" : "Name"}
              ascIcon="lucide:arrow-down-a-z"
              descIcon="lucide:arrow-up-z-a"
              ascLabel="A to Z"
              descLabel="Z to A"
              onClick={() => handleSortClick("alphabetical")}
            />
            {viewMode !== "title" ? (
              <SortControl
                active={sortKey === "count"}
                direction={sortDirection}
                label="Report count"
                ascIcon="lucide:arrow-up-narrow-wide"
                descIcon="lucide:arrow-down-wide-narrow"
                ascLabel="fewest first"
                descLabel="most first"
                onClick={() => handleSortClick("count")}
              />
            ) : null}
          </div>
          {substanceOptions.length > 0 ? (
            <SubstanceFilterControl
              options={substanceOptions}
              active={substanceFilter}
              onSelect={setSubstanceFilter}
              onClear={() => setSubstanceFilter(null)}
            />
          ) : null}
        </div>
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

      {substanceFilter !== null && visibleReports.length === 0 && (
        <div className="mt-12 flex flex-col items-center">
          <SearchEmptyState
            icon="lucide:list-filter"
            title={`No reports for ${substanceFilter}`}
            description="This substance has no published reports right now. Clear the filter to browse the full index."
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mt-4"
            onClick={() => setSubstanceFilter(null)}
          >
            Clear filter
          </Button>
        </div>
      )}

      {reports.length === 0 && (
        <div className="mt-12">
          <StateCard
            badge={emptyState?.badge ?? "No reports yet"}
            badgeVariant="secondary"
            title={emptyState?.title ?? "No trip reports found"}
            description={emptyState?.description ?? "There aren’t any public reports yet. Once reports are available, they’ll appear here grouped by substance, title, or author."}
            icon={emptyState?.icon ?? "lucide:file-search"}
            tone="neutral"
          />
        </div>
      )}
    </>
  );
}

/**
 * Secondary sort control: a quiet text button under the view tabs, built on the
 * shared Button `quiet`/`quietActive` variants (size `quiet`) so the treatment is
 * owned by the kit rather than re-derived per call. The active key carries its
 * resolved direction (icon + weight bump) so the sort state survives a grayscale
 * check, and re-clicking the active control reverses the direction — an
 * affordance the active arrow + `title="Reverse order"` now signposts.
 */
function SortControl({
  active,
  direction,
  label,
  ascIcon,
  descIcon,
  ascLabel,
  descLabel,
  onClick,
}: {
  active: boolean;
  direction: ReportSortDirection;
  label: string;
  ascIcon: IconName;
  descIcon: IconName;
  ascLabel: string;
  descLabel: string;
  onClick: () => void;
}) {
  // Inactive controls show a neutral, direction-agnostic glyph so the idle arrow
  // never implies a sort order that is not applied. The resolved arrow appears
  // only on the active control, where it doubles as the reverse-order target.
  const directionIcon: IconName = !active
    ? "lucide:arrow-up-down"
    : direction === "asc"
      ? ascIcon
      : descIcon;
  const resolvedOrder = direction === "asc" ? ascLabel : descLabel;

  return (
    <Button
      type="button"
      variant={active ? "quietActive" : "quiet"}
      size="quiet"
      onClick={onClick}
      aria-pressed={active}
      title={active ? "Reverse order" : undefined}
      aria-label={
        active
          ? `Sorted by ${label.toLowerCase()}, ${resolvedOrder}. Activate to reverse order.`
          : `Sort by ${label.toLowerCase()}`
      }
    >
      <Icon icon={directionIcon} size={15} aria-hidden />
      {label}
    </Button>
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
        prefetch={false}
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

/**
 * Single-substance filter: a pill chip opening a searchable picker popover.
 * Popover rather than a sheet is the kit's standing convention for control
 * overlays (see the replication gallery's Filters chip). The option list is
 * derived client-side from the shipped reports, so every entry is guaranteed
 * at least one report; while a substance is active the chip wears its name
 * and a sibling clear pill drops the filter in one click.
 */
function SubstanceFilterControl({
  options,
  active,
  onSelect,
  onClear,
}: {
  options: { name: string; count: number }[];
  active: string | null;
  onSelect: (name: string) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const normalizedQuery = query.trim().toLowerCase();
  const visibleOptions = normalizedQuery
    ? options.filter((option) => option.name.toLowerCase().includes(normalizedQuery))
    : options;

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setQuery("");
    }
  };

  return (
    <div className="flex items-center gap-1">
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant={active !== null ? "pillActive" : "pill"}
            size="pill"
            className="shrink-0 gap-1.5"
            aria-label={
              active !== null
                ? `Substance filter, ${active} active`
                : "Filter by substance"
            }
          >
            <Icon icon="lucide:flask-conical" className="h-4 w-4" aria-hidden />
            {active ?? "Substance"}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="center"
          collisionPadding={8}
          className="w-[calc(100vw-1rem)] p-3 sm:w-72"
        >
          <Input
            type="search"
            inputSize="sm"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search substances"
            aria-label="Search substances"
          />
          <ul className="mt-2 max-h-[min(50vh,18rem)] overflow-y-auto">
            {visibleOptions.map((option) => (
              <li key={option.name}>
                <button
                  type="button"
                  aria-pressed={option.name === active}
                  onClick={() => {
                    onSelect(option.name);
                    handleOpenChange(false);
                  }}
                  className={`flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left text-sm transition hover:bg-dose-surface-muted ${
                    option.name === active
                      ? "text-dose-accent-strong font-semibold"
                      : "theme-text-secondary hover:text-dose-text"
                  }`}
                >
                  <span className="truncate">{option.name}</span>
                  <span className="theme-text-faint shrink-0 text-xs">{option.count}</span>
                </button>
              </li>
            ))}
          </ul>
          {visibleOptions.length === 0 ? (
            <p className="theme-text-faint px-1 py-2 text-sm">No substances match.</p>
          ) : null}
        </PopoverContent>
      </Popover>
      {active !== null ? (
        <Button
          type="button"
          variant="pill"
          size="pill"
          className="shrink-0 px-2"
          aria-label={`Clear substance filter, ${active}`}
          onClick={onClear}
        >
          <Icon icon="lucide:x" className="h-3.5 w-3.5" aria-hidden />
        </Button>
      ) : null}
    </div>
  );
}
