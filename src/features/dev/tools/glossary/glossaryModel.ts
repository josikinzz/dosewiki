/**
 * Pure helpers and the HTTP client for the Glossary tab
 * (`/api/dev/translation-glossary`).
 */

import type { GlossaryCollision, GlossaryStatus } from "@server/translation/glossary";
import type { GlossaryGloss } from "@server/translation/glossaryGloss";
import type { ReviewReason } from "@server/translation/reviewReason";
import type { GlossaryListResponse, GlossaryProgressResponse, GlossaryRowPatch } from "@/app/api/dev/translation-glossary/glossaryRoutes";
import type { RetranslateResponse } from "@/app/api/dev/translation-glossary/retranslate/route";
import { glossaryLanguage } from "@/features/language-glossary/languageGlossary";
import { devFetch } from "@/features/dev/tools/devFetch";
import { isWriteFreezeRefusal } from "@/features/dev/components/writeFreeze";

export type GlossaryRow = GlossaryListResponse["rows"][number];

/**
 * Live wording nobody has checked: approved before review tracking existed,
 * so it already reaches prompts, the UI catalog, and the public glossary. A
 * pending draft over such a row is a draft first.
 */
export const isLiveUnchecked = (row: GlossaryRow) => row.status === "approved" && row.review_provenance === "legacy_unverified";

/** A row that still wants a person: a draft to approve, or live wording to confirm. */
export const needsReview = (row: GlossaryRow) => row.status === "draft" || isLiveUnchecked(row);

/** The three review states. Each row is in exactly one. */
export type ReviewCounts = { drafts: number; unchecked: number; approved: number };

export function reviewCounts(rows: readonly GlossaryRow[]): ReviewCounts {
  const counts: ReviewCounts = { drafts: 0, unchecked: 0, approved: 0 };
  for (const row of rows) {
    if (row.status === "draft") counts.drafts += 1;
    else if (isLiveUnchecked(row)) counts.unchecked += 1;
    else counts.approved += 1;
  }
  return counts;
}

/** "3 unreviewed · 2 live, never checked"; either part drops out at zero, and `null` means nothing is left. */
export function standingLabel({ drafts, unchecked }: Pick<ReviewCounts, "drafts" | "unchecked">): string | null {
  const parts = [drafts > 0 ? `${drafts} ${STATE_WORD.draft}` : null, unchecked > 0 ? `${unchecked} live, never checked` : null].filter((part): part is string => part !== null);
  return parts.length > 0 ? parts.join(" · ") : null;
}

export type GlossaryList = GlossaryListResponse;
export type GlossaryProgress = GlossaryProgressResponse;
export type { GlossaryRowPatch };

/** The list with a row write's result applied: written rows replace theirs in place, and the retranslation list follows the server. */
export function applyRowPatch(list: GlossaryList, patch: GlossaryRowPatch): GlossaryList {
  const written = new Map(patch.rows.map((row) => [row.term, row]));
  return { ...list, rows: list.rows.map((row) => written.get(row.term) ?? row), pending: patch.pending };
}

export type GlossaryStatusFilter = "all" | "draft" | "unchecked" | "approved";

export type GlossaryFilters = {
  status: GlossaryStatusFilter;
  search: string;
};

export const DEFAULT_FILTERS: GlossaryFilters = { status: "all", search: "" };

/**
 * What a reviewer reads for each stored status. "draft" stays the API and DB
 * value; "unreviewed" is the only word the tab shows for it.
 */
export const STATE_WORD: Record<GlossaryStatus, string> = { draft: "unreviewed", approved: "approved" };

/** "Deutsch (German)" where the site knows the language's own name, else the code. */
export function languageLabel(code: string): string {
  const language = glossaryLanguage(code);
  if (!language) return code;
  return language.nativeName && language.nativeName !== language.name ? `${language.nativeName} (${language.name})` : language.name;
}

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

/** `draftCount` is exactly what the group's "Approve all" approves; `uncheckedCount` what "Confirm all" confirms. */
export type GlossaryGroup = { category: GlossaryCategory; rows: GlossaryRow[]; draftCount: number; uncheckedCount: number };

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
      const counts = reviewCounts(grouped);
      return { category, rows: grouped, draftCount: counts.drafts, uncheckedCount: counts.unchecked };
    });
}

/** Rows the filters keep; search matches the English term or the rendering, case-insensitively. */
export function filterRows(rows: readonly GlossaryRow[], filters: GlossaryFilters): GlossaryRow[] {
  const needle = filters.search.trim().toLowerCase();
  return rows.filter((row) => {
    if (filters.status === "draft" && row.status !== "draft") return false;
    if (filters.status === "unchecked" && !isLiveUnchecked(row)) return false;
    if (filters.status === "approved" && (row.status !== "approved" || isLiveUnchecked(row))) return false;
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

/**
 * A refused glossary write the workbench can say more about: writes are
 * paused (503 with the freeze code), or someone saved the row after the
 * reviewer opened it (409 with the review conflict code).
 */
export class GlossaryWriteRefusal extends Error {
  constructor(message: string, readonly frozen: boolean, readonly conflict: boolean) {
    super(message);
    this.name = "GlossaryWriteRefusal";
  }
}

/** The words a refusal shows: the freeze in the editor's own sentence, anything else as the route said it. */
export function describeWriteRefusal(error: unknown, fallback: string): { message: string; frozen: boolean; conflict: boolean } {
  const message = error instanceof Error ? error.message : fallback;
  const code = error && typeof error === "object" ? (error as { code?: unknown }).code : undefined;
  const frozen = (error instanceof GlossaryWriteRefusal && error.frozen) || code === "DATA_WRITES_FROZEN";
  const conflict = (error instanceof GlossaryWriteRefusal && error.conflict) || code === "TRANSLATION_REVIEW_CONFLICT";
  return { message: frozen ? "Writes are paused, so that was not saved." : message, frozen, conflict };
}

/** A collision refusal is data for a reviewer, not an automatic retry. */
export class GlossaryReviewCollision extends Error {
  constructor(message: string, readonly collisions: GlossaryCollision[], readonly collisionConfirmation: string) {
    super(message);
    this.name = "GlossaryReviewCollision";
  }
}

export async function fetchGlossary(locale: string | null, includeUsage = false): Promise<GlossaryList> {
  const params = new URLSearchParams();
  if (locale) params.set("locale", locale);
  params.set("includeUsage", includeUsage ? "1" : "0");
  const url = `${BASE_PATH}${params.size ? `?${params}` : ""}`;
  const payload = await requestJson(url, { cache: "no-store" }, {
    network: "Network error while loading the glossary.",
    failure: "Unable to load the glossary.",
  });
  return payload as unknown as GlossaryList;
}

/** The poll during a run: job and segment counts against the digest already held, never the rows. */
export async function fetchGlossaryProgress(locale: string, promptVersion: string): Promise<GlossaryProgress> {
  const params = new URLSearchParams({ locale, progress: "1", promptVersion });
  const payload = await requestJson(`${BASE_PATH}?${params}`, { cache: "no-store" }, {
    network: "Network error while refreshing progress.",
    failure: "Unable to refresh progress.",
  });
  return payload as unknown as GlossaryProgress;
}

/** The written rows a row write returns, or `null` from a server that sent none, so the caller reloads instead. */
function rowPatchOf(payload: Record<string, unknown>): GlossaryRowPatch | null {
  return Array.isArray(payload.rows) && Array.isArray(payload.pending) ? { rows: payload.rows as GlossaryRow[], pending: payload.pending as string[] } : null;
}

/** `terms` are those whose status changed; `patch` is the written rows as they now stand. */
export type GlossaryWrite = { terms: string[]; patch: GlossaryRowPatch | null };

export async function approveTerms(locale: string, terms: readonly string[], collisionConfirmation?: string, expectedRevisions?: Record<string, string>, reason?: ReviewReason): Promise<GlossaryWrite> {
  const payload = await postJson("approve", { locale, terms, collisionConfirmation, expectedRevisions, reason }, "Unable to approve those terms.");
  return { terms: Array.isArray(payload.approved) ? (payload.approved as string[]) : [], patch: rowPatchOf(payload) };
}

/** Confirms live wording nobody has checked, unchanged, at the revisions shown. */
export async function confirmTerms(locale: string, terms: readonly string[], expectedRevisions: Record<string, string>, collisionConfirmation?: string, reason?: ReviewReason): Promise<GlossaryWrite> {
  const payload = await postJson("confirm", { locale, terms, expectedRevisions, collisionConfirmation, reason }, "Unable to confirm those terms.");
  return { terms: Array.isArray(payload.confirmed) ? (payload.confirmed as string[]) : [], patch: rowPatchOf(payload) };
}

/** Saves a draft rendering; never approves it. */
export async function editTerm(locale: string, term: string, target: string, collisionConfirmation?: string, expectedRevision?: string, reason?: ReviewReason): Promise<GlossaryRow> {
  return (await saveTermDraft(locale, term, target, collisionConfirmation, expectedRevision, reason)).row;
}

/** `editTerm` plus the row patch the workbench applies in place. */
export async function saveTermDraft(locale: string, term: string, target: string, collisionConfirmation?: string, expectedRevision?: string, reason?: ReviewReason): Promise<{ row: GlossaryRow; patch: GlossaryRowPatch | null }> {
  const payload = await postJson("edit", { locale, term, target, collisionConfirmation, expectedRevision, intent: "draft", reason }, "Unable to save that term.");
  return { row: payload.row as GlossaryRow, patch: rowPatchOf(payload) };
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

/** Gives the latest run's pages that stopped after repeated failures a fresh set of attempts; admin only. */
export async function retryExhaustedPages(locale: string): Promise<number> {
  const payload = await postJson("retry-exhausted", { locale }, "Unable to retry the failed pages.");
  return Number(payload.requeued ?? 0);
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

function requestJson(
  url: string,
  init: RequestInit | undefined,
  messages: { network: string; failure: string },
) {
  return devFetch(url, {
    ...init,
    messages,
    emptyBodyOk: true,
    onError: (status, payload, message) => {
      if (status === 409 && typeof payload.collisionConfirmation === "string" && /^[a-f0-9]{64}$/.test(payload.collisionConfirmation)
        && Array.isArray(payload.collisions) && payload.collisions.length > 0
        && payload.collisions.every((collision: unknown) => {
          if (!collision || typeof collision !== "object") return false;
          const item = collision as Record<string, unknown>;
          return typeof item.kind === "string" && typeof item.target === "string"
            && Array.isArray(item.terms) && item.terms.length > 1 && item.terms.every((term: unknown) => typeof term === "string");
        })) {
        return new GlossaryReviewCollision(message, payload.collisions as GlossaryCollision[], payload.collisionConfirmation);
      }
      if (isWriteFreezeRefusal(status, payload)) return new GlossaryWriteRefusal(message, true, false);
      if (status === 409 && payload.code === "TRANSLATION_REVIEW_CONFLICT") return new GlossaryWriteRefusal(message, false, true);
      return undefined;
    },
  });
}
