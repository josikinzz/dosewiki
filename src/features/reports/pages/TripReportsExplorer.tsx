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
import {
  CONTROL_MENU_ITEM_CLASS,
  CONTROL_TRIGGER_CHEVRON_CLASS,
  CONTROL_TRIGGER_CLASS,
  CONTROL_TRIGGER_LABEL_CLASS,
} from "@/components/ui/controlBarTrigger";
import { focusRingClassName } from "@/components/ui/surface";
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
import { msg, useT } from "@/i18n/client";
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
import {
  COMPACT_TRIP_REPORT_CARD_CLASS,
  TripReportCard,
} from "../components/TripReportCard";
import {
  foldSparseGroups,
  groupTripReports,
  selectFeaturedReports,
  selectRecentlyAddedReports,
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

/**
 * The grouping axis names itself the way the rest of the site names it: a
 * report belongs to a substance, a title or an author, so the control reads
 * "By substance" rather than repeating the word the filter beside it owns.
 */
const MODE_LABEL: Record<ReportViewMode, string> = {
  substance: msg("By substance"),
  title: msg("By title"),
  author: msg("By author"),
};

const MODE_ICON: Record<ReportViewMode, IconName> = {
  substance: "lucide:flask-conical",
  title: "lucide:layout-list",
  author: "lucide:user",
};

const SORT_OPTIONS: {
  id: string;
  key: ReportSortKey;
  direction: ReportSortDirection;
  label: string;
}[] = [
  // "A to Z" alone named the wrong noun: every one of these orders the
  // shelves, not the reports inside them.
  { id: "name-asc", key: "alphabetical", direction: "asc", label: msg("Groups A to Z") },
  { id: "name-desc", key: "alphabetical", direction: "desc", label: msg("Groups Z to A") },
  { id: "count-desc", key: "count", direction: "desc", label: msg("Most reports first") },
  { id: "count-asc", key: "count", direction: "asc", label: msg("Fewest reports first") },
  { id: "date-desc", key: "date", direction: "desc", label: msg("Newest experience first") },
  { id: "date-asc", key: "date", direction: "asc", label: msg("Oldest experience first") },
];

const DEFAULT_SORT_ID = "name-asc";

/**
 * A shelf taller than a screen opens closed. Sixty of the corpus's substances
 * hold one report and fold into a single catch-all, and grouping by author puts
 * seventy-six reports under one byline; either would otherwise become a single
 * masonry item that no column can balance against.
 */
const OPEN_SHELF_MAX_REPORTS = 24;

/**
 * Five works plus the contribution tile fill the band's three-column grid
 * exactly twice over, so the invitation costs no row of its own.
 */
const BAND_LIMIT = 5;

type BandKey = "added" | "featured";

const BAND_TABS: { key: BandKey; label: string }[] = [
  { key: "added", label: msg("Recently added") },
  { key: "featured", label: msg("Featured") },
];

export function TripReportsExplorer({
  reports,
  reportHrefPrefix,
  emptyState,
  initialView = REPORTS_INDEX_DEFAULT_VIEW,
}: TripReportsExplorerProps) {
  const t = useT();
  const [viewMode, setViewMode] = useState<ReportViewMode>(initialView);
  const [sortId, setSortId] = useState(DEFAULT_SORT_ID);
  const [substanceFilter, setSubstanceFilter] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [shelfOverrides, setShelfOverrides] = useState<Record<string, boolean>>({});
  const [band, setBand] = useState<BandKey>("added");
  const bandTabRefs = useRef<Record<BandKey, HTMLButtonElement | null>>({
    added: null,
    featured: null,
  });
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

  // Two lists, one band. `added` is the default because it is the only
  // question the front door could not answer: with nineteen curated reports
  // and five slots, a featured-first order could never show anything newer
  // than the oldest curation decision.
  const recentlyAdded = useMemo(
    () => selectRecentlyAddedReports(reports, BAND_LIMIT),
    [reports],
  );
  const featured = useMemo(() => selectFeaturedReports(reports, BAND_LIMIT), [reports]);
  const bandTabs = featured.length > 0 ? BAND_TABS : BAND_TABS.slice(0, 1);
  const activeBand = featured.length > 0 ? band : "added";
  const bandReports = activeBand === "featured" ? featured : recentlyAdded;

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
          badge={emptyState?.badge ?? t("No reports yet")}
          badgeVariant="secondary"
          title={emptyState?.title ?? t("No trip reports found")}
          description={
            emptyState?.description ??
            t(
              "There aren’t any public reports yet. Once reports are available, they’ll appear here grouped by substance, title, or author.",
            )
          }
          icon={emptyState?.icon ?? "lucide:file-search"}
          tone="neutral"
        />
      </div>
    );
  }

  return (
    <>
      {/* The control bar tracks the reader down the index: grouping, search,
          filter and sort are all needed most while deep in the list, and a
          static bar left them thousands of pixels behind. One row at every
          width, because two rows of pinned chrome cost a phone reader a fifth
          of the screen for the whole scroll. */}
      <div
        className="sticky top-[calc(var(--site-header-height)+var(--site-header-sticky-gap))] z-20 mx-auto mb-3 w-full max-w-4xl"
        data-nosnippet
      >
        <div
          data-testid="reports-control-bar"
          className="theme-frosted-control-bar flex w-full min-w-0 items-center gap-1.5 rounded-3xl p-1.5 backdrop-blur-md md:gap-2 md:p-2"
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="pill"
                size="auto"
                className={CONTROL_TRIGGER_CLASS}
                aria-label={t("Group by: {{mode}}", { mode: t(MODE_LABEL[viewMode]) })}
                title={t("Group by: {{mode}}", { mode: t(MODE_LABEL[viewMode]) })}
              >
                <Icon icon={MODE_ICON[viewMode]} className="h-4 w-4 shrink-0" aria-hidden />
                <span className={CONTROL_TRIGGER_LABEL_CLASS}>{t(MODE_LABEL[viewMode])}</span>
                <Icon
                  icon="lucide:chevron-down"
                  className={CONTROL_TRIGGER_CHEVRON_CLASS}
                  aria-hidden
                />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuLabel>{t("Group reports by")}</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={viewMode}
                onValueChange={(value) => handleViewModeChange(value as ReportViewMode)}
              >
                {(["substance", "title", "author"] as const).map((mode) => (
                  <DropdownMenuRadioItem
                    key={mode}
                    value={mode}
                    className={CONTROL_MENU_ITEM_CLASS}
                  >
                    {t(MODE_LABEL[mode])}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="relative min-w-0 flex-1">
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
              // Names its own corpus: the site-wide field sits 330px above
              // this one and leaves the page, and nothing else told a reader
              // which of the two they were typing into.
              placeholder={t("Search {{count}} reports", { count: reports.length })}
              aria-label={t("Search these reports")}
              className={cn("h-10 pl-9 [@media(pointer:coarse)]:h-11 md:h-9", query ? "pr-10" : "pr-3")}
            />
            {query ? (
              <Button
                type="button"
                variant="ghost"
                size="auto"
                aria-label={t("Clear search")}
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
        </div>
      </div>

      {/* What the reader just did, in its own line under the bar rather than
          as a fifth control inside it. Rendered at every state so the region
          exists to be announced when narrowing starts. */}
      <p
        role="status"
        className="theme-text-faint mx-auto mb-5 w-full max-w-4xl px-1 text-xs tabular-nums empty:mb-0"
      >
        {isNarrowed
          ? t("{{visible}} of {{total}} reports", {
              visible: visibleReports.length,
              total: reports.length,
            })
          : ""}
      </p>

      {isNarrowed ? null : (
        <section aria-labelledby="reports-band-heading" className="mx-auto mb-8 w-full max-w-4xl">
          <h2 id="reports-band-heading" className="sr-only">
            {t("Report highlights")}
          </h2>
          <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
            {/* Two lists behind one band: what arrived, and what was chosen.
                Roving tabindex, so the pair costs one tab stop. */}
            <div role="tablist" aria-label={t("Report highlights")} className="flex items-center gap-1">
              {bandTabs.map((tab) => {
                const selected = tab.key === activeBand;
                return (
                  <button
                    key={tab.key}
                    ref={(node) => {
                      bandTabRefs.current[tab.key] = node;
                    }}
                    type="button"
                    role="tab"
                    id={`reports-band-tab-${tab.key}`}
                    aria-selected={selected}
                    aria-controls="reports-band-panel"
                    tabIndex={selected ? 0 : -1}
                    onClick={() => setBand(tab.key)}
                    onKeyDown={(event) => {
                      if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") {
                        return;
                      }
                      event.preventDefault();
                      const index = bandTabs.findIndex((entry) => entry.key === tab.key);
                      const step = event.key === "ArrowRight" ? 1 : -1;
                      const next =
                        bandTabs[(index + step + bandTabs.length) % bandTabs.length];
                      setBand(next.key);
                      bandTabRefs.current[next.key]?.focus();
                    }}
                    className={cn(
                      focusRingClassName,
                      "min-h-9 rounded-full px-3 text-xs font-semibold uppercase tracking-[0.1em] transition [@media(pointer:coarse)]:min-h-11",
                      selected
                        ? "theme-accent-heading bg-dose-surface-muted"
                        : "theme-text-faint hover:text-dose-text-secondary",
                    )}
                  >
                    {t(tab.label)}
                  </button>
                );
              })}
            </div>
            <p className="theme-text-faint hidden text-xs tabular-nums sm:block">
              {t("{{reports}} reports · {{substances}} substances · {{authors}} authors", {
                reports: reports.length,
                substances: substanceOptions.length,
                authors: authorCount,
              })}
            </p>
          </div>
          {/* Compact density: the full card lays avatar, title and substance
              chips out as one wide row, which collides with itself in a grid
              cell. The band's job is to make a reader open something, so title,
              byline and date carry it and the shelves carry the chemistry. */}
          <div
            role="tabpanel"
            id="reports-band-panel"
            aria-labelledby={`reports-band-tab-${activeBand}`}
            className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3"
          >
            {bandReports.map((report) => (
              <TripReportCard
                key={report.slug}
                report={report}
                href={reportHref(report.slug)}
                density="compact"
                // Every card in the featured list is featured and none in the
                // added list was chosen, so the star discriminated nothing
                // here while looking exactly like a bookmark toggle. It still
                // marks the minority of rows down in the shelves.
                showFeatured={false}
              />
            ))}
            <SubmitReportTile />
          </div>
        </section>
      )}

      {visibleReports.length === 0 ? (
        <div className="mx-auto flex w-full max-w-4xl flex-col items-center">
          <SearchEmptyState
            headingLevel="h2"
            icon="lucide:list-filter"
            title={t("No reports match")}
            description={t("Nothing in the archive matches {{what}}. Clear it to browse the full index.", {
              what: substanceFilter
                ? query.trim()
                  ? t("{{substance}} and this search", { substance: substanceFilter })
                  : substanceFilter
                : t("this search"),
            })}
          />
          <Button type="button" variant="pill" size="pill" className="mt-4" onClick={clearNarrowing}>
            {t("Clear filters")}
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
 * The invitation, in the band rather than in the footer.
 *
 * It used to render only at the very end of the page, which measured 93% of
 * the scroll on a desktop and 96% on a phone: not a placement, a hiding
 * place. Here it is a cell of the same grid as the reports it sits beside, so
 * it costs no vertical chrome above the first card and arrives at the moment
 * a reader is looking at other people's accounts. The sentence under the
 * label is the one that answers the actual fear, and it lived two thousand
 * pixels away behind a click until now.
 */
function SubmitReportTile() {
  const t = useT();
  return (
    <SmartLink
      href={publicHref.reportSubmission()}
      className={cn(
        COMPACT_TRIP_REPORT_CARD_CLASS,
        "min-h-[4.25rem] flex-col items-start justify-center gap-1",
      )}
    >
      <span className="theme-accent-heading flex items-center gap-1.5 text-sm font-medium transition group-hover:opacity-90">
        <Icon icon="lucide:file-pen-line" size={14} aria-hidden />
        {t("Submit a report")}
      </span>
      <span className="theme-text-faint text-xs leading-snug">
        {t("Stays private until an editor approves it.")}
      </span>
    </SmartLink>
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
  const t = useT();
  const authorProfileKey =
    group.kind === "author" ? group.reports[0]?.subject.profile_key : undefined;

  return (
    // `scroll-mt-32` was 128px against 136px of pinned chrome, so a jumped-to
    // heading landed under the bar. Derived from the same tokens the bar's
    // own offset uses, plus its 3.25rem height and a 0.5rem breath.
    <div
      id={group.anchor}
      className="scroll-mt-[calc(var(--site-header-height)+var(--site-header-sticky-gap)+3.75rem)]"
    >
      <IndexCard
        title={t(group.name)}
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
  const t = useT();
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
              aria-label={t("Featured report")}
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
 * Sort as one disclosed menu rather than a row of text buttons: every ordering
 * is named outright, so no state hides behind a re-click gesture, and the
 * trigger label always reports the applied order. Same object as its three
 * neighbours in the bar, at the same height, with a 44px coarse-pointer floor
 * the old 34px pill did not have.
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
  const t = useT();
  const orderLabel = t(activeLabel);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="pill"
          size="auto"
          className={CONTROL_TRIGGER_CLASS}
          aria-label={t("Sort order, {{order}}", { order: orderLabel })}
          title={t("Sort order, {{order}}", { order: orderLabel })}
        >
          <Icon icon="lucide:arrow-up-down" className="h-4 w-4 shrink-0" aria-hidden />
          <span className={CONTROL_TRIGGER_LABEL_CLASS}>{orderLabel}</span>
          <Icon
            icon="lucide:chevron-down"
            className={CONTROL_TRIGGER_CHEVRON_CLASS}
            aria-hidden
          />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>{t("Sort groups by")}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={activeId} onValueChange={onChange}>
          {SORT_OPTIONS.map((option) => (
            <DropdownMenuRadioItem
              key={option.id}
              value={option.id}
              className={CONTROL_MENU_ITEM_CLASS}
            >
              {t(option.label)}
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
  const t = useT();
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
            size="auto"
            className={CONTROL_TRIGGER_CLASS}
            aria-label={
              active !== null
                ? t("Substance filter, {{substance}} active", { substance: active })
                : t("Filter by substance")
            }
            title={
              active !== null
                ? t("Substance filter, {{substance}} active", { substance: active })
                : t("Filter by substance")
            }
          >
            <Icon icon="lucide:flask-conical" className="h-4 w-4 shrink-0" aria-hidden />
            {/* Not "Substance": the grouping control beside it already carries
                that word, and two controls with one label did different
                things. An active filter names itself instead. */}
            <span className={cn(CONTROL_TRIGGER_LABEL_CLASS, "max-w-[9rem] truncate")}>
              {active ?? t("Filter")}
            </span>
            <Icon
              icon="lucide:chevron-down"
              className={CONTROL_TRIGGER_CHEVRON_CLASS}
              aria-hidden
            />
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
            placeholder={t("Search substances")}
            aria-label={t("Search substances")}
          />
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label={t("Substances with reports")}
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
            <p className="theme-text-faint px-1 py-2 text-sm">{t("No substances match.")}</p>
          ) : null}
        </PopoverContent>
      </Popover>
      {active !== null ? (
        <Button
          type="button"
          variant="pill"
          size="auto"
          // A square at every width: it is the one control with nothing to
          // name, so it never earns the label track its neighbours get.
          className="h-10 w-10 shrink-0 justify-center p-0 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11 md:h-9 md:w-9"
          aria-label={t("Clear substance filter, {{substance}}", { substance: active })}
          title={t("Clear substance filter, {{substance}}", { substance: active })}
          onClick={onClear}
        >
          <Icon icon="lucide:x" className="h-4 w-4" aria-hidden />
        </Button>
      ) : null}
    </div>
  );
}
