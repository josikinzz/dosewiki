"use client";

import { useCallback, useEffect, useState } from "react";

export type MoleculePickerDto = {
  slug: string;
  title: string;
  priority?: string | null;
  index_categories?: string[] | null;
  classification?: unknown;
  hasOverride: boolean;
};

type PickerPage = { page: MoleculePickerDto[]; continueCursor: string; isDone: boolean };

export type MoleculePickerReadState = {
  data: MoleculePickerDto[] | null | undefined;
  error: string | null;
  retry: () => void;
};

export function useMoleculePickerReadState(enabled: boolean, classKey?: string | null): MoleculePickerReadState {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ key: string; rows: MoleculePickerDto[] | Error }>({ key: "", rows: [] });
  const key = enabled ? `${classKey ? `class:${classKey}` : "picker"}#${attempt}` : "disabled";
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    void (async () => {
      const rows: MoleculePickerDto[] = [];
      let cursor: string | null = null;
      do {
        const params = new URLSearchParams({
          scope: classKey ? "class-members" : "picker",
          numItems: "200",
          ...(classKey ? { classKey } : {}),
          ...(cursor ? { cursor } : {}),
        });
        const response = await fetch(`/api/dev/molecule-editor?${params}`, {
          cache: "no-store",
          credentials: "same-origin",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`Molecule picker read failed (${response.status}).`);
        const page = await response.json() as PickerPage;
        rows.push(...page.page);
        cursor = page.isDone ? null : page.continueCursor;
      } while (cursor);
      setState({ key, rows });
    })().catch((error: unknown) => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setState({ key, rows: error instanceof Error ? error : new Error("Molecule picker read failed.") });
    });
    return () => controller.abort();
  }, [classKey, enabled, key]);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  if (!enabled) return { data: null, error: null, retry };
  if (state.key !== key) return { data: undefined, error: null, retry };
  if (state.rows instanceof Error) return { data: undefined, error: state.rows.message, retry };
  return { data: state.rows, error: null, retry };
}
