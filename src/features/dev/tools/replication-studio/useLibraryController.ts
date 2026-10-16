"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  ReplicationGridHandle,
  StudioGridDensity,
  StudioGridView,
} from "./ReplicationGrid";
import { readLibraryView, writeLibraryView } from "./libraryViewUrl";
import {
  EMPTY_STUDIO_FACETS,
  NO_EFFECT_KEY,
  activeFacetCount,
  filterStudioRows,
  groupStudioRows,
  toggleFacetValue,
  type StudioFacetKind,
  type StudioGroupBy,
  type StudioRow,
} from "./replicationStudioModel";
import type { ReplicationSelection } from "./useReplicationSelection";

const RAIL_COLUMN_MEDIA = "(min-width: 1024px)";
const DRAWER_COLUMN_MEDIA = "(min-width: 1280px)";

function initialView() {
  return readLibraryView(typeof window === "undefined" ? "" : window.location.search);
}

export function useLibraryController({
  rows,
  effectNames,
}: {
  rows: readonly StudioRow[];
  effectNames: ReadonlyMap<string, string>;
}) {
  const [initial] = useState(initialView);
  const [query, setQuery] = useState(initial.query);
  const [group, setGroup] = useState<StudioGroupBy>(initial.group);
  const [facets, setFacets] = useState(initial.facets);
  const [view, setView] = useState<StudioGridView>(initial.view);
  const [density, setDensity] = useState<StudioGridDensity>(initial.density);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const gridRef = useRef<ReplicationGridHandle>(null);

  useEffect(() => {
    const url = new URL(window.location.href);
    const search = writeLibraryView(url.searchParams, { query, group, facets, view, density }).toString();
    const next = `${url.pathname}${search ? `?${search}` : ""}${url.hash}`;
    if (next === `${url.pathname}${url.search}${url.hash}`) return;
    window.history.replaceState(window.history.state, "", next);
  }, [query, group, facets, view, density]);

  const visibleRows = useMemo(
    () => filterStudioRows(rows, { query, group, facets }),
    [rows, query, group, facets],
  );
  const groups = useMemo(() => groupStudioRows(visibleRows, group), [visibleRows, group]);
  const visibleIds = useMemo(
    () => groups.flatMap((entry) => entry.rows.map((row) => row.id)),
    [groups],
  );

  const chips = useMemo(() => {
    const entries: { kind: StudioFacetKind; key: string; label: string }[] = [];
    for (const key of facets.type) entries.push({ kind: "type", key, label: `Type: ${key}` });
    for (const key of facets.role) entries.push({ kind: "role", key, label: `Role: ${key}` });
    for (const key of facets.artist) entries.push({ kind: "artist", key, label: `Artist: ${key}` });
    for (const key of facets.effect) {
      entries.push({
        kind: "effect",
        key,
        label: `Effect: ${key === NO_EFFECT_KEY ? "No effect" : effectNames.get(key) ?? key}`,
      });
    }
    return entries;
  }, [facets, effectNames]);

  const toggleFacet = useCallback(
    (kind: StudioFacetKind, key: string) =>
      setFacets((current) => toggleFacetValue(current, kind, key)),
    [],
  );
  const clearFilters = useCallback(() => {
    setFacets(EMPTY_STUDIO_FACETS);
    setQuery("");
  }, []);

  return {
    query,
    setQuery,
    group,
    setGroup,
    facets,
    toggleFacet,
    clearFilters,
    chips,
    filterCount: activeFacetCount(facets) + (query.trim() ? 1 : 0),
    view,
    setView,
    density,
    setDensity,
    visibleRows,
    groups,
    visibleIds,
    filtersOpen,
    setFiltersOpen,
    searchRef,
    gridRef,
  };
}

export type LibraryController = ReturnType<typeof useLibraryController>;

export function useLibraryKeys(library: LibraryController, selection: ReplicationSelection) {
  const { searchRef, gridRef, setFiltersOpen, visibleIds } = library;
  const { clearSelection, step } = selection;
  const selectionSize = selection.selection.size;

  const focusSearch = useCallback(() => {
    const input = searchRef.current;
    if (!input) {
      setFiltersOpen(true);
      return;
    }
    input.focus();
    input.select();
  }, [searchRef, setFiltersOpen]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        Boolean(target) &&
        (/^(INPUT|TEXTAREA|SELECT)$/.test(target?.tagName ?? "") || Boolean(target?.isContentEditable));
      const onPage = !target || target === document.body || target === document.documentElement;
      const inGrid = Boolean(target?.closest?.("[data-studio-grid]"));
      const inInspector = Boolean(target?.closest?.("[data-studio-inspector]"));
      if (event.defaultPrevented) return;
      if (event.key === "/" && !typing) {
        event.preventDefault();
        focusSearch();
        return;
      }
      if (event.key === "Escape") {
        if (typing) {
          target?.blur();
          return;
        }
        if (selectionSize > 0 && (onPage || inGrid || inInspector)) {
          event.preventDefault();
          clearSelection();
        }
        return;
      }
      if (
        !(onPage || inGrid) ||
        !(event.key === "ArrowLeft" || event.key === "ArrowRight" || event.key === "ArrowUp" || event.key === "ArrowDown")
      ) {
        return;
      }
      if (visibleIds.length === 0) return;
      event.preventDefault();
      step({ key: event.key, shift: event.shiftKey, perRow: gridRef.current?.columns ?? 1 });
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [clearSelection, focusSearch, gridRef, selectionSize, step, visibleIds]);
}

function useMediaMatch(media: string) {
  const [matches, setMatches] = useState(true);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const query = window.matchMedia(media);
    const update = () => setMatches(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, [media]);
  return matches;
}

export function useLibraryLayout(hasSelection: boolean) {
  const railInColumn = useMediaMatch(RAIL_COLUMN_MEDIA);
  const drawerInColumn = useMediaMatch(DRAWER_COLUMN_MEDIA);
  const [inspectorPinned, setInspectorPinned] = useState(true);
  return {
    railInColumn,
    drawerInColumn,
    inspectorPinned,
    toggleInspectorPinned: () => setInspectorPinned((pinned) => !pinned),
    inspectorColumn: (drawerInColumn && (inspectorPinned || hasSelection)) || (railInColumn && hasSelection),
    railColumn: railInColumn && (drawerInColumn || !hasSelection),
  };
}
