"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { useRouter } from "next/navigation";

import type {
  ActionNoticeTone,
  EditorActionStatusState,
} from "@/features/dev/components";
import type { OrderablePanelItem } from "@/features/dev/tools/contributors/OrderingPanel";

import type { BulkEdit, SingleEditDraft } from "./ReplicationEditorDrawer";
import type { ReplicationGridHandle } from "./ReplicationGrid";
import { readReplicationApiError as readError } from "./replicationStudioApi";
import {
  EMPTY_STUDIO_FACETS,
  NO_EFFECT_KEY,
  activeFacetCount,
  filterStudioRows,
  groupStudioRows,
  toggleFacetValue,
  type StudioEffectOption,
  type StudioFacetKind,
  type StudioFacets,
  type StudioGroupBy,
  type StudioRow,
} from "./replicationStudioModel";
import { useReplicationIncoming } from "./useReplicationIncoming";

const CORPUS_API = "/api/dev/replications";
const EDITORIAL_API = "/api/dev/replications/editorial";
const FEATURED_API = "/api/dev/replications/featured";
const RAIL_COLUMN_MEDIA = "(min-width: 1024px)";
const DRAWER_COLUMN_MEDIA = "(min-width: 1280px)";

type CorpusPayload = { rows: StudioRow[]; effects: StudioEffectOption[] };
type LoadState =
  | { status: "loading" }
  | { status: "ready" }
  | { status: "error"; message: string };
type Feedback = { tone: ActionNoticeTone; message: string };

let cachedCorpus: CorpusPayload | null = null;

/**
 * Whether `media` matches. Starts true so the server render and jsdom take
 * the wide layout; the listener corrects it before first paint in a browser.
 */
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


export function useReplicationStudioController(initialSubstanceSlug?: string) {
  const router = useRouter();
  const [load, setLoad] = useState<LoadState>(
    cachedCorpus ? { status: "ready" } : { status: "loading" },
  );
  const [rows, setRows] = useState<StudioRow[]>(() => cachedCorpus?.rows ?? []);
  const [effects, setEffects] = useState<StudioEffectOption[]>(() => cachedCorpus?.effects ?? []);
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<StudioGroupBy>("none");
  const [facets, setFacets] = useState<StudioFacets>(EMPTY_STUDIO_FACETS);
  const [selection, setSelection] = useState<Set<string>>(() => new Set());
  const [anchor, setAnchor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [activePanel, setActivePanel] = useState<"featured" | "playlists" | "substances" | null>(
    initialSubstanceSlug ? "substances" : null,
  );
  const [featuredOrder, setFeaturedOrder] = useState<string[]>([]);
  const [savedFeatured, setSavedFeatured] = useState<string[]>([]);
  const [featuredCurated, setFeaturedCurated] = useState(true);
  const [featuredLoaded, setFeaturedLoaded] = useState(false);
  const [featuredSaveState, setFeaturedSaveState] = useState<
    EditorActionStatusState | "idle"
  >("idle");
  const [galleryDirty, setGalleryDirty] = useState(false);
  const [pendingLeave, setPendingLeave] = useState<{
    next: "featured" | "playlists" | null;
  } | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const railInColumn = useMediaMatch(RAIL_COLUMN_MEDIA);
  const drawerInColumn = useMediaMatch(DRAWER_COLUMN_MEDIA);
  const searchRef = useRef<HTMLInputElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<ReplicationGridHandle>(null);

  useEffect(() => {
    if (initialSubstanceSlug) {
      setActivePanel("substances");
    }
  }, [initialSubstanceSlug]);


  const leaveSubstances = useCallback(
    (next: "featured" | "playlists" | null) => {
      setPendingLeave(null);
      setGalleryDirty(false);
      setActivePanel(next);
      if (next === null && initialSubstanceSlug) router.push("/dev/replications");
    },
    [initialSubstanceSlug, router],
  );

  const requestLeaveSubstances = useCallback(
    (next: "featured" | "playlists" | null) => {
      if (galleryDirty) {
        setPendingLeave({ next });
        return;
      }
      leaveSubstances(next);
    },
    [galleryDirty, leaveSubstances],
  );

  useEffect(() => {
    if (!galleryDirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [galleryDirty]);

  const focusSearch = useCallback(() => {
    const input = searchRef.current;
    if (!input) {
      setFiltersOpen(true);
      return;
    }
    input.focus();
    input.select();
  }, []);

  const loadCorpus = useCallback(async () => {
    if (!cachedCorpus) setLoad({ status: "loading" });
    try {
      const response = await fetch(CORPUS_API);
      if (!response.ok) {
        setLoad({
          status: "error",
          message: await readError(response, "Failed to load the corpus."),
        });
        return;
      }
      const payload = (await response.json()) as CorpusPayload;
      cachedCorpus = payload;
      setRows(payload.rows);
      setEffects(payload.effects);
      setLoad({ status: "ready" });
    } catch {
      setLoad({ status: "error", message: "Failed to reach the corpus endpoint." });
    }
  }, []);

  useEffect(() => {
    void loadCorpus();
  }, [loadCorpus]);

  const loadFeatured = useCallback(async () => {
    try {
      const response = await fetch(FEATURED_API);
      if (!response.ok) {
        setFeedback({
          tone: "danger",
          message: await readError(response, "Failed to load the featured selection."),
        });
        return;
      }
      const payload = (await response.json()) as { slugs: string[]; curated: boolean };
      setFeaturedOrder(payload.slugs);
      setSavedFeatured(payload.slugs);
      setFeaturedCurated(payload.curated);
      setFeaturedLoaded(true);
    } catch {
      setFeedback({ tone: "danger", message: "Failed to reach the featured endpoint." });
    }
  }, []);

  useEffect(() => {
    if (activePanel === "featured" && !featuredLoaded) void loadFeatured();
  }, [activePanel, featuredLoaded, loadFeatured]);

  const saveFeatured = useCallback(async () => {
    setFeaturedSaveState("saving");
    try {
      const response = await fetch(FEATURED_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slugs: featuredOrder }),
      });
      if (!response.ok) {
        setFeaturedSaveState("error");
        setFeedback({
          tone: "danger",
          message: await readError(response, "Saving the featured selection failed."),
        });
        return;
      }
      const payload = (await response.json()) as { slugs: string[]; pruned: string[] };
      setFeaturedOrder(payload.slugs);
      setSavedFeatured(payload.slugs);
      setFeaturedCurated(true);
      setFeaturedSaveState("saved");
      setFeedback({
        tone: "success",
        message:
          payload.pruned.length > 0
            ? `Featured ${payload.slugs.length} replications. Dropped ${payload.pruned.length} slug(s) that no longer resolve: ${payload.pruned.join(", ")}.`
            : `Featured ${payload.slugs.length} replications on the Effect Index homepage.`,
      });
    } catch {
      setFeaturedSaveState("error");
      setFeedback({
        tone: "danger",
        message: "Saving failed: the featured endpoint is unreachable.",
      });
    }
  }, [featuredOrder]);

  const effectNames = useMemo(
    () => new Map(effects.map((effect) => [effect.slug, effect.name])),
    [effects],
  );
  const artists = useMemo(
    () => [...new Set(rows.map((row) => row.artist))].sort((a, b) => a.localeCompare(b)),
    [rows],
  );
  const visibleRows = useMemo(
    () => filterStudioRows(rows, { query, group, facets }),
    [rows, query, group, facets],
  );
  const groups = useMemo(() => groupStudioRows(visibleRows, group), [visibleRows, group]);
  const visibleIds = useMemo(
    () => groups.flatMap((entry) => entry.rows.map((row) => row.id)),
    [groups],
  );
  const selectedRows = useMemo(
    () => rows.filter((row) => selection.has(row.id)),
    [rows, selection],
  );

  const clearSelection = useCallback(() => {
    setSelection(new Set());
    setAnchor(null);
  }, []);

  const inspectRow = useCallback(
    (slug: string) => {
      const row = rows.find((entry) => entry.slug === slug);
      if (!row) {
        setFeedback({ tone: "danger", message: `No corpus row is named ${slug}.` });
        return;
      }
      setSelection(new Set([row.id]));
      setAnchor(row.id);
    },
    [rows],
  );

  const onCardActivate = useCallback(
    (event: ReactMouseEvent, id: string) => {
      setSelection((current) => {
        const next = new Set(current);
        if (event.shiftKey && anchor && visibleIds.includes(anchor)) {
          const from = visibleIds.indexOf(anchor);
          const to = visibleIds.indexOf(id);
          const [low, high] = from < to ? [from, to] : [to, from];
          if (!(event.ctrlKey || event.metaKey)) next.clear();
          for (let index = low; index <= high; index += 1) next.add(visibleIds[index]);
          return next;
        }
        if (event.ctrlKey || event.metaKey) {
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        }
        const onlyThis = next.size === 1 && next.has(id);
        next.clear();
        if (!onlyThis) next.add(id);
        return next;
      });
      if (!event.shiftKey) setAnchor(id);
    },
    [anchor, visibleIds],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = Boolean(target) && /^(INPUT|TEXTAREA|SELECT)$/.test(target?.tagName ?? "");
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
        if (selection.size > 0) clearSelection();
        return;
      }
      if (typing || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
        return;
      }
      if (visibleIds.length === 0) return;
      event.preventDefault();
      // The grid is 2 to 4 columns depending on its width, so a fixed step
      // would move diagonally at some widths; the grid reports its own count.
      const perRow = gridRef.current?.columns ?? 1;
      const step =
        event.key === "ArrowRight"
          ? 1
          : event.key === "ArrowLeft"
            ? -1
            : event.key === "ArrowDown"
              ? perRow
              : -perRow;
      const current = anchor && visibleIds.includes(anchor) ? visibleIds.indexOf(anchor) : -1;
      const nextIndex =
        current === -1 ? 0 : Math.max(0, Math.min(visibleIds.length - 1, current + step));
      const id = visibleIds[nextIndex];
      setSelection((existing) => (event.shiftKey ? new Set([...existing, id]) : new Set([id])));
      setAnchor(id);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [anchor, clearSelection, focusSearch, selection.size, visibleIds]);

  const saveSingle = useCallback(
    async (row: StudioRow, draft: SingleEditDraft) => {
      setBusy(true);
      setFeedback(null);
      try {
        const response = await fetch(EDITORIAL_API, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "single",
            id: row.id,
            expected: {
              title: row.title,
              artist: row.artist,
              role: row.role,
              effect_slug: row.effect_slug,
              credit_line: row.credit_line,
              effect_tags: row.effect_tags,
            },
            updates: {
              title: draft.title.trim(),
              artist: draft.artist.trim(),
              role: draft.role,
              effect_slug: draft.effect_slug,
              credit_line: draft.credit_line?.trim() ? draft.credit_line.trim() : null,
              effect_tags: draft.effect_tags,
            },
          }),
        });
        if (!response.ok) {
          setFeedback({ tone: "danger", message: await readError(response, "Save failed.") });
          return;
        }
        setFeedback({ tone: "success", message: `Saved ${row.slug}.` });
        await loadCorpus();
      } catch {
        setFeedback({ tone: "danger", message: "Save failed: the editor endpoint is unreachable." });
      } finally {
        setBusy(false);
      }
    },
    [loadCorpus],
  );

  const applyBulk = useCallback(
    async (targets: readonly StudioRow[], edit: BulkEdit) => {
      setBusy(true);
      setFeedback(null);
      try {
        const response = await fetch(EDITORIAL_API, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "bulk", ids: targets.map((row) => row.id), ...edit }),
        });
        if (!response.ok) {
          setFeedback({ tone: "danger", message: await readError(response, "Bulk edit failed.") });
          return;
        }
        const payload = (await response.json()) as { updated: number };
        setFeedback({ tone: "success", message: `Updated ${payload.updated} rows.` });
        await loadCorpus();
      } catch {
        setFeedback({
          tone: "danger",
          message: "Bulk edit failed: the editor endpoint is unreachable.",
        });
      } finally {
        setBusy(false);
      }
    },
    [loadCorpus],
  );

  const markSelectionAsFigure = useCallback(() => {
    void applyBulk(selectedRows, { role: "figure" });
  }, [applyBulk, selectedRows]);

  const incoming = useReplicationIncoming({ rows, loadCorpus, setFeedback, readError });

  const featuredItems = useMemo<OrderablePanelItem[]>(() => {
    const bySlug = new Map(rows.map((row) => [row.slug, row]));
    const chosen = featuredOrder
      .map((slug) => bySlug.get(slug))
      .filter((row): row is StudioRow => Boolean(row));
    const listed = new Set<string>();
    return [...chosen, ...visibleRows]
      .filter((row) => {
        if (listed.has(row.slug)) return false;
        listed.add(row.slug);
        return true;
      })
      .map((row) => ({
        slug: row.slug,
        title: row.title,
        meta: [row.artist, row.effect_name ?? row.effect_slug ?? "no effect", row.type]
          .filter(Boolean)
          .join(" · "),
      }));
  }, [featuredOrder, rows, visibleRows]);

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
  const navigateToSubstance = useCallback(
    (slug: string) => router.push(`/dev/replications/${slug}`),
    [router],
  );
  const toggleFacet = useCallback(
    (kind: StudioFacetKind, key: string) =>
      setFacets((current) => toggleFacetValue(current, kind, key)),
    [],
  );


  return {
    load,
    rows,
    effects,
    query,
    group,
    facets,
    selection,
    anchor,
    busy,
    feedback,
    activePanel,
    featuredOrder,
    savedFeatured,
    featuredCurated,
    featuredLoaded,
    featuredSaveState,
    pendingLeave,
    filtersOpen,
    railInColumn,
    drawerInColumn,
    searchRef,
    drawerRef,
    gridRef,
    effectNames,
    artists,
    visibleRows,
    groups,
    selectedRows,
    featuredItems,
    chips,
    filterCount: activeFacetCount(facets) + (query.trim() ? 1 : 0),
    incoming,
    setQuery,
    setGroup,
    setFacets,
    setFeedback,
    setActivePanel,
    setFeaturedOrder,
    setFeaturedSaveState,
    setGalleryDirty,
    setPendingLeave,
    setFiltersOpen,
    requestLeaveSubstances,
    leaveSubstances,
    loadCorpus,
    saveFeatured,
    clearSelection,
    inspectRow,
    navigateToSubstance,
    onCardActivate,
    saveSingle,
    applyBulk,
    markSelectionAsFigure,
    toggleFacet,
  };
}
