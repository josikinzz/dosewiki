/**
 * The trip report submission status vocabulary and the transitions between
 * statuses. Client-safe (no node imports), so the review panel, the route, the
 * pure model and the Postgres mutation all read this one table.
 */

export const SUBMISSION_STATUSES = [
  "submitted",
  "reviewing",
  "accepted",
  "rejected",
  "spam",
  "exported",
] as const;

export type TripReportSubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

export const TRIP_REPORT_SUBMISSION_TRANSITIONS: Readonly<
  Record<TripReportSubmissionStatus, readonly TripReportSubmissionStatus[]>
> = {
  submitted: ["reviewing", "accepted", "rejected", "spam"],
  reviewing: ["accepted", "rejected", "spam", "submitted"],
  accepted: ["reviewing", "rejected"],
  rejected: ["reviewing"],
  spam: ["reviewing"],
  exported: [],
};

export function isTripReportSubmissionStatus(value: unknown): value is TripReportSubmissionStatus {
  return typeof value === "string" && SUBMISSION_STATUSES.includes(value as TripReportSubmissionStatus);
}

export function canTransitionTripReportSubmission(
  from: TripReportSubmissionStatus,
  to: TripReportSubmissionStatus,
): boolean {
  return TRIP_REPORT_SUBMISSION_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * A decision note worth storing, or undefined. A blank note means "record only
 * the outcome", so the stored review note stays as it was.
 */
export function decisionNoteOrUndefined(notes: unknown): string | undefined {
  return typeof notes === "string" && notes.trim() !== "" ? notes : undefined;
}
