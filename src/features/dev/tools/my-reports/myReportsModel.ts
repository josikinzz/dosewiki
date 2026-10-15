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

export function sortOwnedReports(rows: readonly OwnedReportRow[]): OwnedReportRow[] {
  return [...rows].sort((a, b) => b.createdAt - a.createdAt);
}

export function formatPublished(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

export function formatTripDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return value;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

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

export function isRevisionConflict(message: string): boolean {
  return /changed since it was opened/i.test(message);
}

export function isWriteFreezeRefusal(message: string): boolean {
  return /frozen|writes are paused/i.test(message);
}

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

export function changedParts(saved: TripReportEditableFields, draft: TripReportEditableFields): string[] {
  return BODY_PARTS.filter(({ key }) => JSON.stringify(saved[key] ?? null) !== JSON.stringify(draft[key] ?? null)).map(
    ({ label }) => label,
  );
}

export function joinParts(parts: readonly string[]): string {
  if (parts.length === 0) return "";
  const named = parts.map((part, index) => (index === 0 ? `the ${part}` : part));
  return named.length === 1 ? named[0] : `${named.slice(0, -1).join(", ")} and ${named[named.length - 1]}`;
}
