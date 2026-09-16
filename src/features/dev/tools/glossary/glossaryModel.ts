/**
 * Pure helpers and the HTTP client for the Glossary tab
 * (`/api/dev/translation-glossary`).
 */

import type { GlossaryCollision, GlossaryStatus, TranslationGlossaryRow } from "@server/translation/glossary";
import type { GlossaryGloss } from "@server/translation/glossaryGloss";
import type { GlossaryListResponse } from "@/app/api/dev/translation-glossary/glossaryRoutes";
import type { RetranslateResponse } from "@/app/api/dev/translation-glossary/retranslate/route";

export type GlossaryRow = TranslationGlossaryRow;

export type GlossaryList = GlossaryListResponse;

export type GlossaryStatusFilter = "all" | "draft" | "approved";

export type GlossaryFilters = {
  status: GlossaryStatusFilter;
  search: string;
};

export const DEFAULT_FILTERS: GlossaryFilters = { status: "draft", search: "" };

/**
 * What a reviewer reads for each stored status. "draft" stays the API and DB
 * value; "unreviewed" is the only word the tab shows for it.
 */
export const STATE_WORD: Record<GlossaryStatus, string> = { draft: "unreviewed", approved: "approved" };

/** "1 term", "3 terms"; pass the plural for an irregular noun. */
export function count(n: number, noun: string, plural = noun + "s"): string {
  return `${n} ${n === 1 ? noun : plural}`;
}

/**
 * Categories, kind labels, and the kind-to-category fold live in
 * `@/lib/glossary/glossaryCategories` so the public /glossary page shares
 * them without importing an editor module; re-exported here for the tab.
 */
export { GLOSSARY_CATEGORIES, kindLabel } from "@/lib/glossary/glossaryCategories";
import { GLOSSARY_CATEGORIES, OTHER_CATEGORY, categoryForKind, type GlossaryCategory } from "@/lib/glossary/glossaryCategories";

export type GlossaryGroup = { category: GlossaryCategory; rows: GlossaryRow[]; draftCount: number };

/**
 * Rows folded into their categories, in category order, empty categories
 * dropped. Within a category, rows keep the order they arrived in (the API
 * sorts by term), so a reviewer reading down a group reads alphabetically.
 */
export function groupRows(rows: readonly GlossaryRow[]): GlossaryGroup[] {
  const buckets: Record<string, GlossaryRow[]> = {};
  for (const row of rows) {
    const category = categoryForKind(row.kind);
    (buckets[category.id] ??= []).push(row);
  }
  return [...GLOSSARY_CATEGORIES, OTHER_CATEGORY]
    .filter((category) => category.id in buckets)
    .map((category) => {
      const grouped = buckets[category.id];
      return { category, rows: grouped, draftCount: grouped.filter((row) => row.status === "draft").length };
    });
}

/** Rows the filters keep; search matches the English term or the rendering, case-insensitively. */
export function filterRows(rows: readonly GlossaryRow[], filters: GlossaryFilters): GlossaryRow[] {
  const needle = filters.search.trim().toLowerCase();
  return rows.filter((row) => {
    if (filters.status !== "all" && row.status !== filters.status) return false;
    if (needle && !row.term.toLowerCase().includes(needle) && !row.target.toLowerCase().includes(needle)) return false;
    return true;
  });
}

/**
 * The CSV a translator edits in a spreadsheet, RFC 4180 quoting, CRLF
 * records. Import reads `term,target,kind,status`; export writes those plus a
 * trailing `gloss`, the English definition, which is there for the reader in
 * the spreadsheet and is not taken back on import (definitions are edited in
 * the tab). Export prefixes a byte-order mark so spreadsheets open the file
 * as Unicode; parse strips it again.
 */
const GLOSSARY_CSV_COLUMNS = ["term", "target", "kind", "status"] as const;
const GLOSSARY_EXPORT_COLUMNS = [...GLOSSARY_CSV_COLUMNS, "gloss"] as const;

const CSV_BOM = "\uFEFF";

/** One record the import route validates; kind and status are whatever the file said, blank when absent. */
export type GlossaryCsvRow = { term: string; target: string; kind: string; status: string };

export class GlossaryCsvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GlossaryCsvError";
  }
}

function csvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function glossaryToCsv(
  rows: readonly Pick<GlossaryRow, "term" | "target" | "kind" | "status">[],
  glosses: Readonly<Record<string, string>>,
): string {
  const lines = [GLOSSARY_EXPORT_COLUMNS.join(",")];
  for (const row of rows) lines.push(GLOSSARY_EXPORT_COLUMNS.map((column) => csvField(column === "gloss" ? (glosses[row.term] ?? "") : row[column])).join(","));
  return CSV_BOM + lines.join("\r\n") + "\r\n";
}

/** RFC 4180 records: quoted fields may hold commas, doubled quotes, and line breaks; CRLF and LF both end a record. */
function csvRecords(text: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1; } else quoted = false;
      } else field += char;
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      record.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      record.push(field);
      records.push(record);
      record = [];
      field = "";
    } else field += char;
  }
  if (field.length > 0 || record.length > 0) {
    record.push(field);
    records.push(record);
  }
  return records;
}

/**
 * The rows of an exported (or hand-made) glossary CSV. The header names the
 * columns, so their order and any extra column do not matter; `term` and
 * `target` are required, `kind` and `status` optional. Blank records are
 * skipped; a record with a target but no term is an error, since a row
 * without a term cannot be matched to anything.
 */
export function parseGlossaryCsv(text: string): GlossaryCsvRow[] {
  const records = csvRecords(text.startsWith(CSV_BOM) ? text.slice(1) : text);
  const header = records.shift()?.map((name) => name.trim().toLowerCase()) ?? [];
  const column = Object.fromEntries(GLOSSARY_CSV_COLUMNS.map((name) => [name, header.indexOf(name)])) as Record<(typeof GLOSSARY_CSV_COLUMNS)[number], number>;
  if (column.term < 0 || column.target < 0) {
    throw new GlossaryCsvError(`The first line must name the columns, at least "term" and "target" (the export writes ${GLOSSARY_CSV_COLUMNS.join(",")}).`);
  }
  const cell = (record: string[], index: number) => (index >= 0 ? (record[index] ?? "").trim() : "");
  const rows: GlossaryCsvRow[] = [];
  records.forEach((record, offset) => {
    if (record.every((value) => value.trim() === "")) return;
    const term = cell(record, column.term);
    if (!term) throw new GlossaryCsvError(`Line ${offset + 2} has no term.`);
    rows.push({ term, target: cell(record, column.target), kind: cell(record, column.kind), status: cell(record, column.status) });
  });
  return rows;
}

const BASE_PATH = "/api/dev/translation-glossary";

/** A collision refusal is data for a reviewer, not an automatic retry. */
export class GlossaryReviewCollision extends Error {
  constructor(message: string, readonly collisions: GlossaryCollision[], readonly collisionConfirmation: string) {
    super(message);
    this.name = "GlossaryReviewCollision";
  }
}

export async function fetchGlossary(locale: string | null): Promise<GlossaryList> {
  const url = locale ? `${BASE_PATH}?locale=${encodeURIComponent(locale)}` : BASE_PATH;
  const payload = await requestJson(url, undefined, {
    network: "Network error while loading the glossary.",
    failure: "Unable to load the glossary.",
  });
  return payload as unknown as GlossaryList;
}

/** Returns the terms whose status changed. */
export async function approveTerms(locale: string, terms: readonly string[], collisionConfirmation?: string): Promise<string[]> {
  const payload = await postJson("approve", { locale, terms, collisionConfirmation }, "Unable to approve those terms.");
  return Array.isArray(payload.approved) ? (payload.approved as string[]) : [];
}

export async function editTerm(locale: string, term: string, target: string, collisionConfirmation?: string): Promise<GlossaryRow> {
  const payload = await postJson("edit", { locale, term, target, collisionConfirmation }, "Unable to save that term.");
  return payload.row as GlossaryRow;
}

/** Writes the English definition shown under the term on every mirror and injected into every prompt; editor and up. */
export async function saveGloss(term: string, gloss: string): Promise<GlossaryGloss> {
  const payload = await postJson("gloss", { term, gloss }, "Unable to save that definition.");
  return payload.row as GlossaryGloss;
}

export async function retranslateTerms(locale: string, terms: readonly string[]): Promise<RetranslateResponse> {
  const payload = await postJson("retranslate", { locale, terms }, "Unable to enqueue the retranslation.");
  return payload as unknown as RetranslateResponse;
}

/** `shared` counts terms whose drafted rendering collided with an existing one and were left for review. */
export type DraftSummary = { universe: number; existing: number; drafted: number; flagged: number; failed: number; shared: number };

export async function draftMissingTerms(locale: string): Promise<DraftSummary> {
  const payload = await postJson("draft", { locale }, "Unable to draft the missing terms.");
  const size = (value: unknown) => (Array.isArray(value) ? value.length : 0);
  return {
    universe: Number(payload.universe ?? 0),
    existing: Number(payload.existing ?? 0),
    drafted: Number(payload.drafted ?? 0),
    flagged: size(payload.flagged),
    failed: size(payload.failed),
    shared: size(payload.collisions),
  };
}

export async function startMainTranslation(locale: string): Promise<{ total: number; jobs: Record<string, number> }> {
  const payload = await postJson("enqueue-all", { locale }, "Unable to start the main translation.");
  return { total: Number(payload.total ?? 0), jobs: (payload.jobs as Record<string, number>) ?? {} };
}

export function glossaryExportUrl(locale: string): string {
  return `${BASE_PATH}/export?locale=${encodeURIComponent(locale)}`;
}

export type ImportSummary = { approved: number; drafts: number };

/** Sends the file as it was read; the server parses, validates, and writes it whole or not at all. */
export async function importGlossaryCsv(locale: string, csv: string, collisionConfirmation?: string): Promise<ImportSummary> {
  const payload = await requestJson(
    `${BASE_PATH}/import?locale=${encodeURIComponent(locale)}`,
    {
      method: "POST",
      headers: { "Content-Type": "text/csv; charset=utf-8", ...(collisionConfirmation ? { "X-Glossary-Collision-Confirmation": collisionConfirmation } : {}) },
      body: csv,
    },
    { network: "Network error while importing the glossary.", failure: "Unable to import that file." },
  );
  return { approved: Number(payload.approved ?? 0), drafts: Number(payload.drafts ?? 0) };
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
    if (response.status === 409 && typeof payload.collisionConfirmation === "string" && /^[a-f0-9]{64}$/.test(payload.collisionConfirmation)
      && Array.isArray(payload.collisions) && payload.collisions.length > 0
      && payload.collisions.every((collision: unknown) => {
        if (!collision || typeof collision !== "object") return false;
        const item = collision as Record<string, unknown>;
        return typeof item.kind === "string" && typeof item.target === "string"
          && Array.isArray(item.terms) && item.terms.length > 1 && item.terms.every((term: unknown) => typeof term === "string");
      })) {
      throw new GlossaryReviewCollision(
        typeof payload.error === "string" ? payload.error : messages.failure,
        payload.collisions as GlossaryCollision[],
        payload.collisionConfirmation,
      );
    }
    throw new Error(typeof payload.error === "string" ? payload.error : messages.failure);
  }
  return payload;
}
