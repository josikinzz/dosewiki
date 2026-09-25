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
/** From xl the inspector is the frame's third column; under it, a sheet. */
const DRAWER_COLUMN_MEDIA = "(min-width: 1280px)";

type CorpusPayload = { rows: StudioRow[]; effects: StudioEffectOption[] };
type LoadState =
  | { status: "loading" }
  | { status: "ready" }
  | { status: "error"; message: string };
type Feedback = { tone: ActionNoticeTone; message: string };
/** Showcases are curated per drug article, or reviewed per replication. */
export type ShowcaseMode = "drug" | "replication";

let cachedCorpus: CorpusPayload | null = null;

/** The editorial fields as loaded: the compare-and-swap guard every save sends. */
function expectedOf(row: StudioRow) {
  return {
    title: row.title,
    artist: row.artist,
    role: row.role,
    effect_slug: row.effect_slug,
    credit_line: row.credit_line,
    effect_tags: row.effect_tags,
    rights_status: row.rights_status ?? null,
    source_url: row.source_url ?? null,
  };
}

type BulkConflict = {
  id: string;
  slug: string | null;
  reason: string;
  code?: "stale" | "missing" | "incomplete" | "invalid";
};
type BulkResult = { updated: number; published?: string[]; conflicts?: BulkConflict[] };

/** One notice for a bulk result: what was written, what moved, what was refused. */
function bulkOutcome(edit: BulkEdit, total: number, payload: BulkResult): Feedback {
  const conflicts = payload.conflicts ?? [];
  const publishing = edit.publish === true;
  const done = publishing ? (payload.published ?? []).length : payload.updated;
  if (conflicts.length === 0) {
    return publishing
      ? {
          tone: "success",
          message: `Published ${done} ${done === 1 ? "work" : "works"}. ${done === 1 ? "It is" : "They are"} live on the public site.`,
        }
      : { tone: "success", message: `Updated ${payload.updated} rows.` };
  }
  const moved = conflicts.filter((conflict) => (conflict.code ?? "stale") === "stale" || conflict.code === "missing");
  const refused = conflicts.filter((conflict) => conflict.code === "incomplete" || conflict.code === "invalid");
  const parts = [`${publishing ? "Published" : "Updated"} ${done} of ${total}.`];
  if (moved.length > 0) {
    parts.push(
      `Not written because someone changed or removed them after you loaded the studio: ${moved.map((conflict) => conflict.slug ?? conflict.id).join(", ")}. ` +
        "The library now shows their current values; apply again if the change still fits.",
    );
  }
  if (refused.length > 0) {
    parts.push(
      `Not written: ${refused.map((conflict) => `${conflict.slug ?? conflict.id} (${conflict.reason})`).join("; ")}.`,
    );
  }
  return { tone: "warning", message: parts.join(" ") };
}

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
  // Where a keyboard range starts: the last card chosen without Shift. The
  // anchor moves with every arrow; this stays put so Shift+arrows span it.
  const [rangeStart, setRangeStart] = useState<string | null>(null);
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
  // The inspector's draft is unsaved work: anything that would swap its
  // subject (a click, an arrow, Esc, a workspace change) waits on a discard.
  const [editorDirty, setEditorDirty] = useState(false);
  const [pendingDiscard, setPendingDiscard] = useState<{ run: () => void } | null>(null);
  const [showcaseMode, setShowcaseMode] = useState<ShowcaseMode>("drug");
  const [placementRowId, setPlacementRowId] = useState<string | null>(null);
  const railInColumn = useMediaMatch(RAIL_COLUMN_MEDIA);
  const drawerInColumn = useMediaMatch(DRAWER_COLUMN_MEDIA);
  const searchRef = useRef<HTMLInputElement>(null);
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

  /** Runs `change` now, or once the editor confirms throwing its draft away. */
  const guardDraft = useCallback(
    (change: () => void) => {
      if (editorDirty) setPendingDiscard({ run: change });
      else change();
    },
    [editorDirty],
  );
  const confirmDiscard = useCallback(() => {
    const pending = pendingDiscard;
    setPendingDiscard(null);
    setEditorDirty(false);
    pending?.run();
  }, [pendingDiscard]);

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

  const resetSelection = useCallback(() => {
    setSelection(new Set());
    setAnchor(null);
    setRangeStart(null);
  }, []);
  const clearSelection = useCallback(() => guardDraft(resetSelection), [guardDraft, resetSelection]);

  const inspectRow = useCallback(
    (slug: string) => {
      const row = rows.find((entry) => entry.slug === slug);
      if (!row) {
        setFeedback({ tone: "danger", message: `No corpus row is named ${slug}.` });
        return;
      }
      guardDraft(() => {
        setSelection(new Set([row.id]));
        setAnchor(row.id);
        setRangeStart(row.id);
      });
    },
    [guardDraft, rows],
  );

  const onCardActivate = useCallback(
    (event: ReactMouseEvent, id: string) => {
      const next = new Set(selection);
      const start = rangeStart && visibleIds.includes(rangeStart) ? rangeStart : anchor;
      if (event.shiftKey && start && visibleIds.includes(start)) {
        const from = visibleIds.indexOf(start);
        const to = visibleIds.indexOf(id);
        const [low, high] = from < to ? [from, to] : [to, from];
        if (!(event.ctrlKey || event.metaKey)) next.clear();
        for (let index = low; index <= high; index += 1) next.add(visibleIds[index]);
      } else if (event.ctrlKey || event.metaKey) {
        if (next.has(id)) next.delete(id);
        else next.add(id);
      } else {
        const onlyThis = next.size === 1 && next.has(id);
        next.clear();
        if (!onlyThis) next.add(id);
      }
      const unchanged = next.size === selection.size && [...next].every((entry) => selection.has(entry));
      const moveAnchor = () => {
        if (event.shiftKey) return;
        setAnchor(id);
        setRangeStart(id);
      };
      if (unchanged) {
        moveAnchor();
        return;
      }
      guardDraft(() => {
        setSelection(next);
        moveAnchor();
      });
    },
    [anchor, guardDraft, rangeStart, selection, visibleIds],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        Boolean(target) &&
        (/^(INPUT|TEXTAREA|SELECT)$/.test(target?.tagName ?? "") || Boolean(target?.isContentEditable));
      // Selection keys belong to the grid. With focus on a control anywhere
      // else (an inspector button, a dialog, the rail) they keep their native
      // meaning, so an arrow never swaps the subject out from under a form.
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
        if (selection.size > 0 && (onPage || inGrid || inInspector)) {
          // Handled: shell keyboard handlers skip events with defaultPrevented.
          event.preventDefault();
          clearSelection();
        }
        return;
      }
      if (!(onPage || inGrid) || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
        return;
      }
      if (visibleIds.length === 0) return;
      event.preventDefault();
      // The grid's column count follows its width, so a fixed step would
      // move diagonally at some widths; the grid reports its own count.
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
      // Shift+arrow spans from where the range started to the new anchor, so
      // stepping back shrinks the range instead of adding one more card.
      const start = rangeStart && visibleIds.includes(rangeStart) ? rangeStart : anchor;
      let next: Set<string>;
      if (event.shiftKey && start && visibleIds.includes(start)) {
        const from = visibleIds.indexOf(start);
        const [low, high] = from < nextIndex ? [from, nextIndex] : [nextIndex, from];
        next = new Set(visibleIds.slice(low, high + 1));
      } else {
        next = new Set([id]);
      }
      guardDraft(() => {
        setSelection(next);
        setAnchor(id);
        if (!event.shiftKey || !start) setRangeStart(id);
      });
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [anchor, clearSelection, focusSearch, guardDraft, rangeStart, selection.size, visibleIds]);

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
            expected: expectedOf(row),
            updates: {
              title: draft.title.trim(),
              artist: draft.artist.trim(),
              role: draft.role,
              effect_slug: draft.effect_slug,
              credit_line: draft.credit_line?.trim() ? draft.credit_line.trim() : null,
              effect_tags: draft.effect_tags,
              rights_status: draft.rights_status ?? null,
              source_url: draft.source_url?.trim() ? draft.source_url.trim() : null,
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

  /**
   * Applies one bulk edit. Each row carries the values it was loaded with; the
   * server writes the rows that still match and names the rest. Resolves true
   * when the request went through, so the inspector can spend its draft.
   */
  const applyBulk = useCallback(
    async (targets: readonly StudioRow[], edit: BulkEdit): Promise<boolean> => {
      setBusy(true);
      setFeedback(null);
      try {
        const response = await fetch(EDITORIAL_API, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "bulk",
            items: targets.map((row) => ({ id: row.id, expected: expectedOf(row) })),
            patch: edit,
          }),
        });
        if (!response.ok && response.status !== 409) {
          setFeedback({ tone: "danger", message: await readError(response, "Bulk edit failed.") });
          return false;
        }
        const payload = (await response.json()) as BulkResult;
        setFeedback(bulkOutcome(edit, targets.length, payload));
        await loadCorpus();
        return true;
      } catch {
        setFeedback({
          tone: "danger",
          message: "Bulk edit failed: the editor endpoint is unreachable.",
        });
        return false;
      } finally {
        setBusy(false);
      }
    },
    [loadCorpus],
  );

  /** Publishes unpublished works whose rights status and source are set. */
  const publishRows = useCallback(
    (targets: readonly StudioRow[]) => applyBulk(targets, { publish: true }),
    [applyBulk],
  );

  const markSelectionAsFigure = useCallback(() => {
    void applyBulk(selectedRows, { role: "figure" });
  }, [applyBulk, selectedRows]);

  // A freshly uploaded work becomes the selection once the reloaded corpus
  // lists it; the grid scrolls its anchor into view. An open draft wins: the
  // new work is not worth a discard prompt nobody asked for.
  const [revealSlug, setRevealSlug] = useState<string | null>(null);
  useEffect(() => {
    if (!revealSlug) return;
    const row = rows.find((entry) => entry.slug === revealSlug);
    if (!row) return;
    setRevealSlug(null);
    if (editorDirty) return;
    setSelection(new Set([row.id]));
    setAnchor(row.id);
    setRangeStart(row.id);
  }, [editorDirty, revealSlug, rows]);

  const incoming = useReplicationIncoming({
    rows,
    loadCorpus,
    setFeedback,
    readError,
    onUploaded: setRevealSlug,
  });

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
    (slug: string) => {
      setShowcaseMode("drug");
      router.push(`/dev/replications/${slug}`);
    },
    [router],
  );
  /** Opens Showcases on one replication's drug-article placements. */
  const openPlacement = useCallback(
    (id: string) =>
      guardDraft(() => {
        setPlacementRowId(id);
        setShowcaseMode("replication");
        setActivePanel("substances");
      }),
    [guardDraft],
  );
  const placementRow = useMemo(
    () => rows.find((row) => row.id === placementRowId) ?? null,
    [placementRowId, rows],
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
    editorDirty,
    galleryDirty,
    pendingDiscard,
    showcaseMode,
    placementRow,
    setEditorDirty,
    setPendingDiscard,
    setShowcaseMode,
    setPlacementRowId,
    guardDraft,
    confirmDiscard,
    openPlacement,
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
    publishRows,
    markSelectionAsFigure,
    toggleFacet,
  };
}
