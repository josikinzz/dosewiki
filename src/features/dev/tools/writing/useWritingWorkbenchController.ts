"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { contentHash } from "../../../../../lib/proposals/contentHash";
import { prepareVCode } from "@/features/effects/vcode/editing";

import { proposalSubmittedNotice, submitToolProposal } from "../proposalSubmission";

import type {
  EditorActionStatusState,
  EditorNoticeMessage,
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

const API_PATH = "/api/dev/writing-article";

type SaveState = EditorActionStatusState | "idle";
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
  const [notice, setNotice] = useState<EditorNoticeMessage | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  // A date input holding a half-typed day reports an empty value; the editor
  // says so here rather than saving no date without a word.
  const [dateIncomplete, setDateIncomplete] = useState(false);
  const slugTouchedRef = useRef(false);
  const operationRef = useRef<{ body: string; id: string } | null>(null);

  const refreshList = useCallback(async () => {
    if (contextual) { setEntries([]); return; }
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
      return;
    }

    let cancelled = false;
    setIsLoadingRow(true);
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
          setNotice({ tone: "danger", message: "That article is no longer there." });
          setLoadedRow(null);
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
          setNotice({
            tone: "danger",
            title: "Load failed",
            message: error instanceof Error ? error.message : "That article could not be loaded.",
          });
        }
      } finally {
        if (!cancelled) setIsLoadingRow(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedSlug]);

  const slugAvailability = checkSlugAvailability(draft.slug, entries ?? [], selectedSlug);
  const readOnly = isLoadingRow || saveState === "saving" || uncertain || (selectedSlug !== null && loadedRow === null);
  const parsedBody = useMemo(() => {
    try {
      return { ast: draft.bodyFormat === "vcode" ? prepareVCode(draft.body, { raw: loadedRow?.body_raw, ast: loadedRow?.body_ast }) : undefined, error: null };
    } catch (error) { return { ast: undefined, error: error instanceof Error ? error.message : "Invalid VCode." }; }
  }, [draft.body, draft.bodyFormat, loadedRow]);
  const isDirty = uncertain || !isSameDraft(draft, baseline);
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
  }, []);

  const startNew = useCallback(() => {
    if (uncertain || saveState === "saving") return;
    setSelection({ type: "new" });
    resetDraft();
  }, [resetDraft, uncertain, saveState]);

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
    setSelection({ type: "pinned" });
    resetDraft();
  }, [resetDraft, uncertain, saveState]);

  const selectRow = useCallback((slug: string) => {
    if (uncertain || saveState === "saving") return;
    setSelection({ type: "row", slug });
    setNotice(null);
  }, [uncertain, saveState]);

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

  const save = useCallback(
    /** Resolves true once the server confirmed the save; false when it did not happen. */
    async (status: WritingDraft["status"]): Promise<boolean> => {
      if ((readOnly && !uncertain) || saveState === "saving" || parsedBody.error) return false;
      setSaveState("saving");
      setNotice(null);
      try {
        const document = {
          ...draft, slug: draft.slug.trim(), originalSlug: loadedRow?.slug,
          kind: loadedRow?.kind ?? kind, status, title: draft.title.trim(),
          tags: draft.tags, expectedRevision: loadedRow?.baseRevision ?? contentHash(null),
          publicationDate: draft.publicationDate.trim() || undefined,
        };
        const serialized = JSON.stringify(document);
        if (operationRef.current?.body !== serialized) operationRef.current = { body: serialized, id: crypto.randomUUID() };
        setUncertain(true);
        const response = await fetch(API_PATH, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...document, operationId: operationRef.current.id }),
        });
        const payload = (await response.json()) as { slug?: string; error?: string; revision?: string };
        if (!response.ok) {
          if (response.status < 500) setUncertain(false);
          throw new Error(payload.error ?? "The article could not be saved.");
        }
        if (!payload.revision) throw new Error("The server did not confirm publication. Retry to reconcile this operation.");
        setUncertain(false);
        setLoadedRow(current => ({ ...current, ...document, body_raw: draft.body, body_ast: parsedBody.ast, baseRevision: payload.revision! }));
        // What was posted is the new baseline; anything typed meanwhile stays dirty.
        setBaseline({ ...draft, status });
        setDraft((current) => ({ ...current, status }));
        setSaveState("saved");
        setSelection({ type: "row", slug: draft.slug.trim() });
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
        setNotice({
          tone: "danger",
          title: "Save failed",
          message: error instanceof Error ? error.message : "The article could not be saved.",
        });
        return false;
      }
    },
    [draft, kind, loadedRow, refreshList, readOnly, parsedBody, uncertain, saveState],
  );
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
      setNotice({
        tone: "danger",
        title: "Submission failed",
        message: error instanceof Error ? error.message : "The proposal could not be submitted.",
      });
      return false;
    }
  }, [baseline, canSave, draft, kind, loadedRow]);
  const discard = useCallback(() => { if (uncertain || saveState === "saving") return; setDraft(baseline); setNotice(null); }, [baseline, uncertain, saveState]);
  const reconcile = useCallback(async () => {
    if (!loadedRow || uncertain || saveState === "saving") return;
    try {
      const response = await fetch(`${API_PATH}?slug=${encodeURIComponent(loadedRow.slug)}`);
      const payload = await response.json() as { article?: WritingArticleRow; error?: string };
      if (!response.ok || !payload.article) throw new Error(payload.error ?? "Unable to load the latest saved version.");
      setLoadedRow(payload.article);
      setBaseline(draftFromRow(payload.article));
      operationRef.current = null;
      setNotice({ tone: "warning", message: "Loaded the latest saved version. Your edits are kept; check what changed before you save." });
    } catch (error) { setNotice({ tone: "danger", message: error instanceof Error ? error.message : "Reload failed." }); }
  }, [loadedRow, uncertain, saveState]);

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
    isLoadingRow,
    saveState,
    uncertain,
    notice,
    listError,
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
    save,
  };
}

export type WritingWorkbenchController = ReturnType<typeof useWritingWorkbenchController>;
