/**
 * HTTP client and pure helpers for My reports (`/dev/my-reports`).
 *
 * Two endpoints, the same split the portal uses: the owned list carries
 * identity and dates only, and a report's editable body arrives from the
 * record route when it is opened. Saves go back through the record route,
 * which is where ownership is decided.
 */

import type { TripReportEditableFields } from "../../../../../convex/lib/tripReportEditing";

export type OwnedReportRow = {
  id: string;
  slug: string;
  title: string;
  ownerEmail?: string;
  tripDate?: string;
  createdAt: number;
};

export type OwnedReportRecord = {
  id: string;
  slug: string;
  ownerEmail?: string;
  fields: TripReportEditableFields;
};

const MINE_API = "/api/dev/trip-reports/mine";
const RECORD_API = "/api/dev/trip-reports/record";

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

/** Returns the saved slug; the route revalidates the public pages. */
export async function saveOwnedReport(
  id: string,
  expected: TripReportEditableFields,
  updates: TripReportEditableFields,
): Promise<string> {
  const payload = await requestJson(
    RECORD_API,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "save", id, expected, updates }),
    },
    { network: "Network error while saving the report.", failure: "Unable to save that report." },
  );
  return typeof payload.slug === "string" ? payload.slug : "";
}

/** Admin only; the route refuses anyone else before touching Convex. */
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
