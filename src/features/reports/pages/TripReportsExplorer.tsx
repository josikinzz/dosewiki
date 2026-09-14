"use client";

import { useRef, useState } from "react";

import { Icon, type IconName } from "@/components/common/Icon";
import {
  INDEX_PANEL_STACK_CLASS_NAME,
  IndexPanelGrid,
} from "@/components/common/IndexPanelLayout";
import { SearchEmptyState } from "@/components/common/SearchEmptyState";
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
import { msg, useT } from "@/i18n/client";
import { cn } from "@/lib/utils";
import type { ReportCardModel, ReportViewMode } from "@/types/tripReport";
import type { PublicRouteEmptyState } from "@server/next/publicRouteOutcomes";
import { REPORTS_INDEX_DEFAULT_VIEW, type ReportsIndexView } from "@/utils/indexViewRoutes";
import { TripReportCard } from "../components/TripReportCard";
import { SortMenu, SubstanceFilterControl } from "./TripReportsControls";
import { ReportShelf, SubmitReportTile } from "./TripReportsPresentation";
import {
  OPEN_SHELF_MAX_REPORTS,
  useTripReportsExplorer,
} from "./useTripReportsExplorer";

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
  const [band, setBand] = useState<BandKey>("added");
  const bandTabRefs = useRef<Record<BandKey, HTMLButtonElement | null>>({
    added: null,
    featured: null,
  });
  const {
    authorCount,
    clearNarrowing,
    columnGate,
    featured,
    handleQueryChange,
    handleSortChange,
    handleSubstanceChange,
    handleViewModeChange,
    isNarrowed,
    oneColumn,
    panelRef,
    query,
    recentlyAdded,
    reportHref,
    searchInputRef,
    setShelfOverrides,
    shelfColumns,
    shelfOverrides,
    sort,
    substanceFilter,
    substanceOptions,
    viewMode,
    visibleReports,
  } = useTripReportsExplorer(reports, initialView, reportHrefPrefix);
  const bandTabs = featured.length > 0 ? BAND_TABS : BAND_TABS.slice(0, 1);
  const activeBand = featured.length > 0 ? band : "added";
  const bandReports = activeBand === "featured" ? featured : recentlyAdded;

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

