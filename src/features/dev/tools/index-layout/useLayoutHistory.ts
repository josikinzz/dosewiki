import { useCallback, useMemo, useState } from "react";
import type { ManualDatasetKey, ManualIndexConfig } from "./types";

const HISTORY_LIMIT = 40;

type Step = { manual: ManualIndexConfig; label: string | null };
type Trail = { past: readonly Step[]; future: readonly Step[] };

const EMPTY_TRAIL: Trail = { past: [], future: [] };

export type LayoutHistory = {
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string | null;
  redoLabel: string | null;
  edit: (transform: (manual: ManualIndexConfig) => ManualIndexConfig, label?: string) => boolean;
  undo: () => string | null;
  redo: () => string | null;
  forget: () => void;
  forgetAll: () => void;
};

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
