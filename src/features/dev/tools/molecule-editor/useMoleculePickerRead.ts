"use client";

import { useEffect, useState } from "react";

export type MoleculePickerDto = {
  slug: string;
  title: string;
  priority?: string | null;
  index_categories?: string[] | null;
  classification?: unknown;
  hasOverride: boolean;
};

type PickerPage = { page: MoleculePickerDto[]; continueCursor: string; isDone: boolean };

/** Drain one authorized, bounded molecule projection; undefined remains loading. */
export function useMoleculePickerRead(enabled: boolean, classKey?: string | null) {
  const [state, setState] = useState<{ key: string; rows: MoleculePickerDto[] | Error }>({ key: "", rows: [] });
  const key = enabled ? classKey ? `class:${classKey}` : "picker" : "disabled";
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
  if (!enabled) return null;
  if (state.key !== key) return undefined;
  if (state.rows instanceof Error) throw state.rows;
  return state.rows;
}
