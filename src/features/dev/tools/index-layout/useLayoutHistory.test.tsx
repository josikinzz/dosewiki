import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useLayoutHistory } from "./useLayoutHistory";
import type { ManualDatasetKey, ManualIndexConfig } from "./types";

const manualWith = (drugs: string[]): ManualIndexConfig => ({
  version: 1,
  categories: [{ key: "psychedelic", label: "Psychedelic", iconKey: "psychedelic", drugs, sections: [] }],
});

/**
 * Edits go straight into the dev draft, so this trail is the only way back out
 * of a wrong drag. It has to survive a dataset switch and stay per-dataset.
 */
function renderHistory(initial: ManualIndexConfig = manualWith(["lsd"])) {
  const state = { manual: initial, dataset: "psychoactive" as ManualDatasetKey };
  const hook = renderHook(() =>
    useLayoutHistory({
      dataset: state.dataset,
      manual: state.manual,
      replace: (next) => {
        state.manual = next;
        hook.rerender();
      },
    }),
  );
  const edit = (transform: (manual: ManualIndexConfig) => ManualIndexConfig) =>
    act(() => hook.result.current.edit(transform));
  return { hook, state, edit };
}

describe("useLayoutHistory", () => {
  it("walks edits back and forward", () => {
    const { hook, state, edit } = renderHistory();

    expect(hook.result.current.canUndo).toBe(false);
    edit((manual) => manualWith([...manual.categories[0].drugs, "dmt"]));
    edit((manual) => manualWith([...manual.categories[0].drugs, "mescaline"]));
    expect(state.manual.categories[0].drugs).toEqual(["lsd", "dmt", "mescaline"]);

    act(() => hook.result.current.undo());
    expect(state.manual.categories[0].drugs).toEqual(["lsd", "dmt"]);
    act(() => hook.result.current.undo());
    expect(state.manual.categories[0].drugs).toEqual(["lsd"]);
    expect(hook.result.current.canUndo).toBe(false);
    expect(hook.result.current.canRedo).toBe(true);

    act(() => hook.result.current.redo());
    expect(state.manual.categories[0].drugs).toEqual(["lsd", "dmt"]);
  });

  it("ignores a transform that changes nothing and drops the redo trail on a new edit", () => {
    const { hook, state, edit } = renderHistory();

    edit((manual) => manual);
    expect(hook.result.current.canUndo).toBe(false);

    edit((manual) => manualWith([...manual.categories[0].drugs, "dmt"]));
    act(() => hook.result.current.undo());
    expect(hook.result.current.canRedo).toBe(true);

    edit((manual) => manualWith([...manual.categories[0].drugs, "ketamine"]));
    expect(hook.result.current.canRedo).toBe(false);
    expect(state.manual.categories[0].drugs).toEqual(["lsd", "ketamine"]);
  });

  it("keeps one trail per dataset and forgets a trail on request", () => {
    const { hook, state, edit } = renderHistory();

    edit((manual) => manualWith([...manual.categories[0].drugs, "dmt"]));

    state.dataset = "chemical";
    hook.rerender();
    expect(hook.result.current.canUndo).toBe(false);

    state.dataset = "psychoactive";
    hook.rerender();
    expect(hook.result.current.canUndo).toBe(true);

    act(() => hook.result.current.forget());
    expect(hook.result.current.canUndo).toBe(false);
    expect(hook.result.current.canRedo).toBe(false);
  });
});
