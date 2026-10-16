"use client";

import { useCallback, useEffect, useState } from "react";

export type MoleculeSourceDto = {
  slug: string;
  smiles: string;
};

export type MoleculeSourceReadState = {
  data: MoleculeSourceDto | null | undefined;
  error: string | null;
  retry: () => void;
};

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

export function useMoleculeSourceRead(slug: string | null): MoleculeSourceDto | null | undefined {
  const state = useMoleculeSourceReadState(slug);
  if (state.error) throw new Error(state.error);
  return state.data;
}
