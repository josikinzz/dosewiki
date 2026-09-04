import { useCallback, useEffect, useMemo, useReducer } from "react";

import { useDevNoticeChannel } from "@/features/dev/notices/devNoticeLifecycle";
import type { ManualDatasetKey, ManualIndexConfig } from "./types";

export type LayoutDatasetDefinition = {
  key: ManualDatasetKey;
  label: string;
  manual: ManualIndexConfig;
  replaceManual: (next: ManualIndexConfig) => void;
  getOriginalManual: () => ManualIndexConfig;
};

type LayoutEditorState = {
  normalizedOriginalManuals: Record<ManualDatasetKey, ManualIndexConfig>;
  normalizedCurrentManuals: Record<ManualDatasetKey, ManualIndexConfig>;
  draftManuals: Record<ManualDatasetKey, ManualIndexConfig>;
  rawJsonDrafts: Record<ManualDatasetKey, string>;
  jsonErrors: Record<ManualDatasetKey, string | null>;
  saveNotice: string | null;
};

type LayoutEditorAction =
  | {
      type: "syncFromDefinitions";
      originals: Record<ManualDatasetKey, ManualIndexConfig>;
      currents: Record<ManualDatasetKey, ManualIndexConfig>;
    }
  | { type: "updateDraft"; datasetKey: ManualDatasetKey; manual: ManualIndexConfig }
  | { type: "setRawJson"; datasetKey: ManualDatasetKey; value: string }
  | { type: "setJsonError"; datasetKey: ManualDatasetKey; error: string | null }
  | { type: "setSaveNotice"; value: string | null };

const createInitialState = (
  datasetOrder: ManualDatasetKey[],
  datasetDefinitions: Record<ManualDatasetKey, LayoutDatasetDefinition>,
  normalizeManualOrdering: (datasetKey: ManualDatasetKey, manual: ManualIndexConfig) => ManualIndexConfig,
  deepClone: <T,>(value: T) => T,
): LayoutEditorState => {
  const jsonErrors: Record<ManualDatasetKey, string | null> = {
    psychoactive: null,
    chemical: null,
    mechanism: null,
  };
  const normalizedOriginalManuals = {} as Record<ManualDatasetKey, ManualIndexConfig>;
  const normalizedCurrentManuals = {} as Record<ManualDatasetKey, ManualIndexConfig>;
  const draftManuals = {} as Record<ManualDatasetKey, ManualIndexConfig>;
  const rawJsonDrafts = {} as Record<ManualDatasetKey, string>;

  datasetOrder.forEach((datasetKey) => {
    const definition = datasetDefinitions[datasetKey];
    const original = normalizeManualOrdering(datasetKey, deepClone(definition.getOriginalManual()));
    const current = normalizeManualOrdering(datasetKey, deepClone(definition.manual));
    normalizedOriginalManuals[datasetKey] = original;
    normalizedCurrentManuals[datasetKey] = current;
    draftManuals[datasetKey] = current;
    rawJsonDrafts[datasetKey] = JSON.stringify(current, null, 2);
  });

  return {
    normalizedOriginalManuals,
    normalizedCurrentManuals,
    draftManuals,
    rawJsonDrafts,
    jsonErrors,
    saveNotice: null,
  };
};

const createReducer = (
  datasetOrder: ManualDatasetKey[],
  areManualsEqual: (first: ManualIndexConfig, second: ManualIndexConfig) => boolean,
) => {
  return (state: LayoutEditorState, action: LayoutEditorAction): LayoutEditorState => {
    switch (action.type) {
      case "syncFromDefinitions": {
        let changed = false;
        const nextState: LayoutEditorState = {
          ...state,
          normalizedOriginalManuals: { ...state.normalizedOriginalManuals },
          normalizedCurrentManuals: { ...state.normalizedCurrentManuals },
          draftManuals: { ...state.draftManuals },
          rawJsonDrafts: { ...state.rawJsonDrafts },
          jsonErrors: { ...state.jsonErrors },
        };

        datasetOrder.forEach((datasetKey) => {
          const nextOriginal = action.originals[datasetKey];
          const nextCurrent = action.currents[datasetKey];
          if (!areManualsEqual(state.normalizedOriginalManuals[datasetKey], nextOriginal)) {
            nextState.normalizedOriginalManuals[datasetKey] = nextOriginal;
            changed = true;
          }
          if (!areManualsEqual(state.normalizedCurrentManuals[datasetKey], nextCurrent)) {
            nextState.normalizedCurrentManuals[datasetKey] = nextCurrent;
            nextState.draftManuals[datasetKey] = nextCurrent;
            nextState.rawJsonDrafts[datasetKey] = JSON.stringify(nextCurrent, null, 2);
            nextState.jsonErrors[datasetKey] = null;
            changed = true;
          }
        });

        return changed ? nextState : state;
      }
      case "updateDraft": {
        if (state.draftManuals[action.datasetKey] === action.manual) {
          return state;
        }
        return {
          ...state,
          draftManuals: {
            ...state.draftManuals,
            [action.datasetKey]: action.manual,
          },
          rawJsonDrafts: {
            ...state.rawJsonDrafts,
            [action.datasetKey]: JSON.stringify(action.manual, null, 2),
          },
          jsonErrors: {
            ...state.jsonErrors,
            [action.datasetKey]: null,
          },
        };
      }
      case "setRawJson": {
        if (state.rawJsonDrafts[action.datasetKey] === action.value) {
          return state;
        }
        return {
          ...state,
          rawJsonDrafts: {
            ...state.rawJsonDrafts,
            [action.datasetKey]: action.value,
          },
        };
      }
      case "setJsonError": {
        if (state.jsonErrors[action.datasetKey] === action.error) {
          return state;
        }
        return {
          ...state,
          jsonErrors: {
            ...state.jsonErrors,
            [action.datasetKey]: action.error,
          },
        };
      }
      case "setSaveNotice": {
        if (state.saveNotice === action.value) {
          return state;
        }
        return {
          ...state,
          saveNotice: action.value,
        };
      }
      default:
        return state;
    }
  };
};

export function useLayoutEditor({
  datasetOrder,
  datasetDefinitions,
  normalizeManualOrdering,
  organizeManualEntries,
  deepClone,
  areManualsEqual,
}: {
  datasetOrder: ManualDatasetKey[];
  datasetDefinitions: Record<ManualDatasetKey, LayoutDatasetDefinition>;
  normalizeManualOrdering: (datasetKey: ManualDatasetKey, manual: ManualIndexConfig) => ManualIndexConfig;
  organizeManualEntries: (datasetKey: ManualDatasetKey, manual: ManualIndexConfig) => ManualIndexConfig;
  deepClone: <T,>(value: T) => T;
  areManualsEqual: (first: ManualIndexConfig, second: ManualIndexConfig) => boolean;
}) {
  const reducer = useMemo(() => createReducer(datasetOrder, areManualsEqual), [areManualsEqual, datasetOrder]);
  const [state, dispatch] = useReducer(
    reducer,
    undefined,
    () => createInitialState(datasetOrder, datasetDefinitions, normalizeManualOrdering, deepClone),
  );
  const saveNoticeChannel = useDevNoticeChannel("indexLayout");
  const saveNotice = saveNoticeChannel.notice?.message ?? null;
  const renderedState = useMemo(
    () => ({
      ...state,
      saveNotice,
    }),
    [saveNotice, state],
  );

  useEffect(() => {
    const originals = {} as Record<ManualDatasetKey, ManualIndexConfig>;
    const currents = {} as Record<ManualDatasetKey, ManualIndexConfig>;
    datasetOrder.forEach((datasetKey) => {
      const definition = datasetDefinitions[datasetKey];
      originals[datasetKey] = normalizeManualOrdering(datasetKey, deepClone(definition.getOriginalManual()));
      currents[datasetKey] = normalizeManualOrdering(datasetKey, deepClone(definition.manual));
    });
    dispatch({ type: "syncFromDefinitions", originals, currents });
  }, [datasetDefinitions, datasetOrder, deepClone, normalizeManualOrdering]);

  const setRawJsonForDataset = useCallback((datasetKey: ManualDatasetKey, value: string) => {
    dispatch({ type: "setRawJson", datasetKey, value });
  }, []);

  const clearJsonErrorForDataset = useCallback((datasetKey: ManualDatasetKey) => {
    dispatch({ type: "setJsonError", datasetKey, error: null });
  }, []);

  const setJsonErrorForDataset = useCallback((datasetKey: ManualDatasetKey, error: string) => {
    dispatch({ type: "setJsonError", datasetKey, error });
  }, []);

  const updateDraftManualForDataset = useCallback(
    (datasetKey: ManualDatasetKey, updater: (manual: ManualIndexConfig) => ManualIndexConfig) => {
      const current = state.draftManuals[datasetKey];
      const next = updater(current);
      if (next === current) {
        return;
      }
      dispatch({ type: "updateDraft", datasetKey, manual: next });
    },
    [state.draftManuals],
  );

  const applyJsonForDataset = useCallback(
    (datasetKey: ManualDatasetKey, rawJson: string) => {
      const parsed = JSON.parse(rawJson) as ManualIndexConfig;
      if (!parsed || typeof parsed !== "object") {
        throw new Error("Invalid manual dataset");
      }
      const normalized = normalizeManualOrdering(datasetKey, parsed);
      dispatch({ type: "updateDraft", datasetKey, manual: normalized });
      dispatch({ type: "setRawJson", datasetKey, value: JSON.stringify(normalized, null, 2) });
    },
    [normalizeManualOrdering],
  );

  const saveDataset = useCallback(
    (datasetKey: ManualDatasetKey) => {
      const definition = datasetDefinitions[datasetKey];
      const normalized = normalizeManualOrdering(datasetKey, state.draftManuals[datasetKey]);
      definition.replaceManual(deepClone(normalized));
      dispatch({ type: "syncFromDefinitions", originals: state.normalizedOriginalManuals, currents: {
        ...state.normalizedCurrentManuals,
        [datasetKey]: normalized,
      } });
      dispatch({ type: "setRawJson", datasetKey, value: JSON.stringify(normalized, null, 2) });
      saveNoticeChannel.publish({
        status: "success",
        message: `${definition.label} layout applied to draft`,
        autoClearMs: 3000,
        event: "indexLayout.staged",
        debug: { datasetKey },
      });
    },
    [datasetDefinitions, deepClone, normalizeManualOrdering, saveNoticeChannel, state.draftManuals, state.normalizedCurrentManuals, state.normalizedOriginalManuals],
  );

  const resetDraft = useCallback(
    (datasetKey: ManualDatasetKey) => {
      const normalizedCurrent = state.normalizedCurrentManuals[datasetKey];
      dispatch({ type: "updateDraft", datasetKey, manual: deepClone(normalizedCurrent) });
      dispatch({ type: "setRawJson", datasetKey, value: JSON.stringify(normalizedCurrent, null, 2) });
    },
    [deepClone, state.normalizedCurrentManuals],
  );

  const resetToOriginal = useCallback(
    (datasetKey: ManualDatasetKey) => {
      const normalizedOriginal = state.normalizedOriginalManuals[datasetKey];
      dispatch({ type: "updateDraft", datasetKey, manual: deepClone(normalizedOriginal) });
      dispatch({ type: "setRawJson", datasetKey, value: JSON.stringify(normalizedOriginal, null, 2) });
    },
    [deepClone, state.normalizedOriginalManuals],
  );

  const organizeEntries = useCallback(
    (datasetKey: ManualDatasetKey) => {
      const organized = organizeManualEntries(datasetKey, state.draftManuals[datasetKey]);
      dispatch({ type: "updateDraft", datasetKey, manual: organized });
      dispatch({ type: "setRawJson", datasetKey, value: JSON.stringify(organized, null, 2) });
    },
    [organizeManualEntries, state.draftManuals],
  );

  const setSaveNotice = useCallback((value: string | null) => {
    if (!value) {
      saveNoticeChannel.clear();
      return;
    }
    saveNoticeChannel.publish({
      status: "success",
      message: value,
      autoClearMs: 3000,
    });
  }, [saveNoticeChannel]);

  return {
    state: renderedState,
    setRawJsonForDataset,
    clearJsonErrorForDataset,
    setJsonErrorForDataset,
    updateDraftManualForDataset,
    applyJsonForDataset,
    saveDataset,
    resetDraft,
    resetToOriginal,
    organizeEntries,
    setSaveNotice,
  };
}
