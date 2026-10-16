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

export const INTAKE_STATUS_TONE: Record<IntakeStatus, "info" | "caution" | "success" | "danger" | "neutral"> = {
  new: "info",
  reviewing: "caution",
  accepted: "success",
  resolved: "success",
  published: "success",
  rejected: "danger",
  spam: "danger",
};

export const FEEDBACK_INTAKE_STATUS = {
  new: "new",
  reviewing: "reviewing",
  resolved: "resolved",
  rejected: "rejected",
  spam: "spam",
} as const satisfies Record<string, IntakeStatus>;

export const TRIP_REPORT_INTAKE_STATUS = {
  submitted: "new",
  reviewing: "reviewing",
  accepted: "accepted",
  rejected: "rejected",
  spam: "spam",
  exported: "published",
  published: "published",
} as const satisfies Record<string, IntakeStatus>;

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
