"use client";

import { z } from "zod";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { contentHash } from "../../../../../lib/proposals/contentHash";
import { mergeThreeWay, type MergeSide, type ThreeWayMerge } from "../../../../../lib/proposals/threeWayMerge";
import { prepareVCode } from "@/features/effects/vcode/editing";

import { proposalSubmittedNotice, submitToolProposal } from "../proposalSubmission";
import { useDraftRecoveryStore } from "@/features/dev/recovery/DraftRecoveryContext";
import { isWriteFreezeRefusal } from "@/features/dev/components/writeFreeze";
import type { DraftCheckpoint } from "@/features/dev/recovery/draftRecovery";

import type {
  EditorActionStatusState,
  NoticeMessage,
} from "@/features/dev/components";

import {
  checkSlugAvailability,
  draftFromRow,
  emptyWritingDraft,
  coverImageUrlError,
  isSameDraft,
  publicationDateError,
  sortWritingEntries,
  suggestSlug,
  type WritingArticleRow,
  type WritingDraft,
  type WritingKind,
  type WritingListEntry,
} from "./writingEditorModel";

const writingSaveResult = z.object({
  ok: z.literal(true), slug: z.string(), created: z.boolean(),
  revision: z.string().regex(/^[a-f0-9]{64}$/), operationId: z.string(),
  intent: z.enum(["save-unpublished", "publish"]),
});

const API_PATH = "/api/dev/writing-article";
/** The revision a row that does not exist yet is saved against. */
const NEW_ROW_REVISION = contentHash(null);
/** How long typing pauses before the browser recovery copy is rewritten. */
const CHECKPOINT_DELAY_MS = 400;

/** A recovery copy found for the open record, waiting on the editor's choice. */
export type WritingRecoveryOffer = {
  checkpoint: DraftCheckpoint<WritingDraft>;
  /** The copy was made against an older saved version than the one now loaded. */
  stale: boolean;
};

/**
 * The local draft meeting a newer saved version: a recovered copy made against
 * an older version, or the editor's open edits after "Load the latest saved
 * version". `base` is the version the local draft was edited from, or null
 * for a copy kept before copies recorded it, where every differing field is
 * the editor's to choose.
 */
export type WritingMergeReview = {
  source: "recovery" | "reload";
  base: WritingDraft | null;
  mine: WritingDraft;
  theirs: WritingDraft;
  choices: Record<string, MergeSide>;
};

/** The proposed draft and what overlaps, for one review and its choices. */
export function writingMerge(review: WritingMergeReview): ThreeWayMerge<WritingDraft> {
  return mergeThreeWay<WritingDraft>(review.base ?? {}, review.mine, review.theirs, { choices: review.choices });
}

/** A reviewed command binds the exact key, baseline, payload and resource intent. */
export type WritingSaveCommand = { body: string; intent: "save-unpublished" | "publish" };

type SaveState = EditorActionStatusState | "idle";
/**
 * Why the last save or submission did not land, when the route said: someone
 * saved the row after it was opened (409), or the write freeze refused it
 * (503 with the freeze code). Anything else is `other`.
 */
export type WritingSaveFailure = "conflict" | "frozen" | "other";
export type WritingSelection =
  | { type: "pinned" }
  | { type: "new" }
  | { type: "row"; slug: string };

type WritingControllerOptions = {
  /** The kind filter the rail opens on; what a new row is saved as. */
  initialKind?: WritingKind;
  pinnedEntryId?: string;
  initialSelection?: string;
  contextual?: boolean;
};

export function useWritingWorkbenchController({
  initialKind = "article",
  pinnedEntryId,
  initialSelection,
  contextual = false,
}: WritingControllerOptions) {
  // The rail's kind filter. A deep link can open a row of the other kind
  // (`/dev/writing/<blog slug>`): loading such a row moves the filter to the
  // row's kind; the row itself is never relabelled to match the filter.
  const [kind, setKind] = useState<WritingKind>(initialKind);
  const [entries, setEntries] = useState<WritingListEntry[] | null>(null);
  const [selection, setSelection] = useState<WritingSelection>(() =>
    pinnedEntryId && (!initialSelection || initialSelection === pinnedEntryId)
      ? { type: "pinned" }
      : initialSelection
        ? { type: "row", slug: initialSelection }
        : { type: "new" },
  );
  const [draft, setDraft] = useState<WritingDraft>(emptyWritingDraft);
  // The draft as it was loaded or last saved; `isDirty` is the distance from it.
  const [baseline, setBaseline] = useState<WritingDraft>(() => draft);
  const [loadedRow, setLoadedRow] = useState<WritingArticleRow | null>(null);
  const [isLoadingRow, setIsLoadingRow] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [uncertain, setUncertain] = useState(false);
  const [notice, setNotice] = useState<NoticeMessage | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(false);
  const [saveFailure, setSaveFailure] = useState<WritingSaveFailure | null>(null);
  // The open row's read: a failure the pane shows with Try again, a slug no
  // row carries (a stale deep link), and the counter Try again bumps.
  const [rowError, setRowError] = useState<string | null>(null);
  const [missingSlug, setMissingSlug] = useState<string | null>(null);
  const [rowAttempt, setRowAttempt] = useState(0);
  // A date input holding a half-typed day reports an empty value; the editor
  // says so here rather than saving no date without a word.
  const [dateIncomplete, setDateIncomplete] = useState(false);
  const slugTouchedRef = useRef(false);
  const operationRef = useRef<{ body: string; id: string } | null>(null);
  // Draft recovery (see `draftRecovery.ts`): a browser copy of the open
  // record's unsaved work, scoped to the signed-in account. Absent outside the
  // /dev shell, where nothing is kept.
  const recoveryStore = useDraftRecoveryStore();
  const [recoveryOffer, setRecoveryOffer] = useState<WritingRecoveryOffer | null>(null);
  const [mergeReview, setMergeReview] = useState<WritingMergeReview | null>(null);
  const merge = useMemo(() => mergeReview ? writingMerge(mergeReview) : null, [mergeReview]);
  const [checkpointSavedAt, setCheckpointSavedAt] = useState<number | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const checkedRecordRef = useRef<string | null>(null);
  // The copy not yet written when typing last paused; written on unmount and
  // page hide so a reload keeps the last keystrokes.
  const flushRef = useRef<(() => void) | null>(null);

  const refreshList = useCallback(async () => {
    if (contextual) { setEntries([]); return; }
    setListLoading(true);
    try {
      const response = await fetch(API_PATH);
      const payload = (await response.json()) as {
        articles?: WritingListEntry[];
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "The article list could not be loaded.");
      }
      setEntries(payload.articles ?? []);
      setListError(null);
    } catch (error) {
      setEntries([]);
      setListError(
        error instanceof Error ? error.message : "The article list could not be loaded.",
      );
    } finally {
      setListLoading(false);
    }
  }, [contextual]);

  useEffect(() => {
    void refreshList();
  }, [refreshList]);

  const kindEntries = useMemo(
    () => sortWritingEntries((entries ?? []).filter((entry) => entry.kind === kind)),
    [entries, kind],
  );
  const selectedSlug = selection.type === "row" ? selection.slug : null;

  useEffect(() => {
    if (!selectedSlug) {
      setLoadedRow(null);
      setRowError(null);
      return;
    }

    let cancelled = false;
    setIsLoadingRow(true);
    setRowError(null);
    void (async () => {
      try {
        const response = await fetch(`${API_PATH}?slug=${encodeURIComponent(selectedSlug)}`);
        const payload = (await response.json()) as {
          article?: WritingArticleRow | null;
          error?: string;
        };
        if (!response.ok) {
          throw new Error(payload.error ?? "That article could not be loaded.");
        }
        if (cancelled) return;
        if (!payload.article) {
          setLoadedRow(null);
          // In the workbench a slug nothing carries (a stale link) warns at
          // the list and falls back to the pinned entry; the contextual panel
          // has nowhere to fall back to, so it says so where it is.
          if (pinnedEntryId) {
            setMissingSlug(selectedSlug);
            setSelection({ type: "pinned" });
          } else {
            setNotice({ tone: "danger", message: "That article is no longer there." });
          }
          return;
        }
        slugTouchedRef.current = true;
        const loaded = draftFromRow(payload.article);
        setKind(payload.article.kind ?? "article");
        setLoadedRow(payload.article);
        setDraft(loaded);
        setBaseline(loaded);
        setSaveState("idle");
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : "That article could not be loaded.";
          setRowError(message);
          setNotice({ tone: "danger", title: "Load failed", message });
        }
      } finally {
        if (!cancelled) setIsLoadingRow(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedSlug, rowAttempt, pinnedEntryId]);

  /** Reads the open row again after its read failed. */
  const retryRow = useCallback(() => {
    setNotice(null);
    setRowAttempt((value) => value + 1);
  }, []);

  const slugAvailability = checkSlugAvailability(draft.slug, entries ?? [], selectedSlug);
  // A recovery choice holds the form still, so nothing typed can land under
  // (or be overwritten by) the copy the editor is deciding about.
  const readOnly = isLoadingRow || saveState === "saving" || uncertain || (selectedSlug !== null && loadedRow === null)
    || recoveryOffer !== null || mergeReview !== null;
  const parsedBody = useMemo(() => {
    try {
      return { ast: draft.bodyFormat === "vcode" ? prepareVCode(draft.body, { raw: loadedRow?.body_raw, ast: loadedRow?.body_ast }) : undefined, error: null };
    } catch (error) { return { ast: undefined, error: error instanceof Error ? error.message : "Invalid VCode." }; }
  }, [draft.body, draft.bodyFormat, loadedRow]);
  const isDirty = uncertain || !isSameDraft(draft, baseline);

  // The recovery record: the open row, or the one unsaved new draft.
  const recordKey = selection.type === "row" ? `row:${selection.slug}` : selection.type === "new" ? "new" : null;
  const baselineRevision = loadedRow?.baseRevision ?? NEW_ROW_REVISION;
  const recordReady = selection.type === "new"
    ? loadedRow === null
    : selection.type === "row" && !isLoadingRow && loadedRow?.slug === selection.slug;

  useEffect(() => {
    if (!recoveryStore || !recordKey || !recordReady) return;
    // The first look at a record reads its copy before anything can write one.
    const checkKey = `${recoveryStore.actor}|${recordKey}`;
    if (checkedRecordRef.current !== checkKey) {
      checkedRecordRef.current = checkKey;
      const found = recoveryStore.read<WritingDraft>("writing", recordKey);
      if (found && (found.pending || !isSameDraft(found.draft, draft))) {
        setRecoveryOffer({ checkpoint: found, stale: found.baseline !== baselineRevision });
        return;
      }
    }
    // An open choice keeps the copy as it is; an unconfirmed save owns it.
    if (recoveryOffer || mergeReview || uncertain) return;
    if (isSameDraft(draft, baseline)) {
      flushRef.current = null;
      recoveryStore.clear("writing", recordKey);
      setCheckpointSavedAt(null);
      return;
    }
    const write = () => {
      flushRef.current = null;
      const at = recoveryStore.write<WritingDraft>({ tool: "writing", record: recordKey, baseline: baselineRevision, base: baseline, draft });
      setCheckpointSavedAt(at);
    };
    flushRef.current = write;
    const timer = window.setTimeout(write, CHECKPOINT_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [recoveryStore, recordKey, recordReady, draft, baseline, baselineRevision, recoveryOffer, mergeReview, uncertain]);

  useEffect(() => {
    const flush = () => flushRef.current?.();
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, []);

  /** Drops the open record's copy: the editor discarded it or moved on after being asked. */
  const forgetRecovery = useCallback(() => {
    flushRef.current = null;
    if (recoveryStore && recordKey) recoveryStore.clear("writing", recordKey);
    setCheckpointSavedAt(null);
    setRecoveryOffer(null);
    setMergeReview(null);
  }, [recoveryStore, recordKey]);
  const dateError = dateIncomplete ? "Finish the date, or clear the field." : publicationDateError(draft.publicationDate);
  const coverError = coverImageUrlError(draft.coverImageUrl);
  const canSave =
    !readOnly &&
    !parsedBody.error &&
    !dateError &&
    !coverError &&
    draft.title.trim().length > 0 &&
    (slugAvailability.state === "free" || slugAvailability.state === "current");

  const resetDraft = useCallback(() => {
    const empty = emptyWritingDraft();
    slugTouchedRef.current = false;
    setLoadedRow(null);
    setDraft(empty);
    setBaseline(empty);
    setSaveState("idle");
    setNotice(null);
    setSaveFailure(null);
  }, []);

  const startNew = useCallback(() => {
    if (uncertain || saveState === "saving") return;
    forgetRecovery();
    setSelection({ type: "new" });
    resetDraft();
  }, [forgetRecovery, resetDraft, uncertain, saveState]);

  // The kind filter. A loaded row of the other kind cannot stay open under a
  // rail that no longer lists it, so the editor drops to a fresh draft of the
  // new kind; an unsaved draft has no kind yet and follows the filter, and the
  // pinned entry belongs to no kind at all.
  const selectKind = useCallback(
    (next: WritingKind) => {
      if (uncertain || saveState === "saving") return;
      setKind(next);
      if (selection.type === "row" && loadedRow && (loadedRow.kind ?? "article") !== next) {
        startNew();
      }
    },
    [loadedRow, selection.type, startNew, uncertain, saveState],
  );

  // The pinned entry edits its own document, so the writing draft it replaces
  // is dropped rather than kept dirty behind it.
  const selectPinned = useCallback(() => {
    if (uncertain || saveState === "saving") return;
    forgetRecovery();
    setSelection({ type: "pinned" });
    resetDraft();
  }, [forgetRecovery, resetDraft, uncertain, saveState]);

  const selectRow = useCallback((slug: string) => {
    if (uncertain || saveState === "saving") return;
    forgetRecovery();
    setSelection({ type: "row", slug });
    setNotice(null);
    setSaveFailure(null);
    setMissingSlug(null);
  }, [forgetRecovery, uncertain, saveState]);

  const updateTitle = useCallback((title: string) => {
    setDraft((current) => ({
      ...current,
      title,
      slug: slugTouchedRef.current ? current.slug : suggestSlug(title),
    }));
  }, []);

  const updateSlug = useCallback((slug: string) => {
    slugTouchedRef.current = true;
    setDraft((current) => ({ ...current, slug }));
  }, []);

  const updateDraft = useCallback((patch: Partial<WritingDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
  }, []);

  const setByline = useCallback((authorProfileKeys: string[]) => {
    setDraft((current) => ({ ...current, authorProfileKeys }));
  }, []);

  const canSaveUnpublished = draft.status === "draft" && (selection.type === "new" || loadedRow?.status === "draft");
  const reviewedSaveCommand = useMemo<WritingSaveCommand>(() => {
    const intent = canSaveUnpublished ? "save-unpublished" : "publish";
    return { intent, body: JSON.stringify({
      ...draft, slug: draft.slug.trim(), originalSlug: loadedRow?.slug,
      kind: loadedRow?.kind ?? kind, title: draft.title.trim(),
      expectedRevision: loadedRow?.baseRevision ?? NEW_ROW_REVISION,
      publicationDate: draft.publicationDate.trim() || undefined, intent,
    }) };
  }, [draft, loadedRow, kind, canSaveUnpublished]);
  const currentCommandRef = useRef(reviewedSaveCommand);
  currentCommandRef.current = reviewedSaveCommand;

  const executeSave = useCallback(
    async (serialized: string, retry = false): Promise<boolean> => {
      if ((readOnly && !uncertain) || saveState === "saving" || parsedBody.error || (uncertain && !retry)) return false;
      setSaveState("saving");
      setNotice(null);
      setSaveFailure(null);
      const savingRecord = recordKey;
      try {
        // An unconfirmed operation is replayed exactly as it first left, with
        // its own id, so the server answers with the outcome it recorded.
        const document = JSON.parse(serialized) as WritingDraft & { expectedRevision: string; kind: WritingKind; originalSlug?: string; intent?: WritingSaveCommand["intent"] };
        const status = document.status;
        if (operationRef.current?.body !== serialized) operationRef.current = { body: serialized, id: crypto.randomUUID() };
        // The operation's identity is kept before it leaves, so a lost answer
        // survives a reload and is reconciled rather than sent again.
        if (recoveryStore && savingRecord) {
          flushRef.current = null;
          recoveryStore.write<WritingDraft>({
            tool: "writing", record: savingRecord, baseline: document.expectedRevision, base: baseline, draft, pending: operationRef.current,
          });
        }
        setUncertain(true);
        const response = await fetch(API_PATH, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...document, operationId: operationRef.current.id }),
        });
        const payload: unknown = await response.json();
        if (!response.ok) {
          const frozen = isWriteFreezeRefusal(response.status, payload);
          setSaveFailure(response.status === 409 ? "conflict" : frozen ? "frozen" : "other");
          // The freeze answers before any statement runs, so it is as definite
          // as a 4xx: nothing was written and nothing waits on confirmation.
          if (!retry && (response.status < 500 || frozen)) {
            // Only the first attempt can establish that this operation never ran.
            // A retry refusal says nothing about the earlier unknown outcome.
            setUncertain(false);
            if (recoveryStore && savingRecord) {
              recoveryStore.write<WritingDraft>({ tool: "writing", record: savingRecord, baseline: document.expectedRevision, base: baseline, draft });
            }
          }
          throw new Error(z.object({ error: z.string() }).safeParse(payload).data?.error ?? "The article could not be saved.");
        }
        const confirmed = writingSaveResult.safeParse(payload);
        if (!confirmed.success || confirmed.data.slug !== document.slug || confirmed.data.operationId !== operationRef.current.id || confirmed.data.intent !== document.intent) {
          throw new Error("The server did not confirm this Writing operation. Retry to confirm it.");
        }
        setUncertain(false);
        if (recoveryStore && savingRecord) recoveryStore.clear("writing", savingRecord);
        setCheckpointSavedAt(null);
        setSavedAt(Date.now());
        const savedRow = { ...loadedRow, ...document, body_raw: document.body, body_ast: document.bodyFormat === "vcode" ? prepareVCode(document.body, { raw: loadedRow?.body_raw, ast: loadedRow?.body_ast }) : undefined, baseRevision: confirmed.data.revision };
        const savedDraft = draftFromRow(savedRow);
        setLoadedRow(savedRow);
        setBaseline(savedDraft);
        setDraft(savedDraft);
        operationRef.current = null;
        setSaveState("saved");
        setSelection({ type: "row", slug: document.slug });
        setNotice({
          tone: "success",
          message:
            status === "published"
              ? "Published. The public pages are rebuilding with it now."
              : "Saved as a draft. It stays off the public site until you publish it.",
        });
        await refreshList();
        return true;
      } catch (error) {
        setSaveState("error");
        setSaveFailure((current) => current ?? "other");
        setNotice({
          tone: "danger",
          title: "Save failed",
          message: error instanceof Error ? error.message : "The article could not be saved.",
        });
        return false;
      }
    },
    [draft, baseline, loadedRow, refreshList, readOnly, parsedBody, uncertain, saveState, recordKey, recoveryStore],
  );
  /** The shell receives only this draft-to-draft owner operation. */
  const saveUnpublished = useCallback((): Promise<boolean> => {
    const command = currentCommandRef.current;
    return command.intent === "save-unpublished" ? executeSave(command.body) : Promise.resolve(false);
  }, [executeSave]);
  const saveReviewed = useCallback((command: WritingSaveCommand): Promise<boolean> => {
    if (command.body !== currentCommandRef.current.body || command.intent !== currentCommandRef.current.intent) return Promise.resolve(false);
    return executeSave(command.body);
  }, [executeSave]);
  /** Replay retains the original intent, identity and payload, including legacy missing intent. */
  const retrySave = useCallback((): Promise<boolean> => {
    return uncertain && operationRef.current ? executeSave(operationRef.current.body, true) : Promise.resolve(false);
  }, [executeSave, uncertain]);
  /**
   * An editor's save: the same document the admin's save posts, held as a
   * proposal for an admin to approve. The proposal holds the edit now, so the
   * editor returns to the saved version and a resubmit needs a new edit.
   */
  const submitForReview = useCallback(async (): Promise<boolean> => {
    if (!canSave) return false;
    // A proposal never renames: the slug is the saved row's key.
    if (loadedRow && draft.slug.trim() !== loadedRow.slug) return false;
    setSaveState("saving");
    setNotice(null);
    setSaveFailure(null);
    const rowKind = loadedRow?.kind ?? kind;
    const title = draft.title.trim();
    const label = rowKind === "blog" ? "blog post" : "article";
    try {
      const { proposalId } = await submitToolProposal({
        payload: {
          writing: {
            slug: draft.slug.trim(), kind: rowKind, status: draft.status, bodyFormat: draft.bodyFormat,
            title, teaser: draft.teaser, coverImageUrl: draft.coverImageUrl, body: draft.body,
            tags: draft.tags, authorProfileKeys: draft.authorProfileKeys,
            publicationDate: draft.publicationDate.trim() || undefined,
          },
        },
        summary: `${loadedRow ? "Update" : "New"} ${label} “${title}”`,
        baselines: [{ kind: "writing", key: draft.slug.trim(), document: loadedRow }],
      });
      // The proposal holds the edit now; the browser copy has done its job.
      forgetRecovery();
      if (loadedRow) {
        setDraft(baseline);
      } else {
        const empty = emptyWritingDraft();
        slugTouchedRef.current = false;
        setDraft(empty);
        setBaseline(empty);
      }
      setSaveState("idle");
      setNotice(proposalSubmittedNotice(`“${title}”`, proposalId));
      return true;
    } catch (error) {
      setSaveState("error");
      setSaveFailure("other");
      setNotice({
        tone: "danger",
        title: "Submission failed",
        message: error instanceof Error ? error.message : "The proposal could not be submitted.",
      });
      return false;
    }
  }, [baseline, canSave, draft, forgetRecovery, kind, loadedRow]);
  const discard = useCallback(() => {
    if (uncertain || saveState === "saving") return;
    forgetRecovery();
    setDraft(baseline);
    setNotice(null);
    setSaveFailure(null);
  }, [baseline, forgetRecovery, uncertain, saveState]);

  /**
   * Puts a recovery copy back. A copy of the loaded version replaces the
   * draft. A copy made against an older version is merged with the newer
   * saved version: what only one side changed is kept, and each field both
   * changed holds the saved value until the editor picks a version. A copy
   * holding an unconfirmed save brings that exact operation back, so the next
   * write is its confirmation, not a new save.
   */
  const restoreRecovery = useCallback(() => {
    if (!recoveryOffer) return;
    const { checkpoint, stale } = recoveryOffer;
    setRecoveryOffer(null);
    slugTouchedRef.current = true;
    if (checkpoint.pending) {
      operationRef.current = checkpoint.pending;
      setDraft(checkpoint.draft);
      setUncertain(true);
      return;
    }
    if (!stale) {
      setDraft(checkpoint.draft);
      return;
    }
    const review: WritingMergeReview = { source: "recovery", base: checkpoint.base ?? null, mine: checkpoint.draft, theirs: draft, choices: {} };
    setMergeReview(review);
    setDraft(writingMerge(review).merged);
  }, [recoveryOffer, draft]);
  const discardRecovery = useCallback(() => {
    if (!recoveryOffer) return;
    forgetRecovery();
  }, [forgetRecovery, recoveryOffer]);
  /** Picks one side for a field both changed; the proposed draft follows at once. */
  const chooseMerge = useCallback((path: string, side: MergeSide) => {
    if (!mergeReview) return;
    const next = { ...mergeReview, choices: { ...mergeReview.choices, [path]: side } };
    setMergeReview(next);
    setDraft(writingMerge(next).merged);
  }, [mergeReview]);
  /**
   * Ends the review once every overlap has a chosen version; the merged draft
   * then becomes the working draft and the browser copy.
   */
  const finishMergeReview = useCallback(() => {
    if (!merge || merge.unresolved.length > 0) return;
    setMergeReview(null);
  }, [merge]);
  const dismissNotice = useCallback(() => setNotice(null), []);
  const dismissMissing = useCallback(() => setMissingSlug(null), []);
  const reconcile = useCallback(async () => {
    if (!loadedRow || uncertain || saveState === "saving") return;
    try {
      const response = await fetch(`${API_PATH}?slug=${encodeURIComponent(loadedRow.slug)}`);
      const payload = await response.json() as { article?: WritingArticleRow; error?: string };
      if (!response.ok || !payload.article) throw new Error(payload.error ?? "Unable to load the latest saved version.");
      const latest = draftFromRow(payload.article);
      // The edits were made from `baseline`; the newer version is merged into
      // them rather than laid beside them, and the save that follows is
      // checked against this newer revision.
      const review: WritingMergeReview = { source: "reload", base: baseline, mine: draft, theirs: latest, choices: {} };
      const merged = writingMerge(review);
      setLoadedRow(payload.article);
      setBaseline(latest);
      setDraft(merged.merged);
      operationRef.current = null;
      setSaveFailure(null);
      if (merged.conflicts.length > 0 || merged.theirs.length > 0) setMergeReview(review);
      setNotice({
        tone: "warning",
        message: merged.conflicts.length > 0
          ? "Loaded the latest saved version. Changes only one of you made are merged; choose a version for each field you both changed."
          : merged.theirs.length > 0
            ? "Loaded the latest saved version and merged it with your edits. Nothing overlapped; check the draft before you save."
            : "Loaded the latest saved version. It matched the version you started from, so your edits are unchanged.",
      });
    } catch (error) { setNotice({ tone: "danger", message: error instanceof Error ? error.message : "Reload failed." }); }
  }, [loadedRow, uncertain, saveState, baseline, draft]);

  return {
    kind,
    entries,
    selection,
    kindEntries,
    selectedSlug,
    draft,
    baseline,
    loadedRow,
    parsedBody,
    discard,
    reconcile,
    recoveryOffer,
    mergeReview,
    merge,
    restoreRecovery,
    discardRecovery,
    chooseMerge,
    finishMergeReview,
    checkpointSavedAt,
    savedAt,
    isLoadingRow,
    saveState,
    uncertain,
    notice,
    dismissNotice,
    saveFailure,
    listError,
    listLoading,
    retryList: refreshList,
    rowError,
    retryRow,
    missingSlug,
    dismissMissing,
    slugAvailability,
    readOnly,
    isDirty,
    canSave,
    dateError,
    coverError,
    setDateIncomplete,
    submitForReview,
    startNew,
    selectKind,
    selectPinned,
    selectRow,
    updateTitle,
    updateSlug,
    updateDraft,
    setByline,
    canSaveUnpublished,
    reviewedSaveCommand,
    saveUnpublished,
    saveReviewed,
    retrySave,
  };
}

export type WritingWorkbenchController = ReturnType<typeof useWritingWorkbenchController>;
