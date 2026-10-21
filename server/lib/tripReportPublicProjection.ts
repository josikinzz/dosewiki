import { getTripReportExcerpt } from "../../src/types/tripReport";

import type { Doc } from "../../lib/postgres/runtime/dataModel"

type TripReportPreviewInput =
  Pick<Doc<"tripReports">, "_creationTime" | "slug" | "title" | "featured" | "subject" | "substances" | "attribution_review">
  & Partial<Pick<Doc<"tripReports">, "introduction" | "onset" | "peak" | "offset" | "conclusion">>;

export function publicTripReport(
  report: Pick<
    Doc<"tripReports">,
    | "_creationTime" | "slug" | "title" | "featured" | "subject" | "substances" | "introduction"
    | "onset" | "peak" | "offset" | "conclusion" | "tags" | "license" | "attribution_review"
  >,
) {
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
    published_at: new Date(report._creationTime).toISOString(),
    attribution_locked: !!report.attribution_review,
  };
}

export function publicTripReportPreview(report: TripReportPreviewInput) {
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
