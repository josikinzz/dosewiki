import { useCallback, useMemo, useState } from "react";
import type { ManualDatasetKey, ManualIndexConfig } from "./types";

/**
 * Deep enough to walk back out of a wrong drag session, short enough that a
 * long editing run never pins dozens of whole layouts in memory.
 */
const HISTORY_LIMIT = 40;

type Trail = { past: readonly ManualIndexConfig[]; future: readonly ManualIndexConfig[] };

const EMPTY_TRAIL: Trail = { past: [], future: [] };

export type LayoutHistory = {
  canUndo: boolean;
  canRedo: boolean;
  /** Apply an edit to the active dataset and record what it replaced. */
  edit: (transform: (manual: ManualIndexConfig) => ManualIndexConfig) => void;
  undo: () => void;
  redo: () => void;
  /** Forget the trail: the draft was replaced wholesale, so its steps no longer apply. */
  forget: () => void;
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
    (transform: (previous: ManualIndexConfig) => ManualIndexConfig) => {
      const next = transform(manual);
      if (next === manual) {
        return;
      }

      setTrails((previous) => {
        const current = previous[dataset] ?? EMPTY_TRAIL;
        return {
          ...previous,
          [dataset]: { past: [...current.past, manual].slice(-HISTORY_LIMIT), future: [] },
        };
      });
      replace(next);
    },
    [dataset, manual, replace],
  );

  const undo = useCallback(() => {
    const current = trails[dataset] ?? EMPTY_TRAIL;
    const previous = current.past[current.past.length - 1];
    if (!previous) {
      return;
    }

    setTrails((all) => ({
      ...all,
      [dataset]: { past: current.past.slice(0, -1), future: [manual, ...current.future] },
    }));
    replace(previous);
  }, [dataset, manual, replace, trails]);

  const redo = useCallback(() => {
    const current = trails[dataset] ?? EMPTY_TRAIL;
    const next = current.future[0];
    if (!next) {
      return;
    }

    setTrails((all) => ({
      ...all,
      [dataset]: { past: [...current.past, manual].slice(-HISTORY_LIMIT), future: current.future.slice(1) },
    }));
    replace(next);
  }, [dataset, manual, replace, trails]);

  const forget = useCallback(() => {
    setTrails((all) => ({ ...all, [dataset]: EMPTY_TRAIL }));
  }, [dataset]);

  return useMemo(
    () => ({ canUndo: trail.past.length > 0, canRedo: trail.future.length > 0, edit, undo, redo, forget }),
    [edit, forget, redo, trail.future.length, trail.past.length, undo],
  );
}
