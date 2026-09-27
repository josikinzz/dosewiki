/**
 * HTTP client and pure helpers for My reports (`/dev/my-reports`).
 *
 * Two endpoints, the same split the portal uses: the owned list carries
 * identity and dates only, and a report's editable body arrives from the
 * record route when it is opened. Saves go back through the record route,
 * which is where ownership is decided.
 */

import type { IntakeStatus } from "@/features/intake/intakeStatus";
import type { TripReportEditableFields } from "../../../../../server/lib/tripReportEditing";
import { devFetch } from "@/features/dev/tools/devFetch";

export type OwnedReportRow = {
  id: string;
  slug: string;
  title: string;
  tripDate?: string;
  createdAt: number;
};

export type OwnedReportRecord = {
  id: string;
  slug: string;
  ownerEmail?: string;
  fields: TripReportEditableFields;
  revision: string;
};

/**
 * One of the member's own submissions as the route projects it: the shared
 * status word, dates, a public reason when one was given, and the published
 * address. Nothing private travels.
 */
export type MemberSubmission = {
  id: string;
  title: string;
  status: Exclude<IntakeStatus, "spam" | "resolved">;
  submitted_at: string;
  decided_at?: string;
  public_reason?: string;
  report_slug?: string;
};

const MINE_API = "/api/dev/trip-reports/mine";
const MY_SUBMISSIONS_API = "/api/dev/trip-reports/mine/submissions";
const RECORD_API = "/api/dev/trip-reports/record";

export async function fetchMySubmissions(): Promise<MemberSubmission[]> {
  const payload = await requestJson(MY_SUBMISSIONS_API, undefined, {
    network: "Network error while loading your submissions.",
    failure: "Unable to load your submissions.",
  });
  return Array.isArray(payload.submissions) ? (payload.submissions as MemberSubmission[]) : [];
}

export async function fetchOwnedReports(): Promise<OwnedReportRow[]> {
  const payload = await requestJson(MINE_API, undefined, {
    network: "Network error while loading your reports.",
    failure: "Unable to load your reports.",
  });
  return Array.isArray(payload.reports) ? (payload.reports as OwnedReportRow[]) : [];
}

export async function fetchOwnedRecord(id: string): Promise<OwnedReportRecord> {
  const payload = await requestJson(`${RECORD_API}?id=${encodeURIComponent(id)}`, undefined, {
    network: "Network error while opening the report.",
    failure: "Unable to open that report.",
  });
  if (typeof payload.report !== "object" || payload.report === null) {
    throw new Error("The record route returned no report.");
  }
  return payload.report as OwnedReportRecord;
}

/** Returns the authoritative snapshot stored by the route after publication. */
export async function saveOwnedReport(
  id: string,
  expected: TripReportEditableFields,
  updates: TripReportEditableFields,
  expectedRevision: string,
): Promise<Pick<OwnedReportRecord, "slug" | "fields" | "revision">> {
  const payload = await requestJson(
    RECORD_API,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "save", id, expected, expectedRevision, updates, operationId: crypto.randomUUID() }),
    },
    { network: "Network error while saving the report.", failure: "Unable to save that report." },
  );
  if (typeof payload.slug !== "string" || typeof payload.fields !== "object" || payload.fields === null || typeof payload.revision !== "string") {
    throw new Error("The save route returned no authoritative report snapshot.");
  }
  return {
    slug: payload.slug,
    fields: payload.fields as TripReportEditableFields,
    revision: payload.revision,
  };
}

/** Admin only; the route refuses anyone else before touching Postgres. */
export async function assignReportOwner(
  slug: string,
  email: string,
): Promise<{ slug: string; ownerEmail: string }> {
  const payload = await requestJson(
    `/api/dev/trip-reports/${encodeURIComponent(slug.trim())}/owner`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim() }),
    },
    { network: "Network error while assigning the owner.", failure: "Unable to assign that owner." },
  );
  return {
    slug: typeof payload.slug === "string" ? payload.slug : slug.trim(),
    ownerEmail: typeof payload.ownerEmail === "string" ? payload.ownerEmail : email.trim(),
  };
}

/** Newest first by publication time; the list is small enough to sort in place. */
export function sortOwnedReports(rows: readonly OwnedReportRow[]): OwnedReportRow[] {
  return [...rows].sort((a, b) => b.createdAt - a.createdAt);
}

/** Date only: when a report went up, never the time. */
export function formatPublished(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

/**
 * A trip date as a row shows it ("1 Feb 2026"). The stored value is a calendar
 * day, so it is read in UTC and never shifts with the viewer's zone. Anything
 * that does not parse as a day comes back as written.
 */
export function formatTripDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return value;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

/**
 * The slug an admin means, from whatever they pasted: a bare slug, the path
 * `/reports/<slug>`, or the full page address. Presentation only; the owner
 * route still decides whether the report exists.
 */
export function normalizeReportSlug(input: string): string {
  let value = input.trim();
  try {
    if (/^https?:\/\//i.test(value)) value = new URL(value).pathname;
  } catch {
    return value;
  }
  value = value.replace(/[?#].*$/, "").replace(/^\/+|\/+$/g, "");
  return value.startsWith("reports/") ? value.slice("reports/".length) : value;
}

/** A save refused because someone saved the report after it was opened (the record route's 409 wording). */
export function isRevisionConflict(message: string): boolean {
  return /changed since it was opened/i.test(message);
}

/** A save refused because writes are frozen (the write boundary's wording). */
export function isWriteFreezeRefusal(message: string): boolean {
  return /frozen|writes are paused/i.test(message);
}

/** What a submission's row says under its title, by status. */
export type SubmissionOutcome =
  | { kind: "reason"; reason: string }
  | { kind: "live"; slug: string }
  | { kind: "note"; text: string };

export function submissionOutcome(row: MemberSubmission): SubmissionOutcome {
  if (row.public_reason) return { kind: "reason", reason: row.public_reason };
  if (row.status === "published" && row.report_slug) return { kind: "live", slug: row.report_slug };
  switch (row.status) {
    case "rejected":
      return { kind: "note", text: "No reason was given." };
    case "published":
      return { kind: "note", text: "Live on the site." };
    case "accepted":
      return { kind: "note", text: "Accepted and waiting to be published." };
    default:
      return { kind: "note", text: "Waiting on a reviewer." };
  }
}

/** Submissions newest first, so a fresh decision is on top. */
export function sortSubmissions(rows: readonly MemberSubmission[]): MemberSubmission[] {
  return [...rows].sort((a, b) => b.submitted_at.localeCompare(a.submitted_at));
}

function requestJson(
  url: string,
  init: RequestInit | undefined,
  messages: { network: string; failure: string },
) {
  return devFetch(url, { ...init, messages, emptyBodyOk: true });
}

const BODY_PARTS: { key: keyof TripReportEditableFields; label: string }[] = [
  { key: "title", label: "title" },
  { key: "tags", label: "tags" },
  { key: "introduction", label: "introduction" },
  { key: "onset", label: "onset" },
  { key: "peak", label: "peak" },
  { key: "offset", label: "offset" },
  { key: "conclusion", label: "conclusion" },
];

/** The parts of a report a draft changes, in reading order ("title", "tags", "peak"). */
export function changedParts(saved: TripReportEditableFields, draft: TripReportEditableFields): string[] {
  return BODY_PARTS.filter(({ key }) => JSON.stringify(saved[key] ?? null) !== JSON.stringify(draft[key] ?? null)).map(
    ({ label }) => label,
  );
}

/** "the title, tags and peak": a list as a sentence says it. */
export function joinParts(parts: readonly string[]): string {
  if (parts.length === 0) return "";
  const named = parts.map((part, index) => (index === 0 ? `the ${part}` : part));
  return named.length === 1 ? named[0] : `${named.slice(0, -1).join(", ")} and ${named[named.length - 1]}`;
}
