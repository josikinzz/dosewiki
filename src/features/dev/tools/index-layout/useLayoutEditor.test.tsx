import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ManualCategoryDefinition, ManualDatasetKey, ManualIndexConfig } from "./types";
import { useIndexLayoutCategoryController } from "./useIndexLayoutCategoryController";
import { useLayoutEditor, type LayoutDatasetDefinition } from "./useLayoutEditor";
import { areManualsEqual, deepClone } from "./utils";

const DATASET_ORDER: ManualDatasetKey[] = ["psychoactive", "chemical", "mechanism"];

const EMPTY: ManualIndexConfig = { version: 1, categories: [] };

const category = (key: string, drugs: string[] = []): ManualCategoryDefinition => ({
  key,
  label: key,
  iconKey: "sparkle",
  notes: "",
  drugs,
  sections: [],
});

const LOADED: ManualIndexConfig = {
  version: 1,
  categories: [category("psychedelics", ["lsd"]), category("stimulants", ["amphetamine"])],
};

type Definitions = Record<ManualDatasetKey, LayoutDatasetDefinition>;

/**
 * Stands in for the `useDevMode` document: `manual` is what the context
 * currently holds and `replaceManual` is the write back into it. Every dataset
 * gets the same manual so the fixture stays small.
 */
function definitions(manual: ManualIndexConfig): Definitions {
  const build = (key: ManualDatasetKey, label: string): LayoutDatasetDefinition => ({
    key,
    label,
    manual,
    replaceManual: vi.fn(),
    getOriginalManual: () => manual,
  });
  return {
    psychoactive: build("psychoactive", "Psychoactive class"),
    chemical: build("chemical", "Chemical class"),
    mechanism: build("mechanism", "Mechanism of action"),
  };
}

const identity = (_datasetKey: ManualDatasetKey, manual: ManualIndexConfig) => manual;

function renderEditor(initial: Definitions) {
  return renderHook(
    ({ datasetDefinitions }: { datasetDefinitions: Definitions }) =>
      useLayoutEditor({
        datasetOrder: DATASET_ORDER,
        datasetDefinitions,
        normalizeManualOrdering: identity,
        organizeManualEntries: identity,
        deepClone,
        areManualsEqual,
      }),
    { initialProps: { datasetDefinitions: initial } },
  );
}

const keysOf = (manual: ManualIndexConfig) => manual.categories.map((entry) => entry.key);

describe("useLayoutEditor", () => {
  it("seeds every dataset's draft from the context manual with nothing unsaved", () => {
    const { result } = renderEditor(definitions(LOADED));

    for (const datasetKey of DATASET_ORDER) {
      const { draftManuals, normalizedCurrentManuals, rawJsonDrafts, jsonErrors } = result.current.state;
      expect(keysOf(draftManuals[datasetKey])).toEqual(["psychedelics", "stimulants"]);
      expect(areManualsEqual(normalizedCurrentManuals[datasetKey], draftManuals[datasetKey])).toBe(true);
      expect(rawJsonDrafts[datasetKey]).toBe(JSON.stringify(draftManuals[datasetKey], null, 2));
      expect(jsonErrors[datasetKey]).toBeNull();
    }
    expect(result.current.state.saveNotice).toBeNull();
  });

  it("stages the draft into the shared dev context on saveDataset", () => {
    const defs = definitions(LOADED);
    const { result } = renderEditor(defs);

    act(() => {
      result.current.updateDraftManualForDataset("psychoactive", (manual) => ({
        ...manual,
        categories: [...manual.categories, category("dissociatives", ["ketamine"])],
      }));
    });

    const draft = result.current.state.draftManuals.psychoactive;
    expect(keysOf(draft)).toEqual(["psychedelics", "stimulants", "dissociatives"]);
    expect(areManualsEqual(result.current.state.normalizedCurrentManuals.psychoactive, draft)).toBe(false);
    expect(defs.psychoactive.replaceManual).not.toHaveBeenCalled();

    act(() => {
      result.current.saveDataset("psychoactive");
    });

    // The write into the dev context is a deep copy of the draft, not the
    // draft object itself, so later edits cannot reach the staged document.
    expect(defs.psychoactive.replaceManual).toHaveBeenCalledTimes(1);
    const staged = vi.mocked(defs.psychoactive.replaceManual).mock.calls[0][0];
    expect(staged).toEqual(draft);
    expect(staged).not.toBe(draft);
    expect(defs.chemical.replaceManual).not.toHaveBeenCalled();
    expect(defs.mechanism.replaceManual).not.toHaveBeenCalled();

    // The editor's own "current" moves to the staged value so the dataset reads clean.
    const { state } = result.current;
    expect(areManualsEqual(state.normalizedCurrentManuals.psychoactive, draft)).toBe(true);
    expect(state.rawJsonDrafts.psychoactive).toBe(JSON.stringify(draft, null, 2));
    expect(state.saveNotice).toBe("Psychoactive class layout staged for Convex save");
    // The other datasets are untouched by a single-dataset stage.
    expect(keysOf(state.normalizedCurrentManuals.chemical)).toEqual(["psychedelics", "stimulants"]);
  });

  it("resets a dirty draft back to the staged manual", () => {
    const { result } = renderEditor(definitions(LOADED));

    act(() => {
      result.current.updateDraftManualForDataset("chemical", (manual) => ({
        ...manual,
        categories: manual.categories.slice(0, 1),
      }));
    });
    expect(keysOf(result.current.state.draftManuals.chemical)).toEqual(["psychedelics"]);

    act(() => {
      result.current.resetDraft("chemical");
    });
    expect(keysOf(result.current.state.draftManuals.chemical)).toEqual(["psychedelics", "stimulants"]);
  });

  // Defect 2 of josikinzz/dosewiki-admin#111: edits made while the Convex
  // query is still pending are discarded when it resolves. The sync effect
  // (`useLayoutEditor.ts` syncFromDefinitions) reassigns `draftManuals` whenever
  // the incoming current manual differs, with no dirty guard and no
  // `refreshConflict`, so the user's in-progress draft is replaced by the
  // freshly loaded payload.
  it.fails("keeps an in-progress draft when the context manual arrives after the edit", () => {
    const { result, rerender } = renderEditor(definitions(EMPTY));

    act(() => {
      result.current.updateDraftManualForDataset("psychoactive", (manual) => ({
        ...manual,
        categories: [category("dissociatives", ["ketamine"])],
      }));
    });
    expect(keysOf(result.current.state.draftManuals.psychoactive)).toEqual(["dissociatives"]);

    rerender({ datasetDefinitions: definitions(LOADED) });

    expect(keysOf(result.current.state.draftManuals.psychoactive)).toContain("dissociatives");
  });

  // Defect 4 of josikinzz/dosewiki-admin#111: `updateDraftManualForDataset`
  // resolves its updater eagerly against the render-closure draft instead of
  // dispatching a functional update. Two calls in the same render both read the
  // same stale draft and the second dispatch overwrites the first.
  it.fails("applies two updaters issued in the same render cumulatively", () => {
    const { result } = renderEditor(definitions(LOADED));

    act(() => {
      result.current.updateDraftManualForDataset("psychoactive", (manual) => ({
        ...manual,
        categories: [...manual.categories, category("dissociatives")],
      }));
      result.current.updateDraftManualForDataset("psychoactive", (manual) => ({
        ...manual,
        categories: [...manual.categories, category("depressants")],
      }));
    });

    expect(keysOf(result.current.state.draftManuals.psychoactive)).toEqual([
      "psychedelics",
      "stimulants",
      "dissociatives",
      "depressants",
    ]);
  });

  // Defect 4 of josikinzz/dosewiki-admin#111, `saveDataset` variant: it reads
  // `draftManuals` from the closure too, so a stage issued in the same render
  // as an edit writes the pre-edit draft into the dev context.
  it.fails("stages an edit issued in the same render as saveDataset", () => {
    const defs = definitions(LOADED);
    const { result } = renderEditor(defs);

    act(() => {
      result.current.updateDraftManualForDataset("psychoactive", (manual) => ({
        ...manual,
        categories: [...manual.categories, category("dissociatives")],
      }));
      result.current.saveDataset("psychoactive");
    });

    const staged = vi.mocked(defs.psychoactive.replaceManual).mock.calls[0][0];
    expect(keysOf(staged)).toContain("dissociatives");
  });
});

describe("useLayoutEditor with useIndexLayoutCategoryController", () => {
  const COLUMN_COUNT = 3;

  function renderComposed(initial: Definitions) {
    return renderHook(
      ({ datasetDefinitions }: { datasetDefinitions: Definitions }) => {
        const editor = useLayoutEditor({
          datasetOrder: DATASET_ORDER,
          datasetDefinitions,
          normalizeManualOrdering: identity,
          organizeManualEntries: identity,
          deepClone,
          areManualsEqual,
        });
        const draftManual = editor.state.draftManuals.psychoactive;
        const controller = useIndexLayoutCategoryController({
          allSubstanceRecords: [],
          draftManual,
          columnCount: COLUMN_COUNT,
          updateDraftManualForActive: (updater) =>
            editor.updateDraftManualForDataset("psychoactive", updater),
        });
        // Mirrors `IndexLayoutTab.tsx`, which gates the Stage button on this.
        const hasUnsavedChanges = !areManualsEqual(
          editor.state.normalizedCurrentManuals.psychoactive,
          draftManual,
        );
        return { editor, controller, hasUnsavedChanges };
      },
      { initialProps: { datasetDefinitions: initial } },
    );
  }

  it("records a column assignment for the active column count", () => {
    const { result } = renderComposed(definitions(LOADED));
    expect(result.current.hasUnsavedChanges).toBe(false);

    act(() => {
      result.current.controller.setColumn(0, 2);
    });

    const [moved, untouched] = result.current.editor.state.draftManuals.psychoactive.categories;
    expect(moved.columns).toEqual({ [String(COLUMN_COUNT)]: 2 });
    expect(untouched.columns).toBeUndefined();
    expect(result.current.controller.columnGroups[2].items.map((item) => item.category.key)).toEqual([
      "psychedelics",
    ]);
  });

  it("reports a reorder as unsaved", () => {
    const { result } = renderComposed(definitions(LOADED));

    act(() => {
      result.current.controller.moveCategory(0, "down");
    });

    expect(keysOf(result.current.editor.state.draftManuals.psychoactive)).toEqual([
      "stimulants",
      "psychedelics",
    ]);
    expect(result.current.hasUnsavedChanges).toBe(true);
  });

  // Defect 3 of josikinzz/dosewiki-admin#111: `areCategoriesEqual`
  // (`utils.ts`) ignores `columns`, so a column-only change made through
  // `setColumn` leaves `hasUnsavedChanges` false and the Stage button disabled.
  it.fails("reports a column-only change as unsaved", () => {
    const { result } = renderComposed(definitions(LOADED));

    act(() => {
      result.current.controller.setColumn(0, 2);
    });

    expect(result.current.hasUnsavedChanges).toBe(true);
  });
});
