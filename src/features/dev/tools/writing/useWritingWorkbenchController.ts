"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  EditorActionStatusState,
  EditorNoticeMessage,
} from "@/features/dev/components";

import {
  checkSlugAvailability,
  draftFromRow,
  emptyWritingDraft,
  isEditableHere,
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
};

export function useWritingWorkbenchController({
  initialKind = "article",
  pinnedEntryId,
  initialSelection,
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
  const [loadedRow, setLoadedRow] = useState<WritingArticleRow | null>(null);
  const [isLoadingRow, setIsLoadingRow] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [notice, setNotice] = useState<EditorNoticeMessage | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const slugTouchedRef = useRef(false);

  const refreshList = useCallback(async () => {
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
  }, []);

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
        setKind(payload.article.kind ?? "article");
        setLoadedRow(payload.article);
        setDraft(draftFromRow(payload.article));
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
  const readOnly = loadedRow !== null && !isEditableHere(loadedRow);
  const canSave =
    !readOnly &&
    draft.title.trim().length > 0 &&
    (slugAvailability.state === "free" || slugAvailability.state === "current") &&
    saveState !== "saving";

  const startNew = useCallback(() => {
    slugTouchedRef.current = false;
    setSelection({ type: "new" });
    setLoadedRow(null);
    setDraft(emptyWritingDraft());
    setSaveState("idle");
    setNotice(null);
  }, []);

  // The kind filter. A loaded row of the other kind cannot stay open under a
  // rail that no longer lists it, so the editor drops to a fresh draft of the
  // new kind; an unsaved draft has no kind yet and follows the filter, and the
  // pinned entry belongs to no kind at all.
  const selectKind = useCallback(
    (next: WritingKind) => {
      setKind(next);
      if (selection.type === "row" && loadedRow && (loadedRow.kind ?? "article") !== next) {
        startNew();
      }
    },
    [loadedRow, selection.type, startNew],
  );

  const selectPinned = useCallback(() => {
    setSelection({ type: "pinned" });
    setNotice(null);
  }, []);

  const selectRow = useCallback((slug: string) => {
    setSelection({ type: "row", slug });
    setNotice(null);
  }, []);

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

  const toggleByline = useCallback((key: string) => {
    setDraft((current) => ({
      ...current,
      authorProfileKeys: current.authorProfileKeys.includes(key)
        ? current.authorProfileKeys.filter((entry) => entry !== key)
        : [...current.authorProfileKeys, key],
    }));
  }, []);

  const save = useCallback(
    async (status: WritingDraft["status"]) => {
      setSaveState("saving");
      setNotice(null);
      try {
        const response = await fetch(API_PATH, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            slug: draft.slug.trim(),
            // The loaded row keeps its own slug and kind: a differing slug is a
            // rename of that row, and the kind is the row's, not the tab's.
            originalSlug: loadedRow?.slug,
            kind: loadedRow ? (loadedRow.kind ?? "article") : kind,
            status,
            title: draft.title.trim(),
            teaser: draft.teaser,
            coverImageUrl: draft.coverImageUrl,
            body: draft.body,
            tags: parseTagList(draft.tags),
            authorProfileKeys: draft.authorProfileKeys,
            publicationDate: draft.publicationDate.trim() || undefined,
          }),
        });
        const payload = (await response.json()) as { slug?: string; error?: string };
        if (!response.ok) {
          throw new Error(payload.error ?? "The article could not be saved.");
        }
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
    [draft, kind, loadedRow, refreshList],
  );

  return {
    kind,
    entries,
    selection,
    kindEntries,
    selectedSlug,
    draft,
    isLoadingRow,
    saveState,
    notice,
    listError,
    slugAvailability,
    readOnly,
    canSave,
    startNew,
    selectKind,
    selectPinned,
    selectRow,
    updateTitle,
    updateSlug,
    updateDraft,
    toggleByline,
    save,
  };
}

export type WritingWorkbenchController = ReturnType<typeof useWritingWorkbenchController>;
