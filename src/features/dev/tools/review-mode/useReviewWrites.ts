"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

import type { SubstanceArticle } from "@/schema";
import { REVIEW_INITIAL_REVISION, type ReviewState } from "@/schema/substance/editorial";
import type { ReviewStatus } from "../substance-editor/types";
import { resolveEditorArticleSlug } from "../../context/devModeUtils";
import {
  resolveReviewCelebration,
  type ReviewCelebration,
} from "./reviewDelight";
import type {
  PublishedRevisions,
  ReviewQueueEntry,
  ReviewQueueGroup,
  ReviewStatusOverrides,
} from "./reviewQueue";
import { crossedMilestone } from "./reviewSettings";

const UNDO_WINDOW_MS = 8000;
const MILESTONE_MS = 4000;
/** How long a finished chemical-class subsection holds its toast. */
const SECTION_CELEBRATION_MS = 4500;
/** How long a finished psychoactive category holds its medallion card. */
const GROUP_CELEBRATION_MS = 6000;


/** What the reviewer saw, so an undo can restore a sign-off's revision too. */
function seenStatus(entry: ReviewQueueEntry): { status: ReviewState; revision?: string } {
  return {
    status: entry.status,
    ...(entry.reviewedRevision ? { revision: entry.reviewedRevision } : {}),
  };
}

interface ReviewOverlays {
  overrides: ReviewStatusOverrides;
  setOverrides: Dispatch<SetStateAction<ReviewStatusOverrides>>;
}

/** Human review status overlays; article drafts use the canonical lifecycle. */
export function useReviewOverlays(): ReviewOverlays {
  const [overrides, setOverrides] = useState<ReviewStatusOverrides>({});
  return { overrides, setOverrides };
}


/** The last status change, held for the undo window. */
interface ReviewLastTick {
  slug: string;
  name: string;
  /** The status the reviewer saw before the change, overlay included. */
  previous: ReviewState;
  /** The revision the previous sign-off covered, so undo restores it. */
  previousRevision?: string;
  /** The status the change set. */
  status: ReviewStatus;
}

export interface ReviewStatusWrites {
  isTicking: boolean;
  tickError: string | null;
  clearTickError: () => void;
  lastTick: ReviewLastTick | null;
  /** Whether this role may mark an article reviewed (admins only). */
  canSignOff: boolean;
  /** Whether the current article body has loaded, so a tick means it was read. */
  currentHydrated: boolean;
  milestone: number | null;
  celebration: (ReviewCelebration & { id: number }) | null;
  toggleReviewed: () => void;
  toggleFlagged: () => void;
  undoLastTick: () => void;
  dismissCelebration: () => void;
}

/**
 * The tick and the flag (`/api/dev/editorial-review`), plus the undo window,
 * milestone toast, and bucket celebration a tick can set off.
 *
 * Completing a review is admin-only at the route, so `canSignOff` keeps the
 * tick from firing for any other role, and `currentHydrated` keeps it from
 * firing before the reviewer could have read the article body.
 *
 * A sign-off names the published revision the reviewer read, from
 * `publishedRevisions`; before those load the route records the current one.
 */
export function useReviewStatusWrites({
  current,
  typedArticles,
  queueGroups,
  reviewedCount,
  setOverrides,
  canSignOff,
  currentHydrated,
  publishedRevisions = null,
}: {
  current: ReviewQueueEntry | null;
  typedArticles: SubstanceArticle[];
  queueGroups: ReviewQueueGroup[];
  reviewedCount: number;
  setOverrides: ReviewOverlays["setOverrides"];
  canSignOff: boolean;
  currentHydrated: boolean;
  publishedRevisions?: PublishedRevisions | null;
}): ReviewStatusWrites {
  const [isTicking, setIsTicking] = useState(false);
  const [tickError, setTickError] = useState<string | null>(null);
  const [lastTick, setLastTick] = useState<ReviewLastTick | null>(null);
  const [milestone, setMilestone] = useState<number | null>(null);
  // The bucket the last tick finished off, if any. Fire-and-forget by design:
  // an undo inside the window does not recall the confetti — the sealed picker
  // chips and the trophy shelf derive from live counts and self-correct.
  const [celebration, setCelebration] = useState<
    (ReviewCelebration & { id: number }) | null
  >(null);

  const undoTimerRef = useRef<number | null>(null);
  const milestoneTimerRef = useRef<number | null>(null);
  const celebrationIdRef = useRef(0);
  const celebrationTimerRef = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (undoTimerRef.current !== null) window.clearTimeout(undoTimerRef.current);
      if (milestoneTimerRef.current !== null) window.clearTimeout(milestoneTimerRef.current);
      if (celebrationTimerRef.current !== null) window.clearTimeout(celebrationTimerRef.current);
    },
    [],
  );

  const clearTickError = useCallback(() => setTickError(null), []);

  const setReviewStatus = useCallback(
    async (
      slug: string,
      name: string,
      status: ReviewStatus,
      baseStatus: ReviewStatus,
      previous: { status: ReviewState; revision?: string },
      options?: { isUndo?: boolean; revision?: string },
    ) => {
      setIsTicking(true);
      setTickError(null);
      const previousReviewed = reviewedCount;
      try {
        const response = await fetch("/api/dev/editorial-review", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            slug,
            status,
            ...(status === "completed" && options?.revision ? { revision: options.revision } : {}),
          }),
        });
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
          editorial_review?: SubstanceArticle["editorial_review"];
        } | null;
        if (!response.ok) {
          throw new Error(
            payload?.error ??
              "Unable to update the review status. Are you signed in as an editor?",
          );
        }
        const persistedReview = payload?.editorial_review;
        setOverrides((previous) => ({
          ...previous,
          [slug]: { status, baseStatus, ...(persistedReview ? { review: persistedReview } : {}) },
        }));


        // Every change, un-reviewing included, gets the toast and its undo
        // window; an undo itself does not, so U never ping-pongs.
        if (options?.isUndo) {
          setLastTick(null);
        } else {
          setLastTick({
            slug,
            name,
            previous: previous.status,
            ...(previous.revision ? { previousRevision: previous.revision } : {}),
            status,
          });
          if (undoTimerRef.current !== null) window.clearTimeout(undoTimerRef.current);
          undoTimerRef.current = window.setTimeout(
            () => setLastTick(null),
            UNDO_WINDOW_MS,
          );
        }

        if (status === "completed" && !options?.isUndo) {

          // Loudest celebration only. `queueGroups` is this render's closure,
          // i.e. the tree as it stood before this tick — exactly what the
          // helper expects, since it counts the ticked slug as completed
          // itself. A finished bucket outranks the every-50 milestone toast.
          const finished = resolveReviewCelebration(queueGroups, slug);
          if (finished) {
            celebrationIdRef.current += 1;
            setCelebration({ ...finished, id: celebrationIdRef.current });
            if (celebrationTimerRef.current !== null) {
              window.clearTimeout(celebrationTimerRef.current);
            }
            celebrationTimerRef.current = window.setTimeout(
              () => setCelebration(null),
              finished.level === "group"
                ? GROUP_CELEBRATION_MS
                : SECTION_CELEBRATION_MS,
            );
          }

          const mark = finished
            ? null
            : crossedMilestone(previousReviewed, previousReviewed + 1);
          if (mark !== null) {
            setMilestone(mark);
            if (milestoneTimerRef.current !== null) {
              window.clearTimeout(milestoneTimerRef.current);
            }
            milestoneTimerRef.current = window.setTimeout(
              () => setMilestone(null),
              MILESTONE_MS,
            );
          }
        }
      } catch (error) {
        setTickError(
          error instanceof Error
            ? error.message
            : "Failed to update review status.",
        );
      } finally {
        setIsTicking(false);
      }
    },
    [queueGroups, reviewedCount, setOverrides],
  );

  /**
   * What the working set's own row says, which is the base an override is
   * recorded against (see `ReviewStatusOverride.baseStatus`). The status the
   * reviewer sees, and so the one an undo returns to, is the queue entry's,
   * which already reads the optimistic overlay first.
   */
  const articleStatus = useCallback((entrySlug: string): ReviewStatus => {
    const record = typedArticles.find((candidate) => resolveEditorArticleSlug(candidate) === entrySlug);
    const raw = record?.editorial_review?.status;
    return raw === "in_progress" || raw === "completed" ? raw : "needed";
  }, [typedArticles]);

  // A stale sign-off is not reviewed: R signs the revision on screen again.
  const toggleReviewed = useCallback(() => {
    if (!current || isTicking || !canSignOff || !currentHydrated) return;
    const signing = current.status !== "completed";
    void setReviewStatus(
      current.slug,
      current.name,
      signing ? "completed" : "needed",
      articleStatus(current.slug),
      seenStatus(current),
      signing && publishedRevisions
        ? { revision: publishedRevisions[current.slug] ?? REVIEW_INITIAL_REVISION }
        : undefined,
    );
  }, [articleStatus, canSignOff, current, currentHydrated, isTicking, publishedRevisions, setReviewStatus]);

  const toggleFlagged = useCallback(() => {
    if (!current || isTicking) return;
    void setReviewStatus(
      current.slug,
      current.name,
      current.status === "in_progress" ? "needed" : "in_progress",
      articleStatus(current.slug),
      seenStatus(current),
    );
  }, [articleStatus, current, isTicking, setReviewStatus]);

  const dismissCelebration = useCallback(() => {
    if (celebrationTimerRef.current !== null) {
      window.clearTimeout(celebrationTimerRef.current);
      celebrationTimerRef.current = null;
    }
    setCelebration(null);
  }, []);

  const undoLastTick = useCallback(() => {
    if (!lastTick || isTicking) return;
    // Undoing back to a sign-off, stale or not, restores the revision it
    // covered rather than signing whatever is published now.
    const restoresSignOff = lastTick.previous === "completed" || lastTick.previous === "stale";
    void setReviewStatus(
      lastTick.slug,
      lastTick.name,
      restoresSignOff ? "completed" : (lastTick.previous as ReviewStatus),
      articleStatus(lastTick.slug),
      { status: lastTick.status },
      {
        isUndo: true,
        ...(restoresSignOff && lastTick.previousRevision ? { revision: lastTick.previousRevision } : {}),
      },
    );
  }, [articleStatus, isTicking, lastTick, setReviewStatus]);

  return {
    isTicking,
    tickError,
    clearTickError,
    lastTick,
    canSignOff,
    currentHydrated,
    milestone,
    celebration,
    toggleReviewed,
    toggleFlagged,
    undoLastTick,
    dismissCelebration,
  };
}
