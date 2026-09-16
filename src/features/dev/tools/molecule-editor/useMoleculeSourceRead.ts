"use client";

import { useEffect, useState } from "react";

export type MoleculeSourceDto = {
  slug: string;
  smiles: string;
};

/** Selected molecule chemistry only; undefined is loading, null is authoritatively absent. */
export function useMoleculeSourceRead(slug: string | null): MoleculeSourceDto | null | undefined {
  const [state, setState] = useState<{
    slug: string | null;
    value: MoleculeSourceDto | null | Error;
  }>({ slug: null, value: null });

  useEffect(() => {
    if (!slug) return;
    const controller = new AbortController();
    void fetch(`/api/dev/molecule-editor?scope=source&slug=${encodeURIComponent(slug)}`, {
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Molecule source read failed (${response.status}).`);
        const value = await response.json() as MoleculeSourceDto | null;
        setState({ slug, value });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState({
          slug,
          value: error instanceof Error ? error : new Error("Molecule source read failed."),
        });
      });
    return () => controller.abort();
  }, [slug]);

  if (!slug) return null;
  if (state.slug !== slug) return undefined;
  if (state.value instanceof Error) throw state.value;
  return state.value;
}
