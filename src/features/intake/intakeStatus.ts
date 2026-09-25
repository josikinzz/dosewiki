/**
 * The one status vocabulary every intake queue shows: Citations, Trip reports
 * and Feedback. Each tool keeps its stored values and maps them here, so a
 * status word means the same thing in every queue. The words and their
 * meanings are recorded under Intake Language in `docs/glossary.md`, and a
 * test keeps the two in step.
 *
 * Client-safe (no node imports).
 */

export const INTAKE_STATUSES = [
  "new",
  "reviewing",
  "accepted",
  "resolved",
  "published",
  "rejected",
  "spam",
] as const;

export type IntakeStatus = (typeof INTAKE_STATUSES)[number];

export const INTAKE_STATUS_LABEL: Record<IntakeStatus, string> = {
  new: "New",
  reviewing: "Reviewing",
  accepted: "Accepted",
  resolved: "Resolved",
  published: "Published",
  rejected: "Rejected",
  spam: "Spam",
};

/** Pill tone per status; matches the editor kit's status pill tones. */
export const INTAKE_STATUS_TONE: Record<IntakeStatus, "info" | "caution" | "success" | "danger" | "neutral"> = {
  new: "info",
  reviewing: "caution",
  accepted: "success",
  resolved: "success",
  published: "success",
  rejected: "danger",
  spam: "danger",
};

/** Feedback stores the shared words directly. */
export const FEEDBACK_INTAKE_STATUS = {
  new: "new",
  reviewing: "reviewing",
  resolved: "resolved",
  rejected: "rejected",
  spam: "spam",
} as const satisfies Record<string, IntakeStatus>;

/** A trip report submission's stored status, or a published report ("published"). */
export const TRIP_REPORT_INTAKE_STATUS = {
  submitted: "new",
  reviewing: "reviewing",
  accepted: "accepted",
  rejected: "rejected",
  spam: "spam",
  exported: "published",
  published: "published",
} as const satisfies Record<string, IntakeStatus>;

/**
 * A citation evidence row's stored status. The three undecided states are all
 * New; the queue shows them with their evidence qualifier (Ready to approve,
 * Needs source, Needs review) because that decides what the reviewer can do.
 */
export const CITATION_INTAKE_STATUS = {
  supported: "new",
  needs_source: "new",
  needs_review: "new",
  approved: "accepted",
  rejected: "rejected",
} as const satisfies Record<string, IntakeStatus>;

export function intakeStatusLabel(status: IntakeStatus): string {
  return INTAKE_STATUS_LABEL[status];
}
