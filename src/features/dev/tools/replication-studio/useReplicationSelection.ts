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

export function useReplicationSelection({
  rows,
  visibleIds,
  setFeedback,
}: {
  rows: readonly StudioRow[];
  visibleIds: readonly string[];
  setFeedback: (feedback: StudioFeedback | null) => void;
}) {
  const [selection, setSelection] = useState<Set<string>>(() => new Set());
  const [anchor, setAnchor] = useState<string | null>(null);
  const [rangeStart, setRangeStart] = useState<string | null>(null);
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

  const step = useCallback(
    ({ key, shift, perRow }: SelectionStep) => {
      if (visibleIds.length === 0) return;
      const delta =
        key === "ArrowRight" ? 1 : key === "ArrowLeft" ? -1 : key === "ArrowDown" ? perRow : -perRow;
      const current = anchor && visibleIds.includes(anchor) ? visibleIds.indexOf(anchor) : -1;
      const nextIndex =
        current === -1 ? 0 : Math.max(0, Math.min(visibleIds.length - 1, current + delta));
      const id = visibleIds[nextIndex];
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
