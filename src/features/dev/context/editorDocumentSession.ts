import { useCallback, useEffect, useMemo, useState } from "react";

import { deepClone } from "./devModeUtils";

export type EditorDocumentRefreshConflict<T> = {
  previousOriginal: T;
  incomingSource: T;
};

type EditorDocumentState<T> = {
  draft: T;
  original: T;
  refreshConflict: EditorDocumentRefreshConflict<T> | null;
  sourceSignature: string;
  sourceVersion: number;
};

export type EditorDocumentSession<T> = {
  draft: T;
  original: T;
  isDirty: boolean;
  refreshConflict: EditorDocumentRefreshConflict<T> | null;
  sourceVersion: number;
  applyDraftTransform: (transform: (previous: T) => T) => void;
  getOriginal: () => T;
  markSaved: (nextOriginal?: T) => void;
  replaceDraft: (nextDraft: T) => void;
  reset: () => void;
};

function getDocumentSignature(value: unknown): string {
  return JSON.stringify(value);
}

export function useEditorDocument<T>(source: T): EditorDocumentSession<T> {
  const sourceSignature = useMemo(() => getDocumentSignature(source), [source]);
  const [state, setState] = useState<EditorDocumentState<T>>(() => {
    const snapshot = deepClone(source);
    return {
      draft: snapshot,
      original: deepClone(snapshot),
      refreshConflict: null,
      sourceSignature,
      sourceVersion: 1,
    };
  });

  useEffect(() => {
    setState((previous) => {
      if (previous.sourceSignature === sourceSignature) {
        return previous;
      }

      const incomingSource = deepClone(source);
      const wasDirty =
        getDocumentSignature(previous.draft) !== getDocumentSignature(previous.original);

      if (!wasDirty) {
        return {
          draft: deepClone(incomingSource),
          original: deepClone(incomingSource),
          refreshConflict: null,
          sourceSignature,
          sourceVersion: previous.sourceVersion + 1,
        };
      }

      return {
        draft: previous.draft,
        original: deepClone(incomingSource),
        refreshConflict: {
          previousOriginal: deepClone(previous.original),
          incomingSource: deepClone(incomingSource),
        },
        sourceSignature,
        sourceVersion: previous.sourceVersion + 1,
      };
    });
  }, [source, sourceSignature]);

  const isDirty = useMemo(
    () => getDocumentSignature(state.draft) !== getDocumentSignature(state.original),
    [state.draft, state.original],
  );

  const replaceDraft = useCallback((nextDraft: T) => {
    setState((previous) => ({
      ...previous,
      draft: deepClone(nextDraft),
    }));
  }, []);

  const applyDraftTransform = useCallback((transform: (previous: T) => T) => {
    setState((previous) => ({
      ...previous,
      draft: deepClone(transform(deepClone(previous.draft))),
    }));
  }, []);

  const reset = useCallback(() => {
    setState((previous) => ({
      ...previous,
      draft: deepClone(previous.original),
      refreshConflict: null,
    }));
  }, []);

  const markSaved = useCallback((nextOriginal?: T) => {
    setState((previous) => {
      const savedOriginal = nextOriginal === undefined ? previous.draft : nextOriginal;
      return {
        ...previous,
        draft: deepClone(savedOriginal),
        original: deepClone(savedOriginal),
        refreshConflict: null,
      };
    });
  }, []);

  const getOriginal = useCallback(() => deepClone(state.original), [state.original]);

  return {
    draft: state.draft,
    original: state.original,
    isDirty,
    refreshConflict: state.refreshConflict,
    sourceVersion: state.sourceVersion,
    applyDraftTransform,
    getOriginal,
    markSaved,
    replaceDraft,
    reset,
  };
}
