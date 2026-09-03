"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";

import {
  ArticleFieldCommitError,
  type ArticleEditContextValue,
  type EditableFieldValue,
} from "@/features/article/editing";
import {
  getArticleValueByPath,
  setArticleValueByPath,
} from "@/data/schema/fieldPath";
import type { UseArticleFormReturn } from "@/hooks/useArticleForm";
import type { Reference, SubstanceArticle } from "@/schema";
import { buildArticleYamlDraft } from "../substance-editor/substanceEditorDraftUtils";
import type { ReviewStatus } from "../substance-editor/types";
import {
  asInlineFieldValue,
  readStoredInlineValue,
  type InlineFieldEdit,
} from "./inlineFieldEdits";
import {
  resolveReviewCelebration,
  type ReviewCelebration,
} from "./reviewDelight";
import type { ReviewQueueEntry, ReviewQueueGroup, ReviewStatusOverrides } from "./reviewQueue";
import { crossedMilestone } from "./reviewSettings";

const UNDO_WINDOW_MS = 8000;
const MILESTONE_MS = 4000;
/** How long a finished chemical-class subsection holds its toast. */
const SECTION_CELEBRATION_MS = 4500;
/** How long a finished psychoactive category holds its medallion card. */
const GROUP_CELEBRATION_MS = 6000;

/**
 * The slice of `useSubstanceEditorDraftController` the direct writes reconcile
 * against, so the editor form keeps agreeing with what just landed in Convex.
 */
export interface ReviewDraftHandle {
  formDirty: boolean;
  formRef: MutableRefObject<UseArticleFormReturn | null>;
  formArticleOverride: SubstanceArticle | null;
  setFormArticleOverride: Dispatch<SetStateAction<SubstanceArticle | null>>;
  setStreamedOutput: Dispatch<SetStateAction<string>>;
}

interface ReviewOverlays {
  overrides: ReviewStatusOverrides;
  setOverrides: Dispatch<SetStateAction<ReviewStatusOverrides>>;
  fieldEdits: Record<string, Record<string, InlineFieldEdit>>;
  setFieldEdits: Dispatch<
    SetStateAction<Record<string, Record<string, InlineFieldEdit>>>
  >;
  savedReferences: Record<string, Reference[]>;
  removedReferenceIds: Record<string, string[]>;
  rememberSavedReference: (slug: string, reference: Reference) => void;
  rememberRemovedReference: (slug: string, referenceId: string) => void;
}

/**
 * What the workbench's direct writes have put in Convex this session, kept
 * beside the shared working set rather than in it. Every entry here is
 * already persisted; the maps exist so the rendered article keeps showing
 * what the store now holds without dirtying the editor.
 */
export function useReviewOverlays(): ReviewOverlays {
  const [overrides, setOverrides] = useState<ReviewStatusOverrides>({});
  // Saved inline field edits, keyed by slug then by concrete field path. These
  // are already persisted; the map exists only so the rendered article keeps
  // showing what Convex now holds without touching the shared working set.
  //
  // `before` is what the working-set article held when the edit was saved. An
  // overlay entry addresses a concrete index, so the moment the working set
  // moves underneath it — a route reordered or removed, the same note edited
  // through the form — the entry is pointing at something else and has to go.
  const [fieldEdits, setFieldEdits] = useState<
    Record<string, Record<string, InlineFieldEdit>>
  >({});
  // Reference appends bypass the shared working set for the same reason as
  // field edits. Keep both direct-write results in the one article overlay so
  // a newly pasted marker can resolve against its newly saved source.
  const [savedReferences, setSavedReferences] = useState<
    Record<string, Reference[]>
  >({});
  // Reference deletes are the same kind of direct write: the working set still
  // lists the source, so the overlay has to mask it until a reload catches up.
  const [removedReferenceIds, setRemovedReferenceIds] = useState<
    Record<string, string[]>
  >({});
  const rememberSavedReference = useCallback((slug: string, reference: Reference) => {
    setSavedReferences((previous) => {
      const savedForArticle = previous[slug] ?? [];
      if (savedForArticle.some((saved) => saved.id === reference.id)) return previous;
      return { ...previous, [slug]: [...savedForArticle, reference] };
    });
    // Saving again resurrects a source removed earlier in the session.
    setRemovedReferenceIds((previous) => {
      const removedForArticle = previous[slug];
      if (!removedForArticle?.includes(reference.id)) return previous;
      return {
        ...previous,
        [slug]: removedForArticle.filter((id) => id !== reference.id),
      };
    });
  }, []);
  const rememberRemovedReference = useCallback((slug: string, referenceId: string) => {
    setSavedReferences((previous) => {
      const savedForArticle = previous[slug];
      if (!savedForArticle?.some((saved) => saved.id === referenceId)) return previous;
      return {
        ...previous,
        [slug]: savedForArticle.filter((saved) => saved.id !== referenceId),
      };
    });
    setRemovedReferenceIds((previous) => {
      const removedForArticle = previous[slug] ?? [];
      if (removedForArticle.includes(referenceId)) return previous;
      return { ...previous, [slug]: [...removedForArticle, referenceId] };
    });
  }, []);

  return {
    overrides,
    setOverrides,
    fieldEdits,
    setFieldEdits,
    savedReferences,
    removedReferenceIds,
    rememberSavedReference,
    rememberRemovedReference,
  };
}

/**
 * The inline field write (`/api/dev/article-field`) and its stale-read
 * companion, packaged as the context `EditableValue` consumes.
 */
export function useReviewFieldWrites({
  viewSlug,
  article,
  sourceArticles,
  draft,
  setFieldEdits,
}: {
  /** The slug of the article actually on screen. */
  viewSlug: string | null;
  article: SubstanceArticle | null;
  sourceArticles: SubstanceArticle[];
  draft: ReviewDraftHandle;
  setFieldEdits: ReviewOverlays["setFieldEdits"];
}): ArticleEditContextValue {
  // The commit handle handed to `EditableValue` must stay referentially stable,
  // or every keystroke-scale re-render would churn the whole article subtree.
  const draftRef = useRef(draft);
  draftRef.current = draft;

  // The slug of the article actually on screen. `currentSlug` is seeded from
  // the URL and the queue drops non-public articles, so a deep link to one of
  // those renders the head of the queue instead — writing to `currentSlug`
  // would stamp the visible article's text onto a different substance.
  const viewSlugRef = useRef<string | null>(viewSlug);
  viewSlugRef.current = viewSlug;
  const articleRef = useRef<SubstanceArticle | null>(article);
  articleRef.current = article;
  // The live Convex snapshot, which keeps arriving even while the working set
  // has frozen. It is the only thing on this client that knows what the store
  // holds once `articles` has stopped tracking it — and that gap is precisely
  // when an inline write gets refused as stale.
  const sourceArticlesRef = useRef(sourceArticles);
  sourceArticlesRef.current = sourceArticles;

  /**
   * Persist one inline field edit and reconcile it locally.
   *
   * Rejects with a message `EditableValue` renders inline. The dirty-form guard
   * is the important one: the editor tab holds a whole separate draft article,
   * and letting a field write land underneath it would make the next form save
   * silently revert the inline edit.
   */
  const commitArticleField = useCallback(
    async (
      path: string,
      value: EditableFieldValue,
      expected: EditableFieldValue,
    ): Promise<EditableFieldValue> => {
      const slug = viewSlugRef.current;
      if (!slug) {
        throw new Error("No article is selected.");
      }
      if (draftRef.current.formDirty) {
        throw new Error(
          "This article has unapplied editor form edits. Apply or discard them before editing inline.",
        );
      }

      const response = await fetch("/api/dev/article-field", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // `expected` is the whole safety story for indexed paths: the store
        // refuses the write unless it still holds what the screen showed.
        body: JSON.stringify({ slug, path, value, expected }),
      });
      // `code` is the branchable half of the write layer's rejection contract
      // and `error` is the sentence written for the reviewer. An internal
      // failure carries no code at all, so its presence is also the test for
      // "this refusal is actionable" — see `src/lib/http/convexRejection.ts`.
      // Never match on `error`: its wording is editorial copy.
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        code?: string;
        value?: EditableFieldValue;
      } | null;
      if (!response.ok) {
        throw new ArticleFieldCommitError(
          payload?.error ??
            "Unable to save that edit. Are you signed in as an editor?",
          payload?.code,
        );
      }
      // The mutation echoes what it stored; a shape it did not expect means the
      // local value is the better record of the write than the response is.
      const saved = asInlineFieldValue(payload?.value, value);

      // A fast edit-then-→ must never write one article's value into the next
      // article's mounted form, so both reconciliations are slug-guarded.
      if (viewSlugRef.current === slug) {
        // The overlay's `before` has to be the working set's real value, not
        // the client's claim about it — falling back to `expected` for anything
        // that is not a bare string would make every range overlay believe
        // itself current forever.
        const baseline = asInlineFieldValue(
          getArticleValueByPath(articleRef.current, path),
          expected,
        );
        setFieldEdits((previous) => ({
          ...previous,
          [slug]: {
            ...previous[slug],
            [path]: { before: baseline, value: saved },
          },
        }));

        const override = draftRef.current.formArticleOverride;
        if (override) {
          const updated = setArticleValueByPath(override, path, saved);
          draftRef.current.setFormArticleOverride(updated);
          draftRef.current.setStreamedOutput(buildArticleYamlDraft(updated));
        }
      }

      return saved;
    },
    [setFieldEdits],
  );

  /**
   * What the store now holds at one field path, for a field whose write was
   * just refused as stale.
   *
   * Read from the live Convex snapshot rather than from the rendered article,
   * because the rendered article is the stale party — it is the working set's
   * frozen draft, and `expected` was taken from it. Rather than an HTTP read:
   * this surface already holds a websocket subscription to the same document,
   * so the snapshot is both current and the value the page will settle on. A
   * separate fetch could answer differently and leave the field showing a value
   * the rest of the page then contradicts.
   */
  const refreshStoredValue = useCallback(
    (path: string, like: EditableFieldValue): EditableFieldValue | null => {
      const slug = viewSlugRef.current;
      if (!slug) return null;
      const source = sourceArticlesRef.current.find((candidate) => {
        const record = candidate as SubstanceArticle & { slug?: unknown };
        return typeof record.slug === "string" && record.slug === slug;
      });
      return readStoredInlineValue(source, path, like);
    },
    [],
  );

  return useMemo<ArticleEditContextValue>(
    () => ({ commit: commitArticleField, refreshStoredValue }),
    [commitArticleField, refreshStoredValue],
  );
}

interface ReviewLastTick {
  slug: string;
  name: string;
  previous: ReviewStatus;
}

export interface ReviewStatusWrites {
  isTicking: boolean;
  tickError: string | null;
  clearTickError: () => void;
  lastTick: ReviewLastTick | null;
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
 */
export function useReviewStatusWrites({
  current,
  viewSlug,
  typedArticles,
  draft,
  queueGroups,
  reviewedCount,
  setOverrides,
}: {
  current: ReviewQueueEntry | null;
  /** The slug of the article actually on screen; see `useReviewFieldWrites`. */
  viewSlug: string | null;
  typedArticles: SubstanceArticle[];
  draft: ReviewDraftHandle;
  queueGroups: ReviewQueueGroup[];
  reviewedCount: number;
  setOverrides: ReviewOverlays["setOverrides"];
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

  const viewSlugRef = useRef<string | null>(viewSlug);
  viewSlugRef.current = viewSlug;
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
      options?: { isUndo?: boolean },
    ) => {
      setIsTicking(true);
      setTickError(null);
      const previousReviewed = reviewedCount;
      try {
        const response = await fetch("/api/dev/editorial-review", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug, status }),
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

        // Keep the editor form's "Internal Review Tracking" fields agreeing
        // with the tick — but only when the form still shows this article.
        // A fast R-then-→ must never write one article's review into the
        // next article's mounted form.
        if (viewSlugRef.current === slug) {
          const form = draft.formRef.current;
          // The live form values, not `formArticleOverride`. The override is
          // the last *applied* article, so merging the review into it would
          // quietly throw away anything the reviewer has typed and not yet
          // applied — a tick is not an undo.
          const base = form?.methods.getValues() ?? draft.formArticleOverride;
          const review = payload?.editorial_review ?? {
            status,
            notes: base?.editorial_review?.notes ?? "",
          };
          if (base) {
            const updated = { ...base, editorial_review: review };
            draft.setFormArticleOverride(updated);
            draft.setStreamedOutput(buildArticleYamlDraft(updated));
            // `resetForm`, never a bare `setValue`: the raw setter notifies the
            // form's watch subscription, which reports a mutation and flips
            // `formDirty`. The mutation stamps a fresh `reviewed_at`, so the
            // written value always differs from the old one — which meant every
            // tick left the workbench believing it held unapplied edits and
            // challenged the move to the next article with a discard confirm.
            // `resetForm` wraps the same write in `runWithoutMutate`.
            form?.resetForm(updated);
          }
        }

        if (status === "completed" && !options?.isUndo) {
          setLastTick({ slug, name, previous: baseStatus });
          if (undoTimerRef.current !== null) window.clearTimeout(undoTimerRef.current);
          undoTimerRef.current = window.setTimeout(
            () => setLastTick(null),
            UNDO_WINDOW_MS,
          );

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
        } else {
          setLastTick(null);
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
    [draft, queueGroups, reviewedCount, setOverrides],
  );

  const articleStatus = useCallback((entrySlug: string): ReviewStatus => {
    const record = typedArticles.find((candidate) => {
      const withSlug = candidate as SubstanceArticle & { slug?: unknown };
      return typeof withSlug.slug === "string" && withSlug.slug === entrySlug;
    });
    const raw = record?.editorial_review?.status;
    return raw === "in_progress" || raw === "completed" ? raw : "needed";
  }, [typedArticles]);

  const toggleReviewed = useCallback(() => {
    if (!current || isTicking) return;
    void setReviewStatus(
      current.slug,
      current.name,
      current.status === "completed" ? "needed" : "completed",
      articleStatus(current.slug),
    );
  }, [articleStatus, current, isTicking, setReviewStatus]);

  const toggleFlagged = useCallback(() => {
    if (!current || isTicking) return;
    void setReviewStatus(
      current.slug,
      current.name,
      current.status === "in_progress" ? "needed" : "in_progress",
      articleStatus(current.slug),
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
    void setReviewStatus(
      lastTick.slug,
      lastTick.name,
      lastTick.previous,
      articleStatus(lastTick.slug),
      { isUndo: true },
    );
  }, [articleStatus, isTicking, lastTick, setReviewStatus]);

  return {
    isTicking,
    tickError,
    clearTickError,
    lastTick,
    milestone,
    celebration,
    toggleReviewed,
    toggleFlagged,
    undoLastTick,
    dismissCelebration,
  };
}
