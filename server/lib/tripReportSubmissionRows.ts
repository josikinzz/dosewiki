import { v } from "../../lib/postgres/runtime/values";
import {
  timelineEntryValidator,
  tripReportImportInputValidator,
  tripReportSubjectValidator,
  tripReportSubstanceValidator,
} from "../tripReportContract";

/** Wire validators and row projections for `server/tripReportSubmissions.ts`. */

export const statusValidator = v.union(
  v.literal("submitted"),
  v.literal("reviewing"),
  v.literal("accepted"),
  v.literal("rejected"),
  v.literal("spam"),
  v.literal("exported"),
);

const submissionReportValidator = v.object({
  title: v.string(),
  // Still accepts the submitter-restricted subject fields so rows stored before
  // intake started stripping them keep reading back; `create` and `promote`
  // drop them regardless.
  subject: tripReportSubjectValidator,
  substances: v.array(tripReportSubstanceValidator),
  introduction: v.optional(v.string()),
  onset: v.array(timelineEntryValidator),
  peak: v.array(timelineEntryValidator),
  offset: v.array(timelineEntryValidator),
  conclusion: v.optional(v.string()),
  tags: v.array(v.string()),
});

export const submissionRowValidator = v.object({
  id: v.string(),
  status: statusValidator,
  schema_version: v.number(),
  report: submissionReportValidator,
  title: v.string(),
  author_name: v.string(),
  substance_names: v.array(v.string()),
  contact_email: v.optional(v.string()),
  may_contact: v.boolean(),
  publish_consent: v.boolean(),
  age_confirmed: v.boolean(),
  ip_hash: v.optional(v.string()),
  user_agent: v.optional(v.string()),
  honeypot_triggered: v.boolean(),
  review_notes: v.optional(v.string()),
  reviewed_by: v.optional(v.string()),
  reviewed_at: v.optional(v.string()),
  exported_trip_report_id: v.optional(v.id("tripReports")),
  exported_at: v.optional(v.string()),
  created_at: v.string(),
  updated_at: v.string(),
});

const portalSubmissionSummaryValidator = v.object({
  id: v.string(),
  status: statusValidator,
  title: v.string(),
  author_name: v.string(),
  created_at: v.string(),
  report: v.object({
    subject: v.object({
      name: v.string(),
      trip_date: v.optional(v.string()),
    }),
    substances: v.array(tripReportSubstanceValidator),
    tags: v.array(v.string()),
  }),
});

export const portalSubmissionIndexValidator = v.object({
  needsReview: v.array(portalSubmissionSummaryValidator),
  history: v.array(portalSubmissionSummaryValidator),
});

export const promotionPreviewValidator = v.object({
  row: submissionRowValidator,
  payload: tripReportImportInputValidator,
});

export const promotionResultValidator = v.object({
  submission: submissionRowValidator,
  reportId: v.id("tripReports"),
  payload: tripReportImportInputValidator,
  // The membership whose email matches the submission's contact email, for
  // the admin to assign explicitly. Promotion itself grants no ownership.
  suggestedOwner: v.union(
    v.object({ email: v.string(), username: v.optional(v.string()) }),
    v.null(),
  ),
});

export type SubmissionStatus =
  | "submitted"
  | "reviewing"
  | "accepted"
  | "rejected"
  | "spam"
  | "exported";

export type SubmissionRow = typeof submissionRowValidator.type;

export function toSubmissionRow(row: SubmissionRow): SubmissionRow {
  return {
    id: row.id,
    status: row.status,
    schema_version: row.schema_version,
    report: row.report,
    title: row.title,
    author_name: row.author_name,
    substance_names: row.substance_names,
    contact_email: row.contact_email,
    may_contact: row.may_contact,
    publish_consent: row.publish_consent,
    age_confirmed: row.age_confirmed,
    ip_hash: row.ip_hash,
    user_agent: row.user_agent,
    honeypot_triggered: row.honeypot_triggered,
    review_notes: row.review_notes,
    reviewed_by: row.reviewed_by,
    reviewed_at: row.reviewed_at,
    exported_trip_report_id: row.exported_trip_report_id,
    exported_at: row.exported_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function toPortalSubmissionSummary(row: SubmissionRow) {
  return {
    id: row.id,
    status: row.status,
    title: row.title,
    author_name: row.author_name,
    created_at: row.created_at,
    report: {
      subject: {
        name: row.report.subject.name,
        ...(row.report.subject.trip_date ? { trip_date: row.report.subject.trip_date } : {}),
      },
      substances: row.report.substances,
      tags: row.report.tags,
    },
  };
}
