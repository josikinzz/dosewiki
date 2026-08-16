"use client";

/**
 * Substance Galleries curation portal — `/dev` → Replications → Substances,
 * deep-linked at `/dev/replications/<substance-slug>`.
 *
 * This is the orchestrator; the contact-sheet board lives in `GalleryBoardList`,
 * the substance combobox in `GalleryPicker`, corpus intake in
 * `GalleryLibraryAdd`, and the fidelity preview in `GalleryStagePreview`. What
 * stays here is the part that has to be single-sourced: the draft, its bounded
 * undo stack, the version-checked save, and the dirty guard.
 *
 * Two disciplines are load-bearing and unchanged from the first version.
 * Curation is never optimistic: the draft is local until Save, and the server's
 * pruned echo is adopted verbatim because `normalizeGalleryCuration` is the
 * authority on which slugs still match. And every slot decision is measured
 * against `SHOWCASE_WORK_CAP` rather than a copy of the number — the article
 * truncates after the cap, so the board has to say so out loud.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DragEndEvent } from "@dnd-kit/core";

import { Icon } from "@/components/common/Icon";
import { SkeletonPulse } from "@/components/layout/PublicFeedbackPrimitives";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyStateSurface, InteractiveContentCard } from "@/components/ui/surface";
import {
  ActionNotice,
  DiffSurface,
  EditorActionStatus,
  EditorSection,
  EditorStatusPill,
  EditorToolbar,
  type ActionNoticeTone,
  type EditorActionStatusState,
} from "@/features/dev/components";
import { SHOWCASE_WORK_CAP } from "@/features/replications/components/showcaseModel";

import { GalleryBoardList, GalleryMatchIdentity } from "./GalleryBoardList";
import { GalleryLibraryAdd } from "./GalleryLibraryAdd";
import { GalleryPicker } from "./GalleryPicker";
import { GalleryStagePreview } from "./GalleryStagePreview";
import type { StudioRow } from "./replicationStudioModel";
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
  type GalleryMatch,
} from "./substanceGalleryPortalModel";

const SUBSTANCES_API = "/api/dev/replications/substances";

/**
 * The picker list survives leaving and re-entering the sub-view, like the
 * studio's own corpus cache: the batched read walks the whole article table
 * and must not rerun on every visit. A failed read clears it so the retry is
 * a real retry.
 */
let cachedCandidates: GalleryCandidate[] | null = null;

type Feedback = { tone: ActionNoticeTone; message: string };

type DetailState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; detail: GalleryDetail };

/**
 * A string discriminant, not `ok: boolean`: this project compiles with
 * `strictNullChecks: false`, under which boolean-literal narrowing does not hold.
 */
type DetailResult =
  | { status: "ready"; detail: GalleryDetail }
  | { status: "error"; message: string };

async function readError(response: Response, fallback: string): Promise<string> {
  try {
    const payload = (await response.json()) as { error?: string };
    return payload.error ?? fallback;
  } catch {
    return fallback;
  }
}

/**
 * A two-block listing of the server's arrays against the draft's, in the shape
 * `DiffSurface` colours. A line keeps a neutral prefix when the slug sits at the
 * same index in the other list, so the coloured lines are exactly the
 * disagreements rather than the whole gallery.
 */
function conflictDiffText(conflict: GalleryConflict, mine: GalleryCurationState): string {
  const lines: string[] = [];
  const blocks = [
    { label: "curated_slugs", theirs: conflict.curated_slugs, ours: mine.curated },
    { label: "removed_slugs", theirs: conflict.removed_slugs, ours: mine.removed },
  ];
  for (const { label, theirs, ours } of blocks) {
    lines.push(
      `# ${label} — server, saved ${conflict.updated_at.slice(0, 19).replace("T", " ")} by ${
        conflict.updated_by ?? "unknown"
      }`,
    );
    if (theirs.length === 0) {
      lines.push("  (empty)");
    }
    theirs.forEach((slug, index) => {
      lines.push(`${ours[index] === slug ? " " : "-"}${String(index + 1).padStart(3)} ${slug}`);
    });
    lines.push(`# ${label} — your unsaved draft`);
    if (ours.length === 0) {
      lines.push("  (empty)");
    }
    ours.forEach((slug, index) => {
      lines.push(`${theirs[index] === slug ? " " : "+"}${String(index + 1).padStart(3)} ${slug}`);
    });
  }
  return lines.join("\n");
}

/** Row-shaped placeholders, so the board's rhythm is established before its data. */
function BoardSkeleton() {
  return (
    <div aria-hidden className="space-y-2">
      {Array.from({ length: 6 }, (_, index) => (
        <div
          key={index}
          className="flex items-center gap-3 rounded-lg border border-[color:var(--editor-chip-border)] p-2"
        >
          <SkeletonPulse width="w-5" height="h-5" tone="strong" className="rounded-md" />
          <SkeletonPulse width="w-14" height="h-14" className="shrink-0 rounded-lg" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <SkeletonPulse width="w-1/2" height="h-3.5" tone="strong" />
            <SkeletonPulse width="w-1/3" height="h-3" />
            <SkeletonPulse width="w-2/5" height="h-3" />
          </div>
        </div>
      ))}
    </div>
  );
}

function ExcludedRow({ match, onRestore }: { match: GalleryMatch; onRestore: (slug: string) => void }) {
  return (
    <li className="list-none">
      <InteractiveContentCard variant="public" padding="sm" radius="lg" className="opacity-70">
        <div className="flex items-center gap-3">
          <GalleryMatchIdentity match={match} />
          <Button
            variant="secondary"
            size="sm"
            className="shrink-0"
            aria-label={`Restore ${match.replication.title} to the default order`}
            onClick={() => onRestore(match.replication.slug)}
          >
            <Icon icon="lucide:undo-2" size={14} />
            Restore
          </Button>
        </div>
      </InteractiveContentCard>
    </li>
  );
}

export type SubstanceGalleryPanelProps = {
  /** The `/dev/replications/<slug>` deep-link target currently open, if any. */
  substanceSlug: string | null;
  /** Navigate to another substance's portal address; the tab owns the router. */
  onNavigateToSubstance: (slug: string) => void;
  /** The studio grid's rail-filtered rows, feeding corpus intake. */
  visibleRows: readonly StudioRow[];
  /** Whether the rail currently narrows the corpus (search or facets active). */
  railNarrowed: boolean;
  /** Open a corpus row in the studio's editor drawer. */
  onInspectRow: (slug: string) => void;
  /** Ask the host to switch the centre column to the corpus Library view. */
  onOpenLibrary: () => void;
  /** Report unsaved state so the host can guard navigation. */
  onDirtyChange: (dirty: boolean) => void;
};

export function SubstanceGalleryPanel({
  substanceSlug,
  onNavigateToSubstance,
  visibleRows,
  railNarrowed,
  onInspectRow,
  onOpenLibrary,
  onDirtyChange,
}: SubstanceGalleryPanelProps) {
  const [candidates, setCandidates] = useState<GalleryCandidate[]>(() => cachedCandidates ?? []);
  const [candidatesLoaded, setCandidatesLoaded] = useState(cachedCandidates !== null);
  const [candidatesToken, setCandidatesToken] = useState(0);
  const [detailState, setDetailState] = useState<DetailState>({ status: "idle" });
  const [detailToken, setDetailToken] = useState(0);
  const [history, setHistory] = useState<CurationHistory>(() => historyOf({ curated: [], removed: [] }));
  const [savedCuration, setSavedCuration] = useState<GalleryCurationState>({ curated: [], removed: [] });
  /** The `updated_at` this draft was branched from; `null` means "no row yet". */
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

  /* ---------------------------------------------------------------- loads */

  useEffect(() => {
    if (cachedCandidates) {
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(SUBSTANCES_API);
        if (!response.ok) {
          cachedCandidates = null;
          if (!cancelled) {
            setFeedback({
              tone: "danger",
              message: await readError(response, "Failed to load the substance list."),
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

  const fetchDetail = useCallback(async (slug: string): Promise<DetailResult> => {
    try {
      const response = await fetch(`${SUBSTANCES_API}/${encodeURIComponent(slug)}`);
      if (!response.ok) {
        return {
          status: "error",
          message: await readError(response, "Failed to load that substance's gallery."),
        };
      }
      return { status: "ready", detail: (await response.json()) as GalleryDetail };
    } catch {
      return { status: "error", message: "Failed to reach the gallery endpoint." };
    }
  }, []);

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
    (async () => {
      const result = await fetchDetail(substanceSlug);
      if (cancelled) {
        return;
      }
      if (result.status === "error") {
        setDetailState({ status: "error", message: result.message });
        return;
      }
      const { detail } = result;
      setDetailState({ status: "ready", detail });
      setHistory(historyOf(curationStateOf(detail.curation)));
      setSavedCuration(curationStateOf(detail.curation));
      setExpectedUpdatedAt(detail.curation?.updated_at ?? null);
      setSavedBy(detail.curation?.updated_by ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchDetail, substanceSlug, detailToken]);

  useEffect(() => {
    onDirtyChange(isDirty);
  }, [isDirty, onDirtyChange]);

  /* -------------------------------------------------------------- derived */

  const detail = detailState.status === "ready" ? detailState.detail : null;
  const matches = useMemo(() => detail?.matches ?? [], [detail]);
  const board = useMemo(
    () => buildGalleryBoard(matches, curation, SHOWCASE_WORK_CAP),
    [matches, curation],
  );
  const effectiveOrder = useMemo(() => effectiveGalleryOrder(matches, curation), [matches, curation]);
  const provenance = useMemo(() => summarizeProvenance(matches), [matches]);
  const matchedSlugs = useMemo(
    () => new Set(matches.map((match) => match.replication.slug)),
    [matches],
  );
  const unknownRightsOnStage = useMemo(
    () =>
      board.rows.filter((row) => row.onStage && row.match.replication.rights_status === "unknown").length,
    [board.rows],
  );
  const titleOf = useCallback(
    (slug: string) => matches.find((match) => match.replication.slug === slug)?.replication.title ?? slug,
    [matches],
  );

  /* -------------------------------------------------------------- actions */

  const applyCuration = useCallback((next: GalleryCurationState, message: string) => {
    const pushed = pushHistory(historyRef.current, next);
    if (pushed === historyRef.current) {
      return;
    }
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
      if (!over) {
        return;
      }
      const activeSlug = String(active.id);
      const next = applyBoardDrag(curation, board, activeSlug, String(over.id));
      if (next === curation) {
        return;
      }
      const position = next.curated.indexOf(activeSlug);
      // A drop into the derived tail has to pin everything above it, so say how
      // many rows that took rather than letting the head silently grow.
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
    if (next === historyRef.current) {
      return;
    }
    setHistory(next);
    setSaveState("idle");
    setAnnouncement("Undid the last curation change.");
  }, []);

  const handleRedo = useCallback(() => {
    const next = redoHistory(historyRef.current);
    if (next === historyRef.current) {
      return;
    }
    setHistory(next);
    setSaveState("idle");
    setAnnouncement("Redid the last undone curation change.");
  }, []);

  /**
   * Cmd/Ctrl+Z and Cmd/Ctrl+Shift+Z over the draft. Text fields keep their own
   * native undo — stealing the shortcut inside the picker's search box or a
   * drawer field would be worse than having no shortcut at all.
   */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "z" || !(event.metaKey || event.ctrlKey)) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable
      ) {
        return;
      }
      event.preventDefault();
      if (event.shiftKey) {
        handleRedo();
      } else {
        handleUndo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleRedo, handleUndo]);

  const handleSelectSubstance = useCallback(
    (slug: string) => {
      if (slug === substanceSlug) {
        return;
      }
      if (dirtyRef.current) {
        setPendingSlug(slug);
        return;
      }
      onNavigateToSubstance(slug);
    },
    [onNavigateToSubstance, substanceSlug],
  );

  /* ----------------------------------------------------------------- save */

  /**
   * One write path for Save and for the conflict's "Keep mine": the only
   * difference is which `updated_at` the caller claims to have branched from.
   */
  const persist = useCallback(
    async (state: GalleryCurationState, expected: string | null) => {
      if (!substanceSlug) {
        return;
      }
      setSaveState("saving");
      setFeedback(null);
      try {
        const response = await fetch(`${SUBSTANCES_API}/${encodeURIComponent(substanceSlug)}`, {
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
          setFeedback({ tone: "danger", message: await readError(response, "Saving the gallery failed.") });
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
    if (!conflict) {
      return;
    }
    void persist(historyRef.current.present, conflict.updated_at);
  }, [conflict, persist]);

  const handleTakeTheirs = useCallback(() => {
    if (!conflict) {
      return;
    }
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

  /**
   * A corpus row was tagged with one of this substance's effects: re-derive the
   * match list server-side, then pin the row. The draft survives the refetch —
   * only `detailState` is replaced, never the curation the editor is holding.
   */
  const handleTagged = useCallback(
    async (replicationSlug: string) => {
      if (!substanceSlug) {
        return;
      }
      const result = await fetchDetail(substanceSlug);
      if (result.status === "error") {
        setFeedback({ tone: "danger", message: result.message });
        return;
      }
      setDetailState({ status: "ready", detail: result.detail });
      const match = result.detail.matches.find((entry) => entry.replication.slug === replicationSlug);
      if (!match) {
        setFeedback({
          tone: "warning",
          message: `Tagged, but ${replicationSlug} still does not match any of this substance's visual effects.`,
        });
        return;
      }
      const next = curateSlug(historyRef.current.present, replicationSlug);
      setFocusSlug(replicationSlug);
      applyCuration(
        next,
        `${match.replication.title} tagged and pinned to position ${next.curated.length}.`,
      );
    },
    [applyCuration, fetchDetail, substanceSlug],
  );

  /* ------------------------------------------------------------------ view */

  const undoable = canUndo(history);
  const redoable = canRedo(history);

  return (
    <EditorSection
      headingLevel="h3"
      icon="lucide:images"
      title="Substance Replication Showcases"
      description={`Each substance article's Visual group ends with its matched replications. The article renders the first ${SHOWCASE_WORK_CAP} of the effective order and nothing else; curated rows play first in this exact order, everything else follows the corpus default, and excluded rows never surface on that article.`}
    >
      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <GalleryPicker
          candidates={candidates}
          currentSlug={substanceSlug}
          onSelect={handleSelectSubstance}
          loading={!candidatesLoaded}
        />
        {detail ? (
          <>
            <EditorStatusPill tone={board.filledSlots >= board.cap ? "info" : "neutral"}>
              {`${board.filledSlots} of ${board.cap} slots filled · ${matches.length} matched`}
            </EditorStatusPill>
            <div className="min-w-0">
              <p className="theme-text-muted font-mono text-xs">
                {provenance.matched} matched from {provenance.effectCount} visual effect
                {provenance.effectCount === 1 ? "" : "s"} · {provenance.viaEffectSlug} via effect_slug ·{" "}
                {provenance.viaEffectTags} via effect_tags
              </p>
              {detail.unmatchedEffectNames.length > 0 ? (
                <Button
                  type="button"
                  variant="textLink"
                  size="auto"
                  className="text-xs"
                  aria-expanded={unmatchedOpen}
                  onClick={() => setUnmatchedOpen((open) => !open)}
                >
                  {detail.unmatchedEffectNames.length} visual effect
                  {detail.unmatchedEffectNames.length === 1 ? "" : "s"} with nothing to show
                </Button>
              ) : null}
            </div>
          </>
        ) : null}
      </div>

      {detail ? (
        <EditorToolbar variant="split">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="accent"
              size="sm"
              disabled={!isDirty || saveState === "saving"}
              onClick={() => void persist(curation, expectedUpdatedAt)}
            >
              <Icon icon="lucide:save" size={15} />
              Save gallery
            </Button>
            <Button
              type="button"
              variant="glass"
              size="icon"
              className="h-8 w-8"
              disabled={!undoable}
              aria-label="Undo the last curation change"
              title="Undo (Cmd/Ctrl+Z)"
              onClick={handleUndo}
            >
              <Icon icon="lucide:undo-2" size={15} />
            </Button>
            <Button
              type="button"
              variant="glass"
              size="icon"
              className="h-8 w-8"
              disabled={!redoable}
              aria-label="Redo the last undone curation change"
              title="Redo (Cmd/Ctrl+Shift+Z)"
              onClick={handleRedo}
            >
              <Icon icon="lucide:redo-2" size={15} />
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={!isDirty || saveState === "saving"}
              onClick={handleDiscard}
            >
              <Icon icon="lucide:rotate-ccw" size={15} />
              Discard changes
            </Button>
            {expectedUpdatedAt ? (
              <span className="theme-text-faint text-xs">
                Last saved {expectedUpdatedAt.slice(0, 10)} by {savedBy ?? "unknown"}
              </span>
            ) : (
              <span className="theme-text-faint text-xs">
                Never curated — the article runs on the default order.
              </span>
            )}
          </div>
          {saveState === "idle" || saveState === "saved" ? (
            <EditorStatusPill tone={isDirty ? "warning" : "neutral"}>
              {isDirty ? "Unsaved changes" : "Gallery saved"}
            </EditorStatusPill>
          ) : (
            <EditorActionStatus status={saveState} />
          )}
        </EditorToolbar>
      ) : null}

      {feedback ? (
        <ActionNotice tone={feedback.tone} onDismiss={() => setFeedback(null)}>
          {feedback.message}
        </ActionNotice>
      ) : null}

      {conflict ? (
        <DiffSurface
          title="This gallery changed on the server"
          diffText={conflictDiffText(conflict, curation)}
          maxHeight="18rem"
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="accent"
                size="sm"
                disabled={saveState === "saving"}
                onClick={handleKeepMine}
              >
                <Icon icon="lucide:upload" size={14} />
                Keep mine
              </Button>
              <Button type="button" variant="secondary" size="sm" onClick={handleTakeTheirs}>
                <Icon icon="lucide:download" size={14} />
                Take theirs
              </Button>
            </div>
          }
        />
      ) : null}

      {detail && unknownRightsOnStage > 0 ? (
        <ActionNotice tone="warning">
          {unknownRightsOnStage} of the {board.filledSlots} rows the article will show
          {unknownRightsOnStage === 1 ? " has" : " have"} unknown reuse terms. Advisory only — check the
          rights before featuring them this prominently.
        </ActionNotice>
      ) : null}

      {detail && unmatchedOpen ? (
        <EmptyStateSurface padding="sm" radius="lg" className="space-y-1.5 text-sm">
          <p className="theme-text-primary font-medium">
            No publishable replication matches these visual effects yet:
          </p>
          <p className="theme-text-muted">{detail.unmatchedEffectNames.join(" · ")}</p>
          <p className="theme-text-faint text-xs">
            Tag a corpus row with the effect below — or set it as the row's owning effect — and it will
            surface here and on the article.
          </p>
        </EmptyStateSurface>
      ) : null}

      {!substanceSlug ? (
        <EmptyStateSurface padding="sm" radius="lg" className="theme-text-muted text-sm">
          Pick a substance to curate its Replication Showcase. The dot marks substances with a stored
          curation; the count is how many corpus rows currently match.
        </EmptyStateSurface>
      ) : detailState.status === "loading" ? (
        <BoardSkeleton />
      ) : detailState.status === "error" ? (
        <EmptyStateSurface padding="sm" radius="lg" tone="danger" className="space-y-2 text-sm">
          <p className="theme-text-primary">{detailState.message}</p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              cachedCandidates = null;
              setCandidatesToken((token) => token + 1);
              setDetailToken((token) => token + 1);
            }}
          >
            <Icon icon="lucide:refresh-cw" size={14} />
            Retry
          </Button>
        </EmptyStateSurface>
      ) : detail && matches.length === 0 ? (
        <EmptyStateSurface padding="sm" radius="lg" className="space-y-1.5 text-sm">
          <p className="theme-text-primary font-medium">
            Nothing in the corpus matches {detail.substance.title} yet.
          </p>
          {detail.unmatchedEffectNames.length > 0 ? (
            <>
              <p className="theme-text-muted">
                Its visual effects: {detail.unmatchedEffectNames.join(" · ")}
              </p>
              <p className="theme-text-faint text-xs">
                Tag a corpus row with one of these effects — or set it as the row's owning effect — and it
                will appear here and on the article.
              </p>
            </>
          ) : (
            <p className="theme-text-muted">
              The article lists no visual effects, so its showcase stays empty.
            </p>
          )}
          <Button type="button" variant="secondary" size="sm" onClick={onOpenLibrary}>
            <Icon icon="lucide:library" size={14} />
            Open the corpus library
          </Button>
        </EmptyStateSurface>
      ) : detail ? (
        <>
          <GalleryBoardList
            board={board}
            onMove={handleMove}
            onMoveToEdge={handleMoveToEdge}
            onCurate={handleCurate}
            onUncurate={handleUncurate}
            onExclude={handleExclude}
            onDragEnd={handleDragEnd}
            focusSlug={focusSlug}
            onFocusHandled={() => setFocusSlug(null)}
          />

          {board.excluded.length > 0 ? (
            <div className="space-y-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-expanded={excludedOpen}
                onClick={() => setExcludedOpen((open) => !open)}
              >
                <Icon icon={excludedOpen ? "lucide:chevron-down" : "lucide:chevron-right"} size={14} />
                Excluded from this gallery ({board.excluded.length})
              </Button>
              {excludedOpen ? (
                <ul className="space-y-2">
                  {board.excluded.map((match) => (
                    <ExcludedRow key={match.replication.slug} match={match} onRestore={handleRestore} />
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          <div className="space-y-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-expanded={previewOpen}
              onClick={() => setPreviewOpen((open) => !open)}
            >
              <Icon icon={previewOpen ? "lucide:chevron-down" : "lucide:chevron-right"} size={14} />
              Article preview — the real stage, in this order
            </Button>
            {previewOpen ? <GalleryStagePreview matches={effectiveOrder} /> : null}
          </div>

          <GalleryLibraryAdd
            rows={visibleRows}
            railNarrowed={railNarrowed}
            matchedSlugs={matchedSlugs}
            curatedSlugs={curation.curated}
            removedSlugs={curation.removed}
            effectOptions={detail.effectOptions}
            onCurate={handleCurate}
            onTagged={handleTagged}
            onInspectRow={onInspectRow}
            onOpenLibrary={onOpenLibrary}
          />
        </>
      ) : null}

      <Dialog open={pendingSlug !== null} onOpenChange={(open) => (open ? undefined : setPendingSlug(null))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Discard unsaved curation?</DialogTitle>
            <DialogDescription>
              This gallery has changes that were never saved. Switching substances throws them away —
              the article keeps whatever the server already holds.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="secondary" size="sm" onClick={() => setPendingSlug(null)}>
              Keep editing
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => {
                const target = pendingSlug;
                setPendingSlug(null);
                if (target) {
                  onNavigateToSubstance(target);
                }
              }}
            >
              Discard and switch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </EditorSection>
  );
}
