import { useCallback, useEffect, useMemo, useState } from "react";

export type EditorDocumentRefreshConflict<T> = {
  previousOriginal: T;
  incomingSource: T;
};

type EditorDocumentState<T> = {
  draft: T;
  original: T;
  refreshConflict: EditorDocumentRefreshConflict<T> | null;
  source: T;
  sourceVersion: number;
};

export type EditorDocumentSession<T> = {
  draft: T;
  original: T;
  isDirty: boolean;
  refreshConflict: EditorDocumentRefreshConflict<T> | null;
  sourceVersion: number;
  applyDraftTransform: (transform: (previous: T) => T) => void;
  applyHydration: (
    transform: (previous: { draft: T; original: T }) => { draft: T; original: T } | null,
  ) => void;
  getOriginal: () => T;
  markSaved: (nextOriginal?: T) => void;
  replaceDraft: (nextDraft: T) => void;
  reset: () => void;
};

function definedKeyCount(value: Record<string, unknown>, keys: string[]): number {
  let count = 0;
  for (const key of keys) {
    if (value[key] !== undefined) {
      count += 1;
    }
  }
  return count;
}

export function isSameDocument(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) {
    return true;
  }

  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) {
    return false;
  }

  const aIsArray = Array.isArray(a);
  if (aIsArray !== Array.isArray(b)) {
    return false;
  }

  if (aIsArray) {
    const left = a as unknown[];
    const right = b as unknown[];
    if (left.length !== right.length) {
      return false;
    }
    for (let index = 0; index < left.length; index += 1) {
      if (!isSameDocument(left[index], right[index])) {
        return false;
      }
    }
    return true;
  }

  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);

  if (definedKeyCount(left, leftKeys) !== definedKeyCount(right, rightKeys)) {
    return false;
  }

  for (const key of leftKeys) {
    if (!isSameDocument(left[key], right[key])) {
      return false;
    }
  }

  return true;
}

export function useEditorDocument<T>(source: T): EditorDocumentSession<T> {
  const [state, setState] = useState<EditorDocumentState<T>>(() => ({
    draft: source,
    original: source,
    refreshConflict: null,
    source,
    sourceVersion: 1,
  }));

  useEffect(() => {
    setState((previous) => {
      if (isSameDocument(previous.source, source)) {
        return previous;
      }

      const wasDirty = !isSameDocument(previous.draft, previous.original);

      if (!wasDirty) {
        return {
          draft: source,
          original: source,
          refreshConflict: null,
          source,
          sourceVersion: previous.sourceVersion + 1,
        };
      }

      return {
        draft: previous.draft,
        original: previous.original,
        refreshConflict: {
          previousOriginal: previous.refreshConflict?.previousOriginal ?? previous.original,
          incomingSource: source,
        },
        source,
        sourceVersion: previous.sourceVersion + 1,
      };
    });
  }, [source]);

  const isDirty = useMemo(
    () => !isSameDocument(state.draft, state.original),
    [state.draft, state.original],
  );

  const replaceDraft = useCallback((nextDraft: T) => {
    setState((previous) =>
      previous.draft === nextDraft ? previous : { ...previous, draft: nextDraft },
    );
  }, []);

  const applyDraftTransform = useCallback((transform: (previous: T) => T) => {
    setState((previous) => {
      const nextDraft = transform(previous.draft);
      return nextDraft === previous.draft ? previous : { ...previous, draft: nextDraft };
    });
  }, []);

  const applyHydration = useCallback(
    (transform: (previous: { draft: T; original: T }) => { draft: T; original: T } | null) => {
      setState((previous) => {
        const next = transform({ draft: previous.draft, original: previous.original });
        if (
          next === null
          || (next.draft === previous.draft && next.original === previous.original)
        ) {
          return previous;
        }

        return { ...previous, draft: next.draft, original: next.original };
      });
    },
    [],
  );

  const reset = useCallback(() => {
    setState((previous) => {
      if (previous.draft === previous.original && previous.refreshConflict === null) {
        return previous;
      }
      return {
        ...previous,
        draft: previous.refreshConflict?.incomingSource ?? previous.original,
        original: previous.refreshConflict?.incomingSource ?? previous.original,
        refreshConflict: null,
      };
    });
  }, []);

  const markSaved = useCallback((nextOriginal?: T) => {
    setState((previous) => {
      const savedOriginal = nextOriginal === undefined ? previous.draft : nextOriginal;
      return {
        ...previous,
        draft: savedOriginal,
        original: savedOriginal,
        refreshConflict: null,
      };
    });
  }, []);

  const getOriginal = useCallback(() => state.original, [state.original]);

  return {
    draft: state.draft,
    original: state.original,
    isDirty,
    refreshConflict: state.refreshConflict,
    sourceVersion: state.sourceVersion,
    applyDraftTransform,
    applyHydration,
    getOriginal,
    markSaved,
    replaceDraft,
    reset,
  };
}
