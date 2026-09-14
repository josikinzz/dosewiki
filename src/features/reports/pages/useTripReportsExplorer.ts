"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useResponsiveColumnCount } from "@/hooks/useResponsiveColumnCount";
import type { ReportCardModel, ReportViewMode } from "@/types/tripReport";
import { publicHref } from "@/utils/publicHref";
import { reportsIndexViewPath } from "@/utils/indexViewRoutes";
import { replaceCurrentIndexViewPath } from "@/utils/navigation";
import {
  foldSparseGroups,
  groupTripReports,
  selectFeaturedReports,
  selectRecentlyAddedReports,
  type TripReportGroup,
} from "../domain/tripReportIndex";
import { DEFAULT_SORT_ID, SORT_OPTIONS } from "./TripReportsControls";

const OPEN_SHELF_MAX_REPORTS = 24;
const BAND_LIMIT = 5;

export function useTripReportsExplorer(
  reports: ReportCardModel[],
  initialView: ReportViewMode,
  reportHrefPrefix?: string,
) {
  const [viewMode, setViewMode] = useState<ReportViewMode>(initialView);
  const [sortId, setSortId] = useState(DEFAULT_SORT_ID);
  const [substanceFilter, setSubstanceFilter] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [shelfOverrides, setShelfOverrides] = useState<Record<string, boolean>>({});
  const { count: columnCount, gate: columnGate, ref: panelRef } = useResponsiveColumnCount();
  const oneColumn = columnCount === 1;
  const sort = SORT_OPTIONS.find((option) => option.id === sortId) ?? SORT_OPTIONS[0];

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const nextSubstance = params.get("substance");
    const nextQuery = params.get("q");
    const nextSort = params.get("sort");
    if (nextSubstance) setSubstanceFilter(nextSubstance);
    if (nextQuery) {
      setQuery(nextQuery);
      if (searchInputRef.current) searchInputRef.current.value = nextQuery;
    }
    if (nextSort && SORT_OPTIONS.some((option) => option.id === nextSort)) setSortId(nextSort);
  }, []);

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

  const authorCount = useMemo(() => new Set(reports.map((report) => report.subject.name)).size, [reports]);
  const visibleReports = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!substanceFilter && !needle) return reports;
    return reports.filter((report) => {
      if (substanceFilter && !report.substances.some((substance) => substance.name.trim() === substanceFilter)) return false;
      if (!needle) return true;
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
      if (column < columns.length - 1 && filled >= target * (column + 1)) column += 1;
      columns[column].push(group);
      filled += weightOf(group);
    }
    return columns.filter((entries) => entries.length > 0);
  }, [groupedReports, columnCount, oneColumn]);

  const recentlyAdded = useMemo(() => selectRecentlyAddedReports(reports, BAND_LIMIT), [reports]);
  const featured = useMemo(() => selectFeaturedReports(reports, BAND_LIMIT), [reports]);
  const reportHref = (slug: string) => reportHrefPrefix ? `${reportHrefPrefix}${slug}` : publicHref.report(slug);
  const isNarrowed = substanceFilter !== null || query.trim().length > 0;

  const writeUrlState = (next: { view?: ReportViewMode; substance?: string | null; sortId?: string; query?: string }) => {
    const params = new URLSearchParams();
    const nextSubstance = next.substance === undefined ? substanceFilter : next.substance;
    const nextQuery = next.query === undefined ? query : next.query;
    const nextSortId = next.sortId ?? sortId;
    if (nextSubstance) params.set("substance", nextSubstance);
    if (nextQuery.trim()) params.set("q", nextQuery.trim());
    if (nextSortId !== DEFAULT_SORT_ID) params.set("sort", nextSortId);
    replaceCurrentIndexViewPath(reportsIndexViewPath(next.view ?? viewMode), params.toString());
  };

  const handleViewModeChange = (mode: ReportViewMode) => {
    if (viewMode === mode) return;
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
    if (searchInputRef.current) searchInputRef.current.value = "";
    writeUrlState({ substance: null, query: "" });
  };

  return {
    authorCount, clearNarrowing, columnGate, featured, handleQueryChange,
    handleSortChange, handleSubstanceChange, handleViewModeChange, isNarrowed,
    oneColumn, panelRef, query, recentlyAdded, reportHref, searchInputRef,
    setShelfOverrides, shelfColumns, shelfOverrides, sort, substanceFilter,
    substanceOptions, viewMode, visibleReports,
  };
}

export { OPEN_SHELF_MAX_REPORTS };
