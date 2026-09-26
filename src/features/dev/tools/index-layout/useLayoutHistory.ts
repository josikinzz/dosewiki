import { useCallback, useMemo, useState } from "react";
import type { ManualDatasetKey, ManualIndexConfig } from "./types";

/**
 * Deep enough to walk back out of a wrong drag session, short enough that a
 * long editing run never pins dozens of whole layouts in memory.
 */
const HISTORY_LIMIT = 40;

/** One step: the manual it replaced and, when the caller named it, what the step did ("Moved LSD to Dissociative"). */
type Step = { manual: ManualIndexConfig; label: string | null };
type Trail = { past: readonly Step[]; future: readonly Step[] };

const EMPTY_TRAIL: Trail = { past: [], future: [] };

export type LayoutHistory = {
  canUndo: boolean;
  canRedo: boolean;
  /** What Undo would take back, in words, when the step was named. */
  undoLabel: string | null;
  /** What Redo would put back, in words, when the step was named. */
  redoLabel: string | null;
  /** Apply an edit to the active dataset and record what it replaced; `label` names the step for Undo and announcements. Returns whether anything changed. */
  edit: (transform: (manual: ManualIndexConfig) => ManualIndexConfig, label?: string) => boolean;
  /** Takes back the last step; returns its label (or null when unnamed or nothing to undo). */
  undo: () => string | null;
  /** Puts back the last undone step; returns its label. */
  redo: () => string | null;
  /** Forget the trail: the draft was replaced wholesale, so its steps no longer apply. */
  forget: () => void;
  /** Forget every dataset's trail: a commit made the drafts the new starting point. */
  forgetAll: () => void;
};

/**
 * Undo for the layout editor. Every gesture writes straight into the dev
 * draft, which is what makes the tool feel like the page rather than a form,
 * so the safety net is a trail of the manuals each gesture replaced. One trail
 * per dataset: switching datasets keeps both histories.
 */
export function useLayoutHistory({
  dataset,
  manual,
  replace,
}: {
  dataset: ManualDatasetKey;
  manual: ManualIndexConfig;
  replace: (next: ManualIndexConfig) => void;
}): LayoutHistory {
  const [trails, setTrails] = useState<Partial<Record<ManualDatasetKey, Trail>>>({});
  const trail = trails[dataset] ?? EMPTY_TRAIL;

  const edit = useCallback(
    (transform: (previous: ManualIndexConfig) => ManualIndexConfig, label?: string) => {
      const next = transform(manual);
      if (next === manual) {
        return false;
      }

      setTrails((previous) => {
        const current = previous[dataset] ?? EMPTY_TRAIL;
        return {
          ...previous,
          [dataset]: { past: [...current.past, { manual, label: label ?? null }].slice(-HISTORY_LIMIT), future: [] },
        };
      });
      replace(next);
      return true;
    },
    [dataset, manual, replace],
  );

  const undo = useCallback(() => {
    const current = trails[dataset] ?? EMPTY_TRAIL;
    const previous = current.past[current.past.length - 1];
    if (!previous) {
      return null;
    }

    setTrails((all) => ({
      ...all,
      [dataset]: { past: current.past.slice(0, -1), future: [{ manual, label: previous.label }, ...current.future] },
    }));
    replace(previous.manual);
    return previous.label;
  }, [dataset, manual, replace, trails]);

  const redo = useCallback(() => {
    const current = trails[dataset] ?? EMPTY_TRAIL;
    const next = current.future[0];
    if (!next) {
      return null;
    }

    setTrails((all) => ({
      ...all,
      [dataset]: { past: [...current.past, { manual, label: next.label }].slice(-HISTORY_LIMIT), future: current.future.slice(1) },
    }));
    replace(next.manual);
    return next.label;
  }, [dataset, manual, replace, trails]);

  const forget = useCallback(() => {
    setTrails((all) => ({ ...all, [dataset]: EMPTY_TRAIL }));
  }, [dataset]);

  const forgetAll = useCallback(() => {
    setTrails({});
  }, []);

  const undoLabel = trail.past[trail.past.length - 1]?.label ?? null;
  const redoLabel = trail.future[0]?.label ?? null;

  return useMemo(
    () => ({
      canUndo: trail.past.length > 0,
      canRedo: trail.future.length > 0,
      undoLabel,
      redoLabel,
      edit,
      undo,
      redo,
      forget,
      forgetAll,
    }),
    [edit, forget, forgetAll, redo, redoLabel, trail.future.length, trail.past.length, undo, undoLabel],
  );
}
