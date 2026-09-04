import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ManualCategoryDefinition, ManualDatasetKey, ManualIndexConfig } from "./types";
import { bumpSlug, moveSlug } from "./layoutOps";
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

function renderEditor(initial: Definitions) {
  return renderHook(
    ({ datasetDefinitions }: { datasetDefinitions: Definitions }) =>
      useLayoutEditor({
        datasetOrder: DATASET_ORDER,
        datasetDefinitions,
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
    expect(state.saveNotice).toBe("Psychoactive class layout applied to draft");
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

describe("useLayoutEditor with layoutOps", () => {
  function renderComposed(initial: Definitions) {
    return renderHook(
      ({ datasetDefinitions }: { datasetDefinitions: Definitions }) => {
        const editor = useLayoutEditor({
          datasetOrder: DATASET_ORDER,
          datasetDefinitions,
          deepClone,
          areManualsEqual,
        });
        const draftManual = editor.state.draftManuals.psychoactive;
        // Mirrors `IndexLayoutTab.tsx`, which gates Apply to draft on this.
        const hasUnsavedChanges = !areManualsEqual(
          editor.state.normalizedCurrentManuals.psychoactive,
          draftManual,
        );
        return { editor, hasUnsavedChanges };
      },
      { initialProps: { datasetDefinitions: initial } },
    );
  }

  it("reports a cross-category move as unsaved and keeps authored order otherwise", () => {
    const { result } = renderComposed(definitions(LOADED));
    expect(result.current.hasUnsavedChanges).toBe(false);

    act(() => {
      result.current.editor.updateDraftManualForDataset("psychoactive", (manual) =>
        moveSlug(
          manual,
          { categoryKey: "psychedelics", sectionKey: null },
          "lsd",
          { categoryKey: "stimulants", sectionKey: null },
          0,
        ),
      );
    });

    const [psychedelics, stimulants] = result.current.editor.state.draftManuals.psychoactive.categories;
    expect(psychedelics.drugs).toEqual([]);
    expect(stimulants.drugs).toEqual(["lsd", "amphetamine"]);
    expect(result.current.hasUnsavedChanges).toBe(true);
  });

  it("treats an identity update as no change", () => {
    const { result } = renderComposed(definitions(LOADED));
    const before = result.current.editor.state.draftManuals.psychoactive;

    act(() => {
      result.current.editor.updateDraftManualForDataset("psychoactive", (manual) =>
        bumpSlug(manual, { categoryKey: "psychedelics", sectionKey: null }, "lsd", "up"),
      );
    });

    expect(result.current.editor.state.draftManuals.psychoactive).toBe(before);
    expect(result.current.hasUnsavedChanges).toBe(false);
  });
});
