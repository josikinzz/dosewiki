"use client";

import { useCallback, useEffect, useState } from "react";

export type MoleculeSourceDto = {
  slug: string;
  smiles: string;
};

export type MoleculeSourceReadState = {
  /** undefined while loading (or after a failure), null when authoritatively absent. */
  data: MoleculeSourceDto | null | undefined;
  error: string | null;
  retry: () => void;
};

/**
 * Selected molecule chemistry only. A failure stays in the pane (with Try
 * again) instead of throwing to the route error boundary.
 */
export function useMoleculeSourceReadState(slug: string | null): MoleculeSourceReadState {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{
    key: string | null;
    value: MoleculeSourceDto | null | Error;
  }>({ key: null, value: null });
  const key = slug ? `${slug}#${attempt}` : null;

  useEffect(() => {
    if (!slug || !key) return;
    const controller = new AbortController();
    void fetch(`/api/dev/molecule-editor?scope=source&slug=${encodeURIComponent(slug)}`, {
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Molecule source read failed (${response.status}).`);
        const value = await response.json() as MoleculeSourceDto | null;
        setState({ key, value });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState({
          key,
          value: error instanceof Error ? error : new Error("Molecule source read failed."),
        });
      });
    return () => controller.abort();
  }, [slug, key]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  if (!slug) return { data: null, error: null, retry };
  if (state.key !== key) return { data: undefined, error: null, retry };
  if (state.value instanceof Error) return { data: undefined, error: state.value.message, retry };
  return { data: state.value, error: null, retry };
}

/**
 * The same read for callers that let a failure reach their error boundary
 * (Review's quick editor): undefined is loading, null is authoritatively absent.
 */
export function useMoleculeSourceRead(slug: string | null): MoleculeSourceDto | null | undefined {
  const state = useMoleculeSourceReadState(slug);
  if (state.error) throw new Error(state.error);
  return state.data;
}
