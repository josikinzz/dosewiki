/**
 * Pure helpers and the HTTP client for the Glossary tab
 * (`/api/dev/translation-glossary`).
 */

import type { TranslationGlossaryRow } from "@server/translation/glossary";
import type { GlossaryListResponse, GlossaryLocaleOption } from "@/app/api/dev/translation-glossary/glossaryRoutes";
import type { RetranslateResponse } from "@/app/api/dev/translation-glossary/retranslate/route";

export type GlossaryRow = TranslationGlossaryRow;
export type GlossaryLocale = GlossaryLocaleOption;
export type GlossaryList = GlossaryListResponse;

export type GlossaryStatusFilter = "all" | "draft" | "approved";

export type GlossaryFilters = {
  status: GlossaryStatusFilter;
  /** A kind as stored, or "" for every kind. */
  kind: string;
  search: string;
};

export const DEFAULT_FILTERS: GlossaryFilters = { status: "draft", kind: "", search: "" };

/** Every kind in the rows, in the order the drafter assigns them, for the kind picker. */
export function kindsOf(rows: readonly GlossaryRow[]): string[] {
  const seen = new Set<string>();
  for (const row of rows) seen.add(row.kind);
  return [...seen].sort();
}

/** Rows the filters keep; search matches the English term or the rendering, case-insensitively. */
export function filterRows(rows: readonly GlossaryRow[], filters: GlossaryFilters): GlossaryRow[] {
  const needle = filters.search.trim().toLowerCase();
  return rows.filter((row) => {
    if (filters.status !== "all" && row.status !== filters.status) return false;
    if (filters.kind && row.kind !== filters.kind) return false;
    if (needle && !row.term.toLowerCase().includes(needle) && !row.target.toLowerCase().includes(needle)) return false;
    return true;
  });
}

const BASE_PATH = "/api/dev/translation-glossary";

export async function fetchGlossary(locale: string | null): Promise<GlossaryList> {
  const url = locale ? `${BASE_PATH}?locale=${encodeURIComponent(locale)}` : BASE_PATH;
  const payload = await requestJson(url, undefined, {
    network: "Network error while loading the glossary.",
    failure: "Unable to load the glossary.",
  });
  return payload as unknown as GlossaryList;
}

/** Returns the terms whose status changed. */
export async function approveTerms(locale: string, terms: readonly string[]): Promise<string[]> {
  const payload = await postJson("approve", { locale, terms }, "Unable to approve those terms.");
  return Array.isArray(payload.approved) ? (payload.approved as string[]) : [];
}

export async function editTerm(locale: string, term: string, target: string): Promise<GlossaryRow> {
  const payload = await postJson("edit", { locale, term, target }, "Unable to save that term.");
  return payload.row as GlossaryRow;
}

export async function retranslateTerms(locale: string, terms: readonly string[]): Promise<RetranslateResponse> {
  const payload = await postJson("retranslate", { locale, terms }, "Unable to enqueue the retranslation.");
  return payload as unknown as RetranslateResponse;
}

export type DraftSummary = { universe: number; existing: number; drafted: number; flagged: number; failed: number; collisions: number };

export async function draftMissingTerms(locale: string): Promise<DraftSummary> {
  const payload = await postJson("draft", { locale }, "Unable to draft the missing terms.");
  const count = (value: unknown) => (Array.isArray(value) ? value.length : 0);
  return {
    universe: Number(payload.universe ?? 0),
    existing: Number(payload.existing ?? 0),
    drafted: Number(payload.drafted ?? 0),
    flagged: count(payload.flagged),
    failed: count(payload.failed),
    collisions: count(payload.collisions),
  };
}

export async function enqueueMainTranslation(locale: string): Promise<{ total: number; jobs: Record<string, number> }> {
  const payload = await postJson("enqueue-all", { locale }, "Unable to enqueue the main translation.");
  return { total: Number(payload.total ?? 0), jobs: (payload.jobs as Record<string, number>) ?? {} };
}

async function postJson(
  action: string,
  body: Record<string, unknown>,
  failure: string,
): Promise<Record<string, unknown>> {
  return requestJson(
    `${BASE_PATH}/${action}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    { network: "Network error while updating the glossary.", failure },
  );
}

async function requestJson(
  url: string,
  init: RequestInit | undefined,
  messages: { network: string; failure: string },
): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = init ? await fetch(url, init) : await fetch(url);
  } catch {
    throw new Error(messages.network);
  }

  const payload: Record<string, unknown> = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof payload.error === "string" ? payload.error : messages.failure);
  }
  return payload;
}
