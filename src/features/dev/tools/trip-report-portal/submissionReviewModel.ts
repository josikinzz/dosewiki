import { decisionLogOf, UNKNOWN_DECISION_ACTOR } from "@/features/intake/decisionLog";
import { INTAKE_STATUS_LABEL, TRIP_REPORT_INTAKE_STATUS } from "@/features/intake/intakeStatus";
import type { TripReportSubmissionRow } from "@/features/reports/submissions/tripReportSubmissions";
import type { TripReportSubmissionStatus } from "@/features/reports/submissions/tripReportSubmissionStatus";
import type { TripReportEditableFields } from "../../../../../server/lib/tripReportEditing";

export function submissionStatusLabel(status: TripReportSubmissionStatus): string {
  return INTAKE_STATUS_LABEL[TRIP_REPORT_INTAKE_STATUS[status]];
}

function sameActor(left: string | null | undefined, right: string | null | undefined): boolean {
  return Boolean(left && right && left.trim().toLowerCase() === right.trim().toLowerCase());
}

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

export type WriteRefusal =
  | { kind: "frozen"; message: string }
  | { kind: "conflict"; message: string }
  | { kind: "claim"; message: string }
  | { kind: "other"; message: string };

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

export function changedReportParts(
  saved: TripReportEditableFields,
  draft: TripReportEditableFields,
  attributionChanged: boolean,
): string[] {
  const parts = REPORT_PARTS.filter((part) => part.changed(saved, draft)).map((part) => part.label);
  return attributionChanged ? [...parts, "attribution"] : parts;
}

export function attributionMoved(stored: string | null, chosen: string | null): boolean {
  return chosen !== null && chosen.trim() !== (stored ?? "").trim();
}
