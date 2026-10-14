"use client";

/**
 * Rows approved in this session keep their place in the Terms list, with
 * their new pill, even under a status filter that no longer matches them. The
 * next Approve button then does not jump up a row under the pointer, and the
 * work just done stays visible. The rows are held for one view of the list:
 * changing the status, the search or the language, or a full Refresh,
 * releases them, since each of those is the reviewer redrawing the list.
 */

import { useMemo, useState } from "react";

import { filterRows, type GlossaryFilters, type GlossaryList, type GlossaryRow } from "./glossaryModel";

const NONE: ReadonlySet<string> = new Set();

/**
 * The rows the filters keep, plus the held rows in their original places. The
 * search still applies to a held row, so it never contradicts the search box.
 */
export function rowsKeepingHeld(rows: readonly GlossaryRow[], filters: GlossaryFilters, held: ReadonlySet<string>): GlossaryRow[] {
  if (held.size === 0 || filters.status === "all") return filterRows(rows, filters);
  const kept = new Set(filterRows(rows, filters).map((row) => row.term));
  return filterRows(rows, { ...filters, status: "all" }).filter((row) => kept.has(row.term) || held.has(row.term));
}

export function useHeldInPlace(data: GlossaryList | null, filters: GlossaryFilters) {
  // The held terms are stamped with the view they were approved under, so any
  // change to that view releases them without each filter setter knowing.
  const view = JSON.stringify([data?.locale ?? null, filters.status, filters.search]);
  const [held, setHeld] = useState<{ view: string; terms: ReadonlySet<string> } | null>(null);
  const terms = held?.view === view ? held.terms : NONE;
  const rows = useMemo(() => (data ? rowsKeepingHeld(data.rows, filters, terms) : []), [data, filters, terms]);
  /** Holds just-approved terms in the view they were approved in. */
  const hold = (approved: readonly string[]) =>
    setHeld((current) => ({ view, terms: new Set([...(current?.view === view ? current.terms : []), ...approved]) }));
  const release = () => setHeld(null);
  return { rows, hold, release };
}
