"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { contentHash } from "../../../../../lib/proposals/contentHash";
import { prepareVCode } from "@/features/effects/vcode/editing";

import type {
  EditorActionStatusState,
  EditorNoticeMessage,
} from "@/features/dev/components";

import {
  checkSlugAvailability,
  draftFromRow,
  emptyWritingDraft,
  isSameDraft,
  parseTagList,
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
  const canSave =
    !readOnly &&
    !parsedBody.error &&
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
    async (status: WritingDraft["status"]) => {
      if ((readOnly && !uncertain) || saveState === "saving" || parsedBody.error) return;
      setSaveState("saving");
      setNotice(null);
      try {
        const document = {
          ...draft, slug: draft.slug.trim(), originalSlug: loadedRow?.slug,
          kind: loadedRow?.kind ?? kind, status, title: draft.title.trim(),
          tags: parseTagList(draft.tags), expectedRevision: loadedRow?.baseRevision ?? contentHash(null),
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
      } catch (error) {
        setSaveState("error");
        setNotice({
          tone: "danger",
          title: "Save failed",
          message: error instanceof Error ? error.message : "The article could not be saved.",
        });
      }
    },
    [draft, kind, loadedRow, refreshList, readOnly, parsedBody, uncertain, saveState],
  );
  const discard = useCallback(() => { if (uncertain || saveState === "saving") return; setDraft(baseline); setNotice(null); }, [baseline, uncertain, saveState]);
  const reconcile = useCallback(async () => {
    if (!loadedRow || uncertain || saveState === "saving") return;
    try {
      const response = await fetch(`${API_PATH}?slug=${encodeURIComponent(loadedRow.slug)}`);
      const payload = await response.json() as { article?: WritingArticleRow; error?: string };
      if (!response.ok || !payload.article) throw new Error(payload.error ?? "Unable to reload the published baseline.");
      setLoadedRow(payload.article);
      setBaseline(draftFromRow(payload.article));
      operationRef.current = null;
      setNotice({ tone: "warning", message: "Latest published baseline loaded. Your local edits are retained; review the diff before publishing." });
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
