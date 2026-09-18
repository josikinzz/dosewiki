"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useResponsiveColumnCount } from "@/hooks/useResponsiveColumnCount";
import type { ReportCardModel, ReportViewMode } from "@/types/tripReport";
import { publicHref } from "@/utils/publicHref";
import { reportsIndexViewPath } from "@/utils/indexViewRoutes";
import { replaceCurrentIndexViewPath } from "@/utils/navigation";
import type { TripReportGroup } from "../domain/tripReportIndex";
import { DEFAULT_SORT_ID, SORT_OPTIONS, type ReportBrowsePage } from "../domain/reportBrowsePage";

const OPEN_SHELF_MAX_REPORTS = 24;

export function useTripReportsExplorer(initialPage: ReportBrowsePage, initialView: ReportViewMode, reportHrefPrefix?: string, locale?: string) {
  const [page, setPage] = useState(initialPage);
  const [viewMode, setViewMode] = useState<ReportViewMode>(initialView);
  const [sortId, setSortId] = useState(DEFAULT_SORT_ID);
  const [substanceFilter, setSubstanceFilter] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const initialRequest = useRef(true);
  const loadedSelection = useRef(JSON.stringify([initialView, DEFAULT_SORT_ID, null, ""]));
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [shelfOverrides, setShelfOverrides] = useState<Record<string, boolean>>({});
  const { count: columnCount, gate: columnGate, ref: panelRef } = useResponsiveColumnCount();
  const oneColumn = columnCount === 1;
  const sort = SORT_OPTIONS.find((option) => option.id === sortId) ?? SORT_OPTIONS[0];

  useEffect(() => {
    const restore = () => {
      const params = new URLSearchParams(window.location.search);
      setSubstanceFilter(params.get("substance"));
      setQuery(params.get("q") ?? "");
      if (searchInputRef.current) searchInputRef.current.value = params.get("q") ?? "";
      const nextSort = params.get("sort");
      setSortId(SORT_OPTIONS.some((option) => option.id === nextSort) ? nextSort! : DEFAULT_SORT_ID);
      setCursor(null);
    };
    restore();
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);

  useEffect(() => {
    if (initialRequest.current) {
      initialRequest.current = false;
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setFailed(false);
    const params = new URLSearchParams({ view: viewMode, sort: sortId });
    if (query.trim()) params.set("q", query.trim());
    if (substanceFilter) params.set("substance", substanceFilter);
    if (locale) params.set("locale", locale);
    if (cursor) params.set("cursor", cursor);
    const timer = window.setTimeout(() => {
      void fetch(`/api/reports?${params}`, { signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) throw new Error("Reports unavailable");
          const next: ReportBrowsePage = await response.json();
          if (controller.signal.aborted) return;
          loadedSelection.current = JSON.stringify([viewMode, sortId, substanceFilter, query]);
          setPage((current) => {
            if (!cursor) return next;
            const groups = current.groups.map((group) => ({ ...group, reports: [...group.reports] }));
            for (const group of next.groups) {
              const existing = groups.find((candidate) => candidate.anchor === group.anchor);
              if (existing) {
                const slugs = new Set(existing.reports.map((report) => report.slug));
                existing.reports.push(...group.reports.filter((report) => !slugs.has(report.slug)));
              } else groups.push(group);
            }
            return { ...next, groups };
          });
          setLoading(false);
        })
        .catch(() => { if (!controller.signal.aborted) { setFailed(true); setLoading(false); } });
    }, query.trim() && !cursor ? 200 : 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [viewMode, sortId, substanceFilter, query, cursor, locale, attempt]);

  useEffect(() => {
    const revealAnchor = () => {
      if (loading || failed || loadedSelection.current !== JSON.stringify([viewMode, sortId, substanceFilter, query])) return;
      const anchor = window.location.hash.slice(1);
      if (!anchor || !page.groupFacets.some((group) => group.anchor === anchor)) return;
      const target = document.getElementById(anchor);
      if (target) {
        setShelfOverrides((current) => current[anchor] ? current : { ...current, [anchor]: true });
        target.scrollIntoView({ block: "start" });
      } else if (page.nextCursor) {
        setCursor(page.nextCursor);
      }
    };
    revealAnchor();
    window.addEventListener("hashchange", revealAnchor);
    return () => window.removeEventListener("hashchange", revealAnchor);
  }, [page, loading, failed, viewMode, sortId, substanceFilter, query]);

  const shelfColumns = useMemo(() => {
    const columns: TripReportGroup<ReportCardModel>[][] = Array.from({ length: Math.max(columnCount, 1) }, () => []);
    const weightOf = (group: TripReportGroup<ReportCardModel>) => 1 + (group.reports.length <= OPEN_SHELF_MAX_REPORTS && !oneColumn ? group.reports.length : 0);
    const target = page.groups.reduce((sum, group) => sum + weightOf(group), 0) / columns.length;
    let column = 0;
    let filled = 0;
    for (const group of page.groups) {
      if (column < columns.length - 1 && filled >= target * (column + 1)) column += 1;
      columns[column].push(group);
      filled += weightOf(group);
    }
    return columns.filter((entries) => entries.length > 0);
  }, [page.groups, columnCount, oneColumn]);
  const visibleReports = useMemo(() => page.groups.flatMap((group) => group.reports), [page.groups]);
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
    setCursor(null);
  };
  const handleViewModeChange = (mode: ReportViewMode) => { setViewMode(mode); writeUrlState({ view: mode }); };
  const handleSortChange = (nextSortId: string) => { setSortId(nextSortId); writeUrlState({ sortId: nextSortId }); };
  const handleQueryChange = (nextQuery: string) => { setQuery(nextQuery); writeUrlState({ query: nextQuery }); };
  const handleSubstanceChange = (nextSubstance: string | null) => { setSubstanceFilter(nextSubstance); writeUrlState({ substance: nextSubstance }); };
  const clearNarrowing = () => {
    setSubstanceFilter(null);
    setQuery("");
    if (searchInputRef.current) searchInputRef.current.value = "";
    writeUrlState({ substance: null, query: "" });
  };
  return {
    authorCount: page.authorCount, clearNarrowing, columnGate, featured: page.featured,
    handleQueryChange, handleSortChange, handleSubstanceChange, handleViewModeChange, isNarrowed,
    oneColumn, panelRef, query, recentlyAdded: page.recentlyAdded, reportHref, searchInputRef,
    setShelfOverrides, shelfColumns, shelfOverrides, sort, substanceFilter,
    substanceOptions: page.substanceOptions, viewMode, visibleReports,
    total: page.total, filteredTotal: page.filteredTotal, nextCursor: page.nextCursor,
    loading, failed, loadMore: () => setCursor(page.nextCursor), retry: () => setAttempt((value) => value + 1),
    restart: () => { setCursor(null); setAttempt((value) => value + 1); },
  };
}

export { OPEN_SHELF_MAX_REPORTS };
