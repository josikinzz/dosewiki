import { v } from "../lib/postgres/runtime/values";

export const timelineEntryValidator = v.object({
  time: v.optional(v.string()),
  description: v.string(),
});

export const tripReportSubjectValidator = v.object({
  name: v.string(),
  profile_key: v.optional(v.string()),
  avatar_url: v.optional(v.string()),
  trip_date: v.optional(v.string()),
  age: v.optional(v.string()),
  gender: v.optional(v.string()),
  height: v.optional(v.string()),
  weight: v.optional(v.string()),
  medications: v.optional(v.string()),
  setting: v.optional(v.string()),
  pdf_url: v.optional(v.string()),
});

export const tripReportSubstanceValidator = v.object({
  name: v.string(),
  dose: v.optional(v.string()),
  roa: v.optional(v.string()),
});

/**
 * Record that a human editor decided who a report is by.
 *
 * Stamped only by the submission promotion path. Its absence is what marks the
 * legacy imported corpus, whose bylines were written by editors during import
 * and are therefore still safe to resolve to a contributor by name at read
 * time. A report that carries this marker came from an anonymous submitter, so
 * its byline grants nothing on its own — attribution is whatever the editor
 * assigned here and nothing else.
 */
export const tripReportAttributionReviewValidator = v.object({
  reviewed_by: v.string(),
  reviewed_at: v.string(),
  // "assigned": the editor attributed the report to a contributor profile.
  // "declined": the editor published the byline with no contributor attribution.
  decision: v.union(v.literal("assigned"), v.literal("declined")),
});

export const storedTripReportValidator = v.object({
  slug: v.string(),
  title: v.string(),
  featured: v.optional(v.boolean()),
  // The member who owns this report and may edit it directly; set at
  // promotion when the submitter's contact email matches a member, or by an
  // admin. Unowned reports are admin-only.
  owner_email: v.optional(v.string()),
  subject: tripReportSubjectValidator,
  substances: v.array(tripReportSubstanceValidator),
  introduction: v.optional(v.string()),
  onset: v.array(timelineEntryValidator),
  peak: v.array(timelineEntryValidator),
  offset: v.array(timelineEntryValidator),
  conclusion: v.optional(v.string()),
  tags: v.array(v.string()),
  // Reuse terms for this report. Absent => treated as "author-retained" (legacy
  // reports whose rights stay with the original author). New reports promoted
  // from the public submission form are set to "public-domain" (CC0).
  license: v.optional(v.string()),
  attribution_review: v.optional(tripReportAttributionReviewValidator),
});

export const tripReportImportInputValidator = storedTripReportValidator;
