"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

import { Icon, type IconName } from "@/components/common/Icon";
import { IndexCard } from "@/components/common/IndexCard";
import {
  INDEX_PANEL_STACK_CLASS_NAME,
  IndexPanelGrid,
} from "@/components/common/IndexPanelLayout";
import { SearchEmptyState } from "@/components/common/SearchEmptyState";
import { SmartLink } from "@/components/common/SmartLink";
import { StateCard } from "@/components/common/StateCard";
import { PublicSegmentedTabs } from "@/components/layout/PublicSegmentedTabs";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useResponsiveColumnCount } from "@/hooks/useResponsiveColumnCount";
import { cn } from "@/lib/utils";
import type { ReportCardModel, ReportViewMode } from "@/types/tripReport";
import type { PublicRouteEmptyState } from "@server/next/publicRouteOutcomes";
import { publicHref } from "@/utils/publicHref";
import {
  REPORTS_INDEX_DEFAULT_VIEW,
  replaceCurrentIndexViewPath,
  reportsIndexViewPath,
  type ReportsIndexView,
} from "@/utils/indexViewRoutes";
import { formatTripDateLabel } from "@/utils/tripReportDate";
import { TripReportCard } from "../components/TripReportCard";
import {
  foldSparseGroups,
  groupTripReports,
  selectSpotlightReports,
  type ReportSortDirection,
  type ReportSortKey,
  type TripReportGroup,
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

const SORT_OPTIONS: {
  id: string;
  key: ReportSortKey;
  direction: ReportSortDirection;
  label: string;
}[] = [
  { id: "name-asc", key: "alphabetical", direction: "asc", label: "A to Z" },
  { id: "name-desc", key: "alphabetical", direction: "desc", label: "Z to A" },
  { id: "count-desc", key: "count", direction: "desc", label: "Most reports first" },
  { id: "count-asc", key: "count", direction: "asc", label: "Fewest reports first" },
  { id: "date-desc", key: "date", direction: "desc", label: "Newest experience first" },
  { id: "date-asc", key: "date", direction: "asc", label: "Oldest experience first" },
];

const DEFAULT_SORT_ID = "name-asc";

/**
 * A shelf taller than a screen opens closed. Sixty of the corpus's substances
 * hold one report and fold into a single catch-all, and grouping by author puts
 * seventy-six reports under one byline; either would otherwise become a single
 * masonry item that no column can balance against.
 */
const OPEN_SHELF_MAX_REPORTS = 24;
const SPOTLIGHT_LIMIT = 6;

export function TripReportsExplorer({
  reports,
  reportHrefPrefix,
  emptyState,
  initialView = REPORTS_INDEX_DEFAULT_VIEW,
}: TripReportsExplorerProps) {
  const [viewMode, setViewMode] = useState<ReportViewMode>(initialView);
  const [sortId, setSortId] = useState(DEFAULT_SORT_ID);
  const [substanceFilter, setSubstanceFilter] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [shelfOverrides, setShelfOverrides] = useState<Record<string, boolean>>({});
  const { count: columnCount, gate: columnGate, ref: panelRef } = useResponsiveColumnCount();

  // A phone measures one column, and leaving thirty shelves open there costs
  // fourteen screens. Collapsed, the same index is a counted table of contents
  // in about two. Driven by the measured column count rather than a media
  // query, so it tracks the layout that actually rendered.
  const oneColumn = columnCount === 1;

  const sort = SORT_OPTIONS.find((option) => option.id === sortId) ?? SORT_OPTIONS[0];

  // Filter, sort and query live in the query string rather than in the path, so
  // a narrowed index is shareable and Back undoes it. They are adopted after
  // mount because the route is statically revalidated: reading them during
  // render would either force the page dynamic or desync hydration.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const nextSubstance = params.get("substance");
    const nextQuery = params.get("q");
    const nextSort = params.get("sort");

    if (nextSubstance) {
      setSubstanceFilter(nextSubstance);
    }
    if (nextQuery) {
      setQuery(nextQuery);
      if (searchInputRef.current) {
        searchInputRef.current.value = nextQuery;
      }
    }
    if (nextSort && SORT_OPTIONS.some((option) => option.id === nextSort)) {
      setSortId(nextSort);
    }
  }, []);

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

  const authorCount = useMemo(
    () => new Set(reports.map((report) => report.subject.name)).size,
    [reports],
  );

  // Narrow the corpus before grouping so filter and search apply uniformly to
  // the substance, title and author views. Combination reports stay visible
  // when they include the selected substance.
  const visibleReports = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!substanceFilter && !needle) {
      return reports;
    }

    return reports.filter((report) => {
      if (
        substanceFilter &&
        !report.substances.some((substance) => substance.name.trim() === substanceFilter)
      ) {
        return false;
      }
      if (!needle) {
        return true;
      }
      return (
        report.title.toLowerCase().includes(needle) ||
        report.subject.name.toLowerCase().includes(needle) ||
        report.substances.some((substance) => substance.name.toLowerCase().includes(needle))
      );
    });
  }, [reports, substanceFilter, query]);

  const groupedReports = useMemo(() => {
    const groups = groupTripReports(visibleReports, viewMode, sort.direction, sort.key);
    return viewMode === "substance" ? foldSparseGroups(groups) : groups;
  }, [visibleReports, viewMode, sort.direction, sort.key]);

  // Sequential weight chunking, not round-robin: the shelves are ordered
  // (A to Z, or by count, or by date), and a reader expects column one to hold
  // the start of that order rather than every third heading. Filling each
  // column to its share of the total row count keeps the columns level without
  // scrambling the sequence, which is what CSS columns does natively and what
  // an explicit grid has to be told.
  const shelfColumns = useMemo(() => {
    const columns: TripReportGroup<ReportCardModel>[][] = Array.from(
      { length: Math.max(columnCount, 1) },
      () => [],
    );
    const weightOf = (group: TripReportGroup<ReportCardModel>) =>
      1 + (group.reports.length <= OPEN_SHELF_MAX_REPORTS && !oneColumn ? group.reports.length : 0);
    const total = groupedReports.reduce((sum, group) => sum + weightOf(group), 0);
    const target = total / columns.length;

    let column = 0;
    let filled = 0;
    for (const group of groupedReports) {
      if (column < columns.length - 1 && filled >= target * (column + 1)) {
        column += 1;
      }
      columns[column].push(group);
      filled += weightOf(group);
    }

    return columns.filter((entries) => entries.length > 0);
  }, [groupedReports, columnCount, oneColumn]);

  const spotlight = useMemo(
    () => selectSpotlightReports(reports, SPOTLIGHT_LIMIT),
    [reports],
  );

  const reportHref = (slug: string) =>
    reportHrefPrefix ? `${reportHrefPrefix}${slug}` : publicHref.report(slug);

  const isNarrowed = substanceFilter !== null || query.trim().length > 0;

  const writeUrlState = (next: {
    view?: ReportViewMode;
    substance?: string | null;
    sortId?: string;
    query?: string;
  }) => {
    const params = new URLSearchParams();
    const nextSubstance = next.substance === undefined ? substanceFilter : next.substance;
    const nextQuery = next.query === undefined ? query : next.query;
    const nextSortId = next.sortId ?? sortId;

    if (nextSubstance) params.set("substance", nextSubstance);
    if (nextQuery.trim()) params.set("q", nextQuery.trim());
    if (nextSortId !== DEFAULT_SORT_ID) params.set("sort", nextSortId);

    replaceCurrentIndexViewPath(
      reportsIndexViewPath(next.view ?? viewMode),
      params.toString(),
    );
  };

  const handleViewModeChange = (mode: ReportViewMode) => {
    if (viewMode === mode) {
      return;
    }
    setViewMode(mode);
    writeUrlState({ view: mode });
  };

  const handleSortChange = (nextSortId: string) => {
    setSortId(nextSortId);
    writeUrlState({ sortId: nextSortId });
  };

  const handleQueryChange = (nextQuery: string) => {
    setQuery(nextQuery);
    writeUrlState({ query: nextQuery });
  };

  const handleSubstanceChange = (nextSubstance: string | null) => {
    setSubstanceFilter(nextSubstance);
    writeUrlState({ substance: nextSubstance });
  };

  const clearNarrowing = () => {
    setSubstanceFilter(null);
    setQuery("");
    if (searchInputRef.current) {
      searchInputRef.current.value = "";
    }
    writeUrlState({ substance: null, query: "" });
  };

  if (reports.length === 0) {
    return (
      <div className="mx-auto w-full max-w-4xl">
        <StateCard
          badge={emptyState?.badge ?? "No reports yet"}
          badgeVariant="secondary"
          title={emptyState?.title ?? "No trip reports found"}
          description={
            emptyState?.description ??
            "There aren’t any public reports yet. Once reports are available, they’ll appear here grouped by substance, title, or author."
          }
          icon={emptyState?.icon ?? "lucide:file-search"}
          tone="neutral"
        />
      </div>
    );
  }

  return (
    <>
      <p className="theme-text-faint mb-6 text-center text-xs sm:text-sm">
        {reports.length} reports · {substanceOptions.length} substances · {authorCount} authors
      </p>

      {/* The control bar tracks the reader down the index: grouping, search,
          filter and sort are all needed most while deep in the list, and a
          static bar left them thousands of pixels behind. */}
      <div
        className="sticky top-[calc(var(--site-header-height)+var(--site-header-sticky-gap))] z-20 mx-auto mb-8 w-full max-w-4xl"
        data-nosnippet
      >
        <div className="theme-frosted-control-bar flex w-full min-w-0 flex-wrap items-center gap-2 rounded-2xl p-1.5 backdrop-blur-md sm:p-2">
          <PublicSegmentedTabs
            value={viewMode}
            onItemSelect={(item) => handleViewModeChange(item.id)}
            items={VIEW_MODES.map(({ key, label, icon }) => ({ id: key, label, icon }))}
            className="shrink-0 justify-start"
            ariaLabel="Trip report grouping"
          />

          <div className="relative min-w-0 flex-1 basis-44">
            <Icon
              icon="lucide:search"
              className="theme-text-faint pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
              aria-hidden
            />
            <Input
              ref={searchInputRef}
              type="search"
              // `sm` is 40px tall and `Input` carries no coarse-pointer floor,
              // so the one control a phone reader uses most would miss 44px.
              inputSize="default"
              defaultValue=""
              onChange={(event) => handleQueryChange(event.target.value)}
              placeholder="Search title, author, substance"
              aria-label="Search reports"
              className={cn("pl-9", query ? "pr-10" : "pr-3")}
            />
            {query ? (
              <Button
                type="button"
                variant="ghost"
                size="auto"
                aria-label="Clear search"
                className="absolute right-0 top-1/2 h-9 w-9 -translate-y-1/2 p-0"
                onClick={() => {
                  if (searchInputRef.current) {
                    searchInputRef.current.value = "";
                  }
                  handleQueryChange("");
                  searchInputRef.current?.focus();
                }}
              >
                <Icon icon="lucide:x" className="h-4 w-4" aria-hidden />
              </Button>
            ) : null}
          </div>

          {substanceOptions.length > 0 ? (
            <SubstanceFilterControl
              options={substanceOptions}
              active={substanceFilter}
              onSelect={handleSubstanceChange}
              onClear={() => handleSubstanceChange(null)}
            />
          ) : null}

          <SortMenu activeId={sort.id} activeLabel={sort.label} onChange={handleSortChange} />

          {isNarrowed ? (
            <span className="theme-text-faint shrink-0 px-1 text-xs" role="status">
              {visibleReports.length} of {reports.length}
            </span>
          ) : null}
        </div>
      </div>

      {isNarrowed ? null : (
        <section aria-labelledby="reports-spotlight" className="mx-auto mb-10 w-full max-w-4xl">
          <h2
            id="reports-spotlight"
            className="theme-text-faint mb-3 text-xs font-semibold uppercase tracking-[0.16em]"
          >
            Start here
          </h2>
          {/* Compact density: the full card lays avatar, title and substance
              chips out as one wide row, which collides with itself in a grid
              cell. The band's job is to make a reader open something, so title,
              byline and date carry it and the shelves carry the chemistry. */}
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {spotlight.map((report) => (
              <TripReportCard
                key={report.slug}
                report={report}
                href={reportHref(report.slug)}
                density="compact"
              />
            ))}
          </div>
        </section>
      )}

      {visibleReports.length === 0 ? (
        <div className="mx-auto flex w-full max-w-4xl flex-col items-center">
          <SearchEmptyState
            headingLevel="h2"
            icon="lucide:list-filter"
            title="No reports match"
            description="Nothing in the archive matches this substance and search. Clear them to browse the full index."
          />
          <Button type="button" variant="pill" size="pill" className="mt-4" onClick={clearNarrowing}>
            Clear filters
          </Button>
        </div>
      ) : (
        <IndexPanelGrid ref={panelRef} columns={shelfColumns.length} gate={columnGate}>
          {shelfColumns.map((column, index) => (
            <div key={index} className={INDEX_PANEL_STACK_CLASS_NAME}>
              {column.map((group) => (
                <ReportShelf
                  key={group.anchor}
                  group={group}
                  reportHref={reportHref}
                  expanded={
                    shelfOverrides[group.anchor] ??
                    (!oneColumn && group.reports.length <= OPEN_SHELF_MAX_REPORTS)
                  }
                  onExpandedChange={(next) =>
                    setShelfOverrides((current) => ({ ...current, [group.anchor]: next }))
                  }
                />
              ))}
            </div>
          ))}
        </IndexPanelGrid>
      )}
    </>
  );
}

/**
 * One grouping as an index panel: the kit's collapsible card carrying the
 * group's count, wrapped in the masonry item class so it never breaks across
 * columns, and given a stable anchor so the section is linkable.
 */
function ReportShelf({
  group,
  reportHref,
  expanded,
  onExpandedChange,
}: {
  group: TripReportGroup<ReportCardModel>;
  reportHref: (slug: string) => string;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
}) {
  const authorProfileKey =
    group.kind === "author" ? group.reports[0]?.subject.profile_key : undefined;

  return (
    <div id={group.anchor} className="scroll-mt-32">
      <IndexCard
        title={group.name}
        icon="lucide:flask-conical"
        hideIcon
        count={group.reports.length}
        expanded={expanded}
        onExpandedChange={onExpandedChange}
        contentId={`shelf-${group.anchor}`}
        titleHref={authorProfileKey ? publicHref.contributor(authorProfileKey) : undefined}
      >
        <ul>
          {group.reports.map((report) => (
            <ReportIndexRow
              key={report.slug}
              report={report}
              href={reportHref(report.slug)}
              groupKind={group.kind}
            />
          ))}
        </ul>
      </IndexCard>
    </div>
  );
}

/**
 * One report as an open index row: hairline-separated, accent title, muted
 * metadata, hover tint instead of card chrome. The metadata line prints only
 * what the group heading has not already said, and the dose comes from the
 * payload the index has always carried and never rendered.
 */
function ReportIndexRow({
  href,
  report,
  groupKind,
}: {
  href: string;
  report: ReportCardModel;
  groupKind: TripReportGroup<ReportCardModel>["kind"];
}) {
  const primary = report.substances[0];
  const substanceLabel =
    groupKind === "substance"
      ? primary?.dose?.trim()
      : report.substances.length === 1
        ? [primary?.name, primary?.dose?.trim()].filter(Boolean).join(" ")
        : report.substances.map((substance) => substance.name).join(" + ");

  const metaParts = [
    substanceLabel,
    formatTripDateLabel(report.subject.trip_date),
    groupKind === "author" ? null : report.subject.name,
  ].filter((part): part is string => Boolean(part));

  return (
    <li className="theme-report-index-row">
      <SmartLink
        href={href}
        className="theme-report-index-link group flex flex-col gap-0.5 rounded-lg px-2.5 py-2"
      >
        <span className="flex items-start gap-1.5">
          <span className="theme-accent-heading text-sm font-medium leading-snug transition group-hover:opacity-90">
            {report.title}
          </span>
          {report.featured ? (
            <Icon
              icon="lucide:star"
              size={13}
              className="theme-icon-accent mt-0.5 shrink-0 fill-current"
              aria-label="Featured report"
            />
          ) : null}
        </span>
        {metaParts.length > 0 ? (
          <span className="theme-report-metadata-text text-xs leading-snug">
            {metaParts.join(" · ")}
          </span>
        ) : null}
      </SmartLink>
    </li>
  );
}

/**
 * Sort as one disclosed chip rather than a row of text buttons: every ordering
 * is named outright, so no state hides behind a re-click gesture, and the chip
 * label always reports the applied order.
 */
function SortMenu({
  activeId,
  activeLabel,
  onChange,
}: {
  activeId: string;
  activeLabel: string;
  onChange: (id: string) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="pill"
          size="pill"
          className="shrink-0 gap-1.5"
          aria-label={`Sort order, ${activeLabel}`}
        >
          <Icon icon="lucide:arrow-up-down" className="h-4 w-4" aria-hidden />
          <span className="hidden sm:inline">{activeLabel}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Sort groups by</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={activeId} onValueChange={onChange}>
          {SORT_OPTIONS.map((option) => (
            <DropdownMenuRadioItem key={option.id} value={option.id}>
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Single-substance filter: a pill chip opening a searchable picker. The option
 * list is a real listbox driven from the search field, so ninety-nine
 * substances cost one tab stop instead of ninety-nine, and every entry is
 * derived from the shipped corpus and therefore has at least one report.
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
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const baseId = useId();
  const listId = `${baseId}-list`;

  const normalizedQuery = query.trim().toLowerCase();
  const visibleOptions = normalizedQuery
    ? options.filter((option) => option.name.toLowerCase().includes(normalizedQuery))
    : options;
  const highlighted = Math.min(activeIndex, Math.max(visibleOptions.length - 1, 0));

  useEffect(() => {
    listRef.current?.children[highlighted]?.scrollIntoView({ block: "nearest" });
  }, [highlighted, open]);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setQuery("");
      setActiveIndex(0);
    }
  };

  const commit = (name: string) => {
    onSelect(name);
    handleOpenChange(false);
  };

  return (
    <div className="flex shrink-0 items-center gap-1">
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant={active !== null ? "pillActive" : "pill"}
            size="pill"
            className="shrink-0 gap-1.5"
            aria-label={
              active !== null ? `Substance filter, ${active} active` : "Filter by substance"
            }
          >
            <Icon icon="lucide:flask-conical" className="h-4 w-4" aria-hidden />
            {/* Not "Substance": the grouping tab beside it already carries that
                word, and two controls with one label did different things. */}
            <span className={active === null ? "hidden sm:inline" : undefined}>
              {active ?? "Filter"}
            </span>
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
            role="combobox"
            aria-expanded
            aria-controls={listId}
            aria-activedescendant={
              visibleOptions.length > 0 ? `${baseId}-option-${highlighted}` : undefined
            }
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActiveIndex(Math.min(highlighted + 1, visibleOptions.length - 1));
                return;
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                setActiveIndex(Math.max(highlighted - 1, 0));
                return;
              }
              if (event.key === "Enter") {
                event.preventDefault();
                const option = visibleOptions[highlighted];
                if (option) {
                  commit(option.name);
                }
              }
            }}
            placeholder="Search substances"
            aria-label="Search substances"
          />
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label="Substances with reports"
            className="mt-2 max-h-[min(50vh,18rem)] overflow-y-auto"
          >
            {visibleOptions.map((option, index) => (
              // The combobox input owns the keyboard: ArrowUp/ArrowDown move
              // `aria-activedescendant` across these options and Enter commits
              // the active one. Options are pointer targets only, so a
              // keyboard listener here would be unreachable.
              // eslint-disable-next-line jsx-a11y/click-events-have-key-events
              <li
                key={option.name}
                id={`${baseId}-option-${index}`}
                role="option"
                aria-selected={option.name === active}
                onClick={() => commit(option.name)}
                onMouseEnter={() => setActiveIndex(index)}
                className={cn(
                  "flex cursor-pointer items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left text-sm transition",
                  index === highlighted ? "bg-dose-surface-muted" : undefined,
                  option.name === active
                    ? "text-dose-accent-strong font-semibold"
                    : "theme-text-secondary",
                )}
              >
                <span className="truncate">{option.name}</span>
                <span className="theme-text-faint shrink-0 text-xs">{option.count}</span>
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
