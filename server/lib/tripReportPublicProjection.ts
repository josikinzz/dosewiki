import { getTripReportExcerpt } from "../../src/types/tripReport";

import type { Doc } from "../../lib/postgres/runtime/dataModel"

/** Published reading data only; never expose ownership or moderation actors. */
export function publicTripReport(report: Doc<"tripReports">) {
  return {
    slug: report.slug,
    title: report.title,
    featured: report.featured,
    subject: report.subject,
    substances: report.substances,
    introduction: report.introduction,
    onset: report.onset,
    peak: report.peak,
    offset: report.offset,
    conclusion: report.conclusion,
    tags: report.tags,
    license: report.license,
    // When this report joined the archive. The row is inserted at promotion
    // for a submitted report and at import for the EffectIndex corpus, so the
    // creation time is the publication date and carries no moderation detail:
    // `attribution_review.reviewed_at` would date the decision and its actor's
    // shift, which stays private. Readers need this because `subject.trip_date`
    // is author-typed free text describing when the experience happened, not
    // when anyone could read about it.
    published_at: new Date(report._creationTime).toISOString(),
    // Readers need to distinguish an explicitly unattributed byline from a
    // legacy byline; neither the moderation decision nor its actor is public.
    attribution_locked: !!report.attribution_review,
  };
}

/** Compact list projection; narrative and timeline bodies never cross the read edge. */
export function publicTripReportPreview(report: Doc<"tripReports">) {
  return {
    slug: report.slug,
    title: report.title,
    featured: report.featured,
    subject: report.subject,
    substances: report.substances,
    excerpt: getTripReportExcerpt(report),
    published_at: new Date(report._creationTime).toISOString(),
    attribution_locked: !!report.attribution_review,
  };
}
