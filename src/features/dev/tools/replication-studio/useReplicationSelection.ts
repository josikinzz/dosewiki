"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";

import type { StudioRow } from "./replicationStudioModel";
import type { StudioFeedback } from "./useReplicationCorpus";

export type SelectionStep = { key: "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown"; shift: boolean; perRow: number };

/**
 * The one selection model every workspace shares: which works are selected,
 * where the keyboard anchor sits, and the inspector draft that any change of
 * subject has to ask about first.
 */
export function useReplicationSelection({
  rows,
  visibleIds,
  setFeedback,
}: {
  rows: readonly StudioRow[];
  /** The ids the Library shows, in order: ranges and arrows walk these. */
  visibleIds: readonly string[];
  setFeedback: (feedback: StudioFeedback | null) => void;
}) {
  const [selection, setSelection] = useState<Set<string>>(() => new Set());
  const [anchor, setAnchor] = useState<string | null>(null);
  // Where a keyboard range starts: the last card chosen without Shift. The
  // anchor moves with every arrow; this stays put so Shift+arrows span it.
  const [rangeStart, setRangeStart] = useState<string | null>(null);
  // The inspector's draft is unsaved work: anything that would swap its
  // subject (a click, an arrow, Esc, a workspace change) waits on a discard.
  const [editorDirty, setEditorDirty] = useState(false);
  const [pendingDiscard, setPendingDiscard] = useState<{ run: () => void } | null>(null);

  const selectedRows = useMemo(
    () => rows.filter((row) => selection.has(row.id)),
    [rows, selection],
  );

  const selectOnly = useCallback((id: string) => {
    setSelection(new Set([id]));
    setAnchor(id);
    setRangeStart(id);
  }, []);

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
  const cancelDiscard = useCallback(() => setPendingDiscard(null), []);

  const clearSelection = useCallback(
    () =>
      guardDraft(() => {
        setSelection(new Set());
        setAnchor(null);
        setRangeStart(null);
      }),
    [guardDraft],
  );

  const inspectRow = useCallback(
    (slug: string) => {
      const row = rows.find((entry) => entry.slug === slug);
      if (!row) {
        setFeedback({ tone: "danger", message: `No corpus row is named ${slug}.` });
        return;
      }
      guardDraft(() => selectOnly(row.id));
    },
    [guardDraft, rows, selectOnly, setFeedback],
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

  /** One arrow press: moves the anchor, and with Shift spans from the range start. */
  const step = useCallback(
    ({ key, shift, perRow }: SelectionStep) => {
      if (visibleIds.length === 0) return;
      const delta =
        key === "ArrowRight" ? 1 : key === "ArrowLeft" ? -1 : key === "ArrowDown" ? perRow : -perRow;
      const current = anchor && visibleIds.includes(anchor) ? visibleIds.indexOf(anchor) : -1;
      const nextIndex =
        current === -1 ? 0 : Math.max(0, Math.min(visibleIds.length - 1, current + delta));
      const id = visibleIds[nextIndex];
      // Shift+arrow spans from where the range started to the new anchor, so
      // stepping back shrinks the range instead of adding one more card.
      const start = rangeStart && visibleIds.includes(rangeStart) ? rangeStart : anchor;
      let next: Set<string>;
      if (shift && start && visibleIds.includes(start)) {
        const from = visibleIds.indexOf(start);
        const [low, high] = from < nextIndex ? [from, nextIndex] : [nextIndex, from];
        next = new Set(visibleIds.slice(low, high + 1));
      } else {
        next = new Set([id]);
      }
      guardDraft(() => {
        setSelection(next);
        setAnchor(id);
        if (!shift || !start) setRangeStart(id);
      });
    },
    [anchor, guardDraft, rangeStart, visibleIds],
  );

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
    selectOnly(row.id);
  }, [editorDirty, revealSlug, rows, selectOnly]);

  return {
    selection,
    anchor,
    selectedRows,
    guardDraft,
    pendingDiscard: pendingDiscard !== null,
    confirmDiscard,
    cancelDiscard,
    setEditorDirty,
    clearSelection,
    inspectRow,
    onCardActivate,
    step,
    reveal: setRevealSlug,
  };
}

export type ReplicationSelection = ReturnType<typeof useReplicationSelection>;
