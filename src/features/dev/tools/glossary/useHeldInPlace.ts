"use client";

import { useMemo, useState } from "react";

import { filterRows, type GlossaryFilters, type GlossaryList, type GlossaryRow } from "./glossaryModel";

const NONE: ReadonlySet<string> = new Set();

export function rowsKeepingHeld(rows: readonly GlossaryRow[], filters: GlossaryFilters, held: ReadonlySet<string>): GlossaryRow[] {
  if (held.size === 0 || filters.status === "all") return filterRows(rows, filters);
  const kept = new Set(filterRows(rows, filters).map((row) => row.term));
  return filterRows(rows, { ...filters, status: "all" }).filter((row) => kept.has(row.term) || held.has(row.term));
}

export function useHeldInPlace(data: GlossaryList | null, filters: GlossaryFilters) {
  const view = JSON.stringify([data?.locale ?? null, filters.status, filters.search]);
  const [held, setHeld] = useState<{ view: string; terms: ReadonlySet<string> } | null>(null);
  const terms = held?.view === view ? held.terms : NONE;
  const rows = useMemo(() => (data ? rowsKeepingHeld(data.rows, filters, terms) : []), [data, filters, terms]);
  const hold = (approved: readonly string[]) =>
    setHeld((current) => ({ view, terms: new Set([...(current?.view === view ? current.terms : []), ...approved]) }));
  const release = () => setHeld(null);
  return { rows, hold, release };
}
