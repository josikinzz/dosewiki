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

export function decisionNoteOrUndefined(notes: unknown): string | undefined {
  return typeof notes === "string" && notes.trim() !== "" ? notes : undefined;
}
