"use client";

import { useEffect, useRef, useState } from "react";

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
import type { ReportViewMode } from "@/types/tripReport";
import type { PublicRouteEmptyState } from "@server/next/publicRouteOutcomes";
import { REPORTS_INDEX_DEFAULT_VIEW, type ReportsIndexView } from "@/utils/indexViewRoutes";
import { TripReportCard } from "../components/TripReportCard";
import { SortMenu, SubstanceFilterControl } from "./TripReportsControls";
import { ReportShelf, SubmitReportTile } from "./TripReportsPresentation";
import {
  OPEN_SHELF_MAX_REPORTS,
  useTripReportsExplorer,
} from "./useTripReportsExplorer";
import type { ReportBrowsePage } from "../domain/reportBrowsePage";

interface TripReportsExplorerProps {
  browsingPage: ReportBrowsePage;
  locale?: string;
  reportHrefPrefix?: string;
  emptyState?: PublicRouteEmptyState;
  initialView?: ReportsIndexView;
}

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
  browsingPage,
  locale,
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
  const resultsRef = useRef<HTMLDivElement>(null);
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
    total, filteredTotal, nextCursor, loading, failed, loadMore, retry, restart,
  } = useTripReportsExplorer(browsingPage, initialView, reportHrefPrefix, locale);
  const bandTabs = featured.length > 0 ? BAND_TABS : BAND_TABS.slice(0, 1);
  const activeBand = featured.length > 0 ? band : "added";
  const bandReports = activeBand === "featured" ? featured : recentlyAdded;
  const previousReports = useRef(visibleReports);

  useEffect(() => {
    const results = resultsRef.current;
    if (!results) return;
    results.style.minHeight = loading ? `${results.offsetHeight}px` : "";
  }, [loading]);

  useEffect(() => {
    const previous = previousReports.current;
    previousReports.current = visibleReports;
    const results = resultsRef.current;
    if (!results || previous === visibleReports || typeof results.animate !== "function") return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reducedMotion.matches) return;

    const current = new Set(visibleReports);
    const appended = previous.length > 0 && previous.every((report) => current.has(report));
    const previousSlugs = new Set(previous.map((report) => report.slug));
    const targets = appended
      ? Array.from(results.querySelectorAll<HTMLElement>("[data-report-slug]"))
          .filter((row) => !previousSlugs.has(row.dataset.reportSlug ?? ""))
      : [results];
    const animations = targets.map((target) => target.animate(
      [{ opacity: 0, transform: "translateY(2px)" }, { opacity: 1, transform: "translateY(0)" }],
      { duration: 180, easing: "cubic-bezier(0.25, 1, 0.5, 1)" },
    ));
    const cancel = () => animations.forEach((animation) => animation.cancel());
    reducedMotion.addEventListener("change", cancel);
    return () => {
      cancel();
      reducedMotion.removeEventListener("change", cancel);
    };
  }, [visibleReports]);

  if (total === 0) {
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
                className={cn(CONTROL_TRIGGER_CLASS, "group/report-control transition-colors duration-160 data-[state=open]:bg-dose-surface-muted motion-reduce:transition-none md:w-[8.5rem] md:[@media(pointer:coarse)]:w-[8.5rem]")}
                aria-label={t("Group by: {{mode}}", { mode: t(MODE_LABEL[viewMode]) })}
                title={t("Group by: {{mode}}", { mode: t(MODE_LABEL[viewMode]) })}
              >
                <Icon icon={MODE_ICON[viewMode]} className="h-4 w-4 shrink-0" aria-hidden />
                <span className={cn(CONTROL_TRIGGER_LABEL_CLASS, "min-w-0 flex-1 truncate")}>{t(MODE_LABEL[viewMode])}</span>
                <Icon
                  icon="lucide:chevron-down"
                  className={cn(CONTROL_TRIGGER_CHEVRON_CLASS, "transition-transform duration-160 group-data-[state=open]/report-control:rotate-180 motion-reduce:transition-none")}
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
                    className={cn(CONTROL_MENU_ITEM_CLASS, "transition-colors duration-160 data-[state=checked]:bg-dose-surface-muted data-[state=checked]:text-dose-accent-strong motion-reduce:transition-none")}
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
              inputSize="default"
              defaultValue=""
              onChange={(event) => handleQueryChange(event.target.value)}
              placeholder={t("Search reports…")}
              aria-label={t("Search these reports")}
              className="h-10 pl-9 pr-11 [@media(pointer:coarse)]:h-11 md:h-9"
            />
            {query ? (
              <Button
                type="button"
                variant="ghost"
                size="auto"
                aria-label={t("Clear search")}
                className="theme-feedback-enter absolute right-0 top-1/2 h-9 w-9 -translate-y-1/2 p-0 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11"
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

      <p
        role="status"
        className="theme-text-faint mx-auto mb-5 min-h-4 w-full max-w-4xl px-1 text-xs tabular-nums"
      >
        {isNarrowed
          ? t("{{visible}} of {{total}} reports", {
              visible: filteredTotal,
              total,
            })
          : ""}
      </p>

      {isNarrowed ? null : (
        <section aria-labelledby="reports-band-heading" className="mx-auto mb-8 w-full max-w-4xl">
          <h2 id="reports-band-heading" className="sr-only">
            {t("Report highlights")}
          </h2>
          <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
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
                      "min-h-9 rounded-full px-3 text-xs font-semibold uppercase tracking-[0.1em] transition-colors duration-160 motion-reduce:transition-none [@media(pointer:coarse)]:min-h-11",
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
                reports: total,
                substances: substanceOptions.length,
                authors: authorCount,
              })}
            </p>
          </div>
          <div
            key={activeBand}
            role="tabpanel"
            id="reports-band-panel"
            aria-labelledby={`reports-band-tab-${activeBand}`}
            className="theme-tab-panel-enter grid min-h-[13.25rem] gap-2 sm:min-h-[8.75rem] sm:grid-cols-2 lg:min-h-[4.25rem] lg:grid-cols-3"
          >
            {bandReports.map((report) => (
              <TripReportCard
                key={report.slug}
                report={report}
                href={reportHref(report.slug)}
                density="compact"
                showFeatured={false}
              />
            ))}
            <SubmitReportTile />
          </div>
        </section>
      )}

      <div ref={resultsRef} aria-busy={loading}>
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
      </div>
      <div className="mx-auto mt-6 flex min-h-28 max-w-4xl flex-col items-center gap-3" aria-live="polite">
        <p role="status" className="min-h-5 text-sm">
          {loading ? <span className="theme-feedback-enter">{t("Loading reports…")}</span> : null}
        </p>
        {failed ? <div role="alert" className="theme-feedback-enter text-center"><p>{t("Unable to load reports.")}</p><Button variant="pill" onClick={retry}>{t("Retry")}</Button><Button variant="quiet" onClick={restart}>{t("Restart browsing")}</Button></div> : null}
        {nextCursor ? <Button variant="pill" size="pill" disabled={loading || failed} onClick={loadMore}>{t("Load more reports")}</Button> : null}
      </div>
    </>
  );
}
