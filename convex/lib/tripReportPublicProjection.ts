import type { Doc } from "../_generated/dataModel";

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
    // Readers need to distinguish an explicitly unattributed byline from a
    // legacy byline; neither the moderation decision nor its actor is public.
    attribution_locked: !!report.attribution_review,
  };
}
