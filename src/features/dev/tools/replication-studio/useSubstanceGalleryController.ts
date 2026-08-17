"use client";

import type { DragEndEvent } from "@dnd-kit/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  ActionNoticeTone,
  EditorActionStatusState,
} from "@/features/dev/components";
import { SHOWCASE_WORK_CAP } from "@/features/replications/components/showcaseModel";
import {
  fetchGalleryDetail,
  galleryCandidatesUrl,
  galleryDetailUrl,
  readGalleryApiError,
} from "./substanceGalleryApi";

import {
  applyBoardDrag,
  buildGalleryBoard,
  canRedo,
  canUndo,
  curateSlug,
  curationStateOf,
  curationStatesEqual,
  effectiveGalleryOrder,
  excludeSlug,
  historyOf,
  moveCuratedSlug,
  moveCuratedSlugToEdge,
  pushHistory,
  redoHistory,
  restoreSlug,
  summarizeProvenance,
  uncurateSlug,
  undoHistory,
  type CurationHistory,
  type GalleryCandidate,
  type GalleryConflict,
  type GalleryCurationState,
  type GalleryDetail,
} from "./substanceGalleryPortalModel";


let cachedCandidates: GalleryCandidate[] | null = null;

type Feedback = { tone: ActionNoticeTone; message: string };

export type GalleryDetailState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; detail: GalleryDetail };


type GalleryControllerProps = {
  substanceSlug: string | null;
  onNavigateToSubstance: (slug: string) => void;
  onDirtyChange: (dirty: boolean) => void;
};


export function useSubstanceGalleryController({
  substanceSlug,
  onNavigateToSubstance,
  onDirtyChange,
}: GalleryControllerProps) {
  const [candidates, setCandidates] = useState<GalleryCandidate[]>(() => cachedCandidates ?? []);
  const [candidatesLoaded, setCandidatesLoaded] = useState(cachedCandidates !== null);
  const [candidatesToken, setCandidatesToken] = useState(0);
  const [detailState, setDetailState] = useState<GalleryDetailState>({ status: "idle" });
  const [detailToken, setDetailToken] = useState(0);
  const [history, setHistory] = useState<CurationHistory>(() =>
    historyOf({ curated: [], removed: [] }),
  );
  const [savedCuration, setSavedCuration] = useState<GalleryCurationState>({
    curated: [],
    removed: [],
  });
  const [expectedUpdatedAt, setExpectedUpdatedAt] = useState<string | null>(null);
  const [savedBy, setSavedBy] = useState<string | null>(null);
  const [conflict, setConflict] = useState<GalleryConflict | null>(null);
  const [saveState, setSaveState] = useState<EditorActionStatusState | "idle">("idle");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [excludedOpen, setExcludedOpen] = useState(false);
  const [unmatchedOpen, setUnmatchedOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(true);
  const [pendingSlug, setPendingSlug] = useState<string | null>(null);
  const [focusSlug, setFocusSlug] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const curation = history.present;
  const isDirty = !curationStatesEqual(curation, savedCuration);
  const historyRef = useRef(history);
  historyRef.current = history;
  const dirtyRef = useRef(isDirty);
  dirtyRef.current = isDirty;

  useEffect(() => {
    if (cachedCandidates) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(galleryCandidatesUrl());
        if (!response.ok) {
          cachedCandidates = null;
          if (!cancelled) {
            setFeedback({
              tone: "danger",
              message: await readGalleryApiError(response, "Failed to load the substance list."),
            });
          }
          return;
        }
        const payload = (await response.json()) as { substances: GalleryCandidate[] };
        cachedCandidates = payload.substances;
        if (!cancelled) {
          setCandidates(payload.substances);
          setCandidatesLoaded(true);
        }
      } catch {
        cachedCandidates = null;
        if (!cancelled) {
          setFeedback({ tone: "danger", message: "Failed to reach the substance list endpoint." });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [candidatesToken]);


  useEffect(() => {
    if (!substanceSlug) {
      setDetailState({ status: "idle" });
      return;
    }
    let cancelled = false;
    setDetailState({ status: "loading" });
    setSaveState("idle");
    setFeedback(null);
    setConflict(null);
    setExcludedOpen(false);
    setUnmatchedOpen(false);
    void (async () => {
      const result = await fetchGalleryDetail(substanceSlug);
      if (cancelled) return;
      if (result.status === "error") {
        setDetailState({ status: "error", message: result.message });
        return;
      }
      const { detail } = result;
      const nextCuration = curationStateOf(detail.curation);
      setDetailState({ status: "ready", detail });
      setHistory(historyOf(nextCuration));
      setSavedCuration(curationStateOf(detail.curation));
      setExpectedUpdatedAt(detail.curation?.updated_at ?? null);
      setSavedBy(detail.curation?.updated_by ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [substanceSlug, detailToken]);

  useEffect(() => {
    onDirtyChange(isDirty);
  }, [isDirty, onDirtyChange]);

  const detail = detailState.status === "ready" ? detailState.detail : null;
  const matches = useMemo(() => detail?.matches ?? [], [detail]);
  const board = useMemo(
    () => buildGalleryBoard(matches, curation, SHOWCASE_WORK_CAP),
    [matches, curation],
  );
  const effectiveOrder = useMemo(
    () => effectiveGalleryOrder(matches, curation),
    [matches, curation],
  );
  const provenance = useMemo(() => summarizeProvenance(matches), [matches]);
  const matchedSlugs = useMemo(
    () => new Set(matches.map((match) => match.replication.slug)),
    [matches],
  );
  const unknownRightsOnStage = useMemo(
    () => board.rows.filter((row) => row.onStage && row.match.replication.rights_status === "unknown").length,
    [board.rows],
  );
  const titleOf = useCallback(
    (slug: string) =>
      matches.find((match) => match.replication.slug === slug)?.replication.title ?? slug,
    [matches],
  );

  const applyCuration = useCallback((next: GalleryCurationState, message: string) => {
    const pushed = pushHistory(historyRef.current, next);
    if (pushed === historyRef.current) return;
    setHistory(pushed);
    setSaveState("idle");
    setAnnouncement(message);
  }, []);

  const handleCurate = useCallback(
    (slug: string) => {
      const next = curateSlug(curation, slug);
      setFocusSlug(slug);
      applyCuration(next, `${titleOf(slug)} pinned to position ${next.curated.length}.`);
    },
    [applyCuration, curation, titleOf],
  );

  const handleUncurate = useCallback(
    (slug: string) => {
      setFocusSlug(slug);
      applyCuration(uncurateSlug(curation, slug), `${titleOf(slug)} returned to the default order.`);
    },
    [applyCuration, curation, titleOf],
  );

  const handleExclude = useCallback(
    (slug: string) => {
      const next = excludeSlug(curation, slug);
      applyCuration(next, `${titleOf(slug)} excluded — ${next.removed.length} on the excluded shelf.`);
    },
    [applyCuration, curation, titleOf],
  );

  const handleRestore = useCallback(
    (slug: string) => {
      setFocusSlug(slug);
      applyCuration(restoreSlug(curation, slug), `${titleOf(slug)} restored to the default order.`);
    },
    [applyCuration, curation, titleOf],
  );

  const handleMove = useCallback(
    (slug: string, direction: "up" | "down") => {
      const next = moveCuratedSlug(curation, slug, direction);
      applyCuration(
        next,
        `Moved ${titleOf(slug)} to position ${next.curated.indexOf(slug) + 1} of ${next.curated.length}.`,
      );
    },
    [applyCuration, curation, titleOf],
  );

  const handleMoveToEdge = useCallback(
    (slug: string, edge: "top" | "bottom") => {
      const next = moveCuratedSlugToEdge(curation, slug, edge);
      applyCuration(
        next,
        `Moved ${titleOf(slug)} to position ${next.curated.indexOf(slug) + 1} of ${next.curated.length}.`,
      );
    },
    [applyCuration, curation, titleOf],
  );

  const handleDragEnd = useCallback(
    ({ active, over }: DragEndEvent) => {
      if (!over) return;
      const activeSlug = String(active.id);
      const next = applyBoardDrag(curation, board, activeSlug, String(over.id));
      if (next === curation) return;
      const position = next.curated.indexOf(activeSlug);
      const pinned = next.curated.length - curation.curated.length;
      setFocusSlug(activeSlug);
      applyCuration(
        next,
        position === -1
          ? `${titleOf(activeSlug)} returned to the default order.`
          : `Moved ${titleOf(activeSlug)} to position ${position + 1} of ${next.curated.length}.${
              pinned > 0 ? ` Pinned ${pinned} row${pinned === 1 ? "" : "s"} above it to hold that position.` : ""
            }`,
      );
    },
    [applyCuration, board, curation, titleOf],
  );

  const handleUndo = useCallback(() => {
    const next = undoHistory(historyRef.current);
    if (next === historyRef.current) return;
    setHistory(next);
    setSaveState("idle");
    setAnnouncement("Undid the last curation change.");
  }, []);

  const handleRedo = useCallback(() => {
    const next = redoHistory(historyRef.current);
    if (next === historyRef.current) return;
    setHistory(next);
    setSaveState("idle");
    setAnnouncement("Redid the last undone curation change.");
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "z" || !(event.metaKey || event.ctrlKey)) return;
      const target = event.target as HTMLElement | null;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable
      ) {
        return;
      }
      event.preventDefault();
      if (event.shiftKey) handleRedo();
      else handleUndo();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleRedo, handleUndo]);

  const handleSelectSubstance = useCallback(
    (slug: string) => {
      if (slug === substanceSlug) return;
      if (dirtyRef.current) {
        setPendingSlug(slug);
        return;
      }
      onNavigateToSubstance(slug);
    },
    [onNavigateToSubstance, substanceSlug],
  );

  const persist = useCallback(
    async (state: GalleryCurationState, expected: string | null) => {
      if (!substanceSlug) return;
      setSaveState("saving");
      setFeedback(null);
      try {
        const response = await fetch(galleryDetailUrl(substanceSlug), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            curatedSlugs: state.curated,
            removedSlugs: state.removed,
            expectedUpdatedAt: expected,
          }),
        });
        if (response.status === 409) {
          const payload = (await response.json()) as { error?: string; conflict: GalleryConflict };
          setConflict(payload.conflict);
          setSaveState("error");
          setAnnouncement("Save rejected: the server holds a newer version of this gallery.");
          setFeedback({
            tone: "danger",
            message:
              payload.error ??
              "Someone else saved this gallery while you were editing. Resolve the two versions below.",
          });
          return;
        }
        if (!response.ok) {
          setSaveState("error");
          setFeedback({
            tone: "danger",
            message: await readGalleryApiError(response, "Saving the gallery failed."),
          });
          return;
        }
        const echo = (await response.json()) as {
          curated_slugs: string[];
          removed_slugs: string[];
          pruned_curated: string[];
          pruned_removed: string[];
          updated_at: string;
          updated_by: string | null;
        };
        const adopted: GalleryCurationState = {
          curated: [...echo.curated_slugs],
          removed: [...echo.removed_slugs],
        };
        setHistory(historyOf(adopted));
        setSavedCuration({ curated: [...echo.curated_slugs], removed: [...echo.removed_slugs] });
        setExpectedUpdatedAt(echo.updated_at);
        setSavedBy(echo.updated_by);
        setConflict(null);
        setSaveState("saved");
        setCandidates((current) => {
          const next = current.map((candidate) =>
            candidate.slug === substanceSlug
              ? {
                  ...candidate,
                  curated: true,
                  curated_count: echo.curated_slugs.length,
                  removed_count: echo.removed_slugs.length,
                }
              : candidate,
          );
          cachedCandidates = next;
          return next;
        });
        const pruned = [...echo.pruned_curated, ...echo.pruned_removed];
        setAnnouncement(
          `Saved the gallery: ${echo.curated_slugs.length} curated, ${echo.removed_slugs.length} excluded.`,
        );
        setFeedback({
          tone: pruned.length > 0 ? "warning" : "success",
          message:
            pruned.length > 0
              ? `Saved. The server dropped ${pruned.length} slug(s) that no longer match: ${pruned.join(", ")}.`
              : `Saved ${echo.curated_slugs.length} curated and ${echo.removed_slugs.length} excluded replications.`,
        });
      } catch {
        setSaveState("error");
        setFeedback({ tone: "danger", message: "Saving failed: the gallery endpoint is unreachable." });
      }
    },
    [substanceSlug],
  );

  const handleKeepMine = useCallback(() => {
    if (conflict) void persist(historyRef.current.present, conflict.updated_at);
  }, [conflict, persist]);

  const handleTakeTheirs = useCallback(() => {
    if (!conflict) return;
    const theirs: GalleryCurationState = {
      curated: [...conflict.curated_slugs],
      removed: [...conflict.removed_slugs],
    };
    setHistory(historyOf(theirs));
    setSavedCuration({ curated: [...conflict.curated_slugs], removed: [...conflict.removed_slugs] });
    setExpectedUpdatedAt(conflict.updated_at);
    setSavedBy(conflict.updated_by);
    setConflict(null);
    setSaveState("idle");
    setAnnouncement("Adopted the server's version; your draft was discarded.");
    setFeedback({ tone: "info", message: "Adopted the server's version. Your unsaved draft is gone." });
  }, [conflict]);

  const handleDiscard = useCallback(() => {
    setHistory(historyOf({ curated: [...savedCuration.curated], removed: [...savedCuration.removed] }));
    setSaveState("idle");
    setConflict(null);
    setAnnouncement("Changes discarded.");
  }, [savedCuration]);

  const handleTagged = useCallback(
    async (replicationSlug: string) => {
      if (!substanceSlug) return;
      const result = await fetchGalleryDetail(substanceSlug);
      if (result.status === "error") {
        setFeedback({ tone: "danger", message: result.message });
        return;
      }
      setDetailState({ status: "ready", detail: result.detail });
      const match = result.detail.matches.find(
        (entry) => entry.replication.slug === replicationSlug,
      );
      if (!match) {
        setFeedback({
          tone: "warning",
          message: `Tagged, but ${replicationSlug} still does not match any of this substance's visual effects.`,
        });
        return;
      }
      const next = curateSlug(historyRef.current.present, replicationSlug);
      setFocusSlug(replicationSlug);
      applyCuration(next, `${match.replication.title} tagged and pinned to position ${next.curated.length}.`);
    },
    [applyCuration, substanceSlug],
  );

  const retry = useCallback(() => {
    cachedCandidates = null;
    setCandidatesToken((token) => token + 1);
    setDetailToken((token) => token + 1);
  }, []);

  const discardAndSwitch = useCallback(() => {
    const target = pendingSlug;
    setPendingSlug(null);
    if (target) onNavigateToSubstance(target);
  }, [onNavigateToSubstance, pendingSlug]);
  const clearFocus = useCallback(() => setFocusSlug(null), []);


  return {
    candidates,
    candidatesLoaded,
    detailState,
    detail,
    history,
    curation,
    isDirty,
    expectedUpdatedAt,
    savedBy,
    conflict,
    saveState,
    feedback,
    excludedOpen,
    unmatchedOpen,
    previewOpen,
    pendingSlug,
    focusSlug,
    announcement,
    matches,
    board,
    effectiveOrder,
    provenance,
    matchedSlugs,
    unknownRightsOnStage,
    undoable: canUndo(history),
    redoable: canRedo(history),
    setFeedback,
    setExcludedOpen,
    setUnmatchedOpen,
    setPreviewOpen,
    setPendingSlug,
    clearFocus,
    handleCurate,
    handleUncurate,
    handleExclude,
    handleRestore,
    handleMove,
    handleMoveToEdge,
    handleDragEnd,
    handleUndo,
    handleRedo,
    handleSelectSubstance,
    persist,
    handleKeepMine,
    handleTakeTheirs,
    handleDiscard,
    handleTagged,
    retry,
    discardAndSwitch,
  };
}
