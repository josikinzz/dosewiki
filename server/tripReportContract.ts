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

export const tripReportAttributionReviewValidator = v.object({
  reviewed_by: v.string(),
  reviewed_at: v.string(),
  decision: v.union(v.literal("assigned"), v.literal("declined")),
});

export const storedTripReportValidator = v.object({
  slug: v.string(),
  title: v.string(),
  featured: v.optional(v.boolean()),
  owner_email: v.optional(v.string()),
  subject: tripReportSubjectValidator,
  substances: v.array(tripReportSubstanceValidator),
  introduction: v.optional(v.string()),
  onset: v.array(timelineEntryValidator),
  peak: v.array(timelineEntryValidator),
  offset: v.array(timelineEntryValidator),
  conclusion: v.optional(v.string()),
  tags: v.array(v.string()),
  license: v.optional(v.string()),
  attribution_review: v.optional(tripReportAttributionReviewValidator),
});

export const tripReportImportInputValidator = storedTripReportValidator;
