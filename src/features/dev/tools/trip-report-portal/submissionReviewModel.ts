/**
 * Pure rules behind the Trip reports review and editing panes: who holds a
 * submission, what a refused write means, and what a report save changes.
 * No React, so the panes, the controller and their tests read one source.
 */

import { decisionLogOf, UNKNOWN_DECISION_ACTOR } from "@/features/intake/decisionLog";
import { INTAKE_STATUS_LABEL, TRIP_REPORT_INTAKE_STATUS } from "@/features/intake/intakeStatus";
import type { TripReportSubmissionRow } from "@/features/reports/submissions/tripReportSubmissions";
import type { TripReportSubmissionStatus } from "@/features/reports/submissions/tripReportSubmissionStatus";
import type { TripReportEditableFields } from "../../../../../server/lib/tripReportEditing";

/** A submission's status in the shared intake words (docs/glossary.md, Intake Status). */
export function submissionStatusLabel(status: TripReportSubmissionStatus): string {
  return INTAKE_STATUS_LABEL[TRIP_REPORT_INTAKE_STATUS[status]];
}

function sameActor(left: string | null | undefined, right: string | null | undefined): boolean {
  return Boolean(left && right && left.trim().toLowerCase() === right.trim().toLowerCase());
}

/**
 * Who holds a submission, or who decided it. Trip reports claim through the
 * Reviewing status, and the decision that moved the row into its status names
 * the actor (the Feedback tool's `holdOf`, in this queue's statuses).
 *
 * - `open`: New, nobody has it.
 * - `mine` / `other`: Reviewing, claimed by the viewer or another admin.
 * - `unknown`: Reviewing with no recorded reviewer.
 * - `accepted`: agreed, and waiting on Publish.
 * - `decided`: Rejected or Spam; Reopen puts it back in review.
 * - `published`: live; nothing changes the submission any more.
 */
export type SubmissionHold =
  | { kind: "open" }
  | { kind: "mine"; at: string | null }
  | { kind: "other"; by: string; at: string | null }
  | { kind: "unknown" }
  | { kind: "accepted" | "decided" | "published"; status: TripReportSubmissionStatus; by: string | null; at: string | null; mine: boolean };

export function submissionHoldOf(
  row: Pick<TripReportSubmissionRow, "status" | "created_at" | "reviewed_by" | "reviewed_at" | "review_notes" | "decision_log">,
  viewer: string | null | undefined,
): SubmissionHold {
  if (row.status === "submitted") return { kind: "open" };
  const log = decisionLogOf(row);
  const entry = [...log].reverse().find((candidate) => candidate.to === row.status && candidate.from !== candidate.to);
  const actor = entry && entry.actor !== UNKNOWN_DECISION_ACTOR ? entry.actor : row.reviewed_by?.trim() || null;
  const at = entry?.at ?? row.reviewed_at ?? null;
  if (row.status === "reviewing") {
    if (!actor) return { kind: "unknown" };
    return sameActor(actor, viewer) ? { kind: "mine", at } : { kind: "other", by: actor, at };
  }
  const kind = row.status === "accepted" ? "accepted" : row.status === "exported" ? "published" : "decided";
  return { kind, status: row.status, by: actor, at, mine: sameActor(actor, viewer) };
}

/** How a list row names who has a submission: "You", "Claimed by X", or nothing. */
export function holderWord(hold: SubmissionHold, nameOf: (email: string) => string): string | null {
  if (hold.kind === "mine") return "You";
  if (hold.kind === "other") return `Claimed by ${nameOf(hold.by)}`;
  return null;
}

/** A refused write, sorted by what the editor can do about it. */
export type WriteRefusal =
  | { kind: "frozen"; message: string }
  | { kind: "conflict"; message: string }
  | { kind: "claim"; message: string }
  | { kind: "other"; message: string };

/**
 * Sort a refused write by the route's words and status. The freeze answers
 * 503 with `DATA_WRITES_FROZEN`; a revision conflict says "changed since it
 * was opened"; the byline guard says a name "matches contributor profile".
 */
export function classifyRefusal(status: number, payload: unknown, fallback: string): WriteRefusal {
  const record = (payload ?? {}) as { error?: unknown; code?: unknown };
  const message = typeof record.error === "string" && record.error.trim() ? record.error : fallback;
  if (record.code === "DATA_WRITES_FROZEN" || /DATA_WRITES_FROZEN|writes are frozen|writes are paused/i.test(message)) {
    return { kind: "frozen", message };
  }
  if (/changed since it was opened/i.test(message)) return { kind: "conflict", message };
  if (/matches contributor profile/i.test(message)) return { kind: "claim", message };
  return { kind: "other", message };
}

export const FREEZE_DECISION_COPY = "Writes are paused, so that was not saved. Try again once they resume.";
export const FREEZE_SAVE_COPY =
  "Writes are paused, so your changes were not published. They are still here; save again once writes resume.";

const REPORT_PARTS: { label: string; changed: (saved: TripReportEditableFields, draft: TripReportEditableFields) => boolean }[] = [
  { label: "title", changed: (a, b) => a.title !== b.title },
  { label: "byline", changed: (a, b) => a.subject.name !== b.subject.name },
  {
    label: "trip details",
    changed: (a, b) => {
      const { name: _left, ...leftRest } = a.subject;
      const { name: _right, ...rightRest } = b.subject;
      void _left;
      void _right;
      return JSON.stringify(leftRest) !== JSON.stringify(rightRest);
    },
  },
  { label: "substances", changed: (a, b) => JSON.stringify(a.substances) !== JSON.stringify(b.substances) },
  { label: "tags", changed: (a, b) => JSON.stringify(a.tags) !== JSON.stringify(b.tags) },
  { label: "introduction", changed: (a, b) => (a.introduction ?? "") !== (b.introduction ?? "") },
  { label: "onset", changed: (a, b) => JSON.stringify(a.onset) !== JSON.stringify(b.onset) },
  { label: "peak", changed: (a, b) => JSON.stringify(a.peak) !== JSON.stringify(b.peak) },
  { label: "offset", changed: (a, b) => JSON.stringify(a.offset) !== JSON.stringify(b.offset) },
  { label: "conclusion", changed: (a, b) => (a.conclusion ?? "") !== (b.conclusion ?? "") },
];

/**
 * The parts of a published report a draft changes, in reading order, plus
 * attribution when the profile moved ("the title, byline and attribution").
 */
export function changedReportParts(
  saved: TripReportEditableFields,
  draft: TripReportEditableFields,
  attributionChanged: boolean,
): string[] {
  const parts = REPORT_PARTS.filter((part) => part.changed(saved, draft)).map((part) => part.label);
  return attributionChanged ? [...parts, "attribution"] : parts;
}

/** A profile choice that differs from the stored one; null means untouched. */
export function attributionMoved(stored: string | null, chosen: string | null): boolean {
  return chosen !== null && chosen.trim() !== (stored ?? "").trim();
}
