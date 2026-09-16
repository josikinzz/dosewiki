export interface TripReportSubject {
  name: string;
  avatar_url?: string;
  profile_key?: string;
  trip_date?: string;
  age?: string;
  gender?: string;
  height?: string;
  weight?: string;
  medications?: string;
  setting?: string;
  pdf_url?: string;
}

export interface TripReportSubstance {
  name: string;
  dose?: string;
  roa?: string;
}

export interface TimelineEntry {
  time?: string;
  description: string;
}

/**
 * Reuse terms for a trip report.
 * - "author-retained": rights stay with the original author ("up to the author").
 *   This is the default for legacy reports with no explicit license.
 * - "public-domain": dedicated to the public domain (CC0) by the submitter,
 *   set on reports promoted from the public submission form.
 */
export type TripReportLicense = "author-retained" | "public-domain";

const DEFAULT_TRIP_REPORT_LICENSE: TripReportLicense = "author-retained";

/** Resolve a stored license string to a known value, defaulting to author-retained. */
export function resolveTripReportLicense(license?: string | null): TripReportLicense {
  return license === "public-domain" ? "public-domain" : DEFAULT_TRIP_REPORT_LICENSE;
}

/**
 * Record that a human editor decided who a report is by, stamped only by the
 * submission promotion path (`server/tripReportSubmissions.ts`). Its absence
 * marks the legacy imported corpus, whose bylines were written by editors and
 * therefore still resolve to a contributor by name on the public read path.
 */
interface TripReportAttributionReview {
  reviewed_by: string;
  reviewed_at: string;
  decision: "assigned" | "declined";
}

export interface TripReport {
  _id?: string;
  slug: string;
  title: string;
  featured?: boolean;
  subject: TripReportSubject;
  substances: TripReportSubstance[];
  introduction?: string;
  onset: TimelineEntry[];
  peak: TimelineEntry[];
  offset: TimelineEntry[];
  conclusion?: string;
  tags: string[];
  license?: string;
  attribution_review?: TripReportAttributionReview;
  /** Public byline policy, without moderation or ownership metadata. */
  attribution_locked?: boolean;
}

type StoredTripReport = TripReport;
export type TripReportDetailRecord = StoredTripReport;

export type TripReportPreviewRecord = Pick<
  StoredTripReport,
  | "slug"
  | "title"
  | "featured"
  | "subject"
  | "substances"
  | "attribution_locked"
> & {
  /** The canonical 170-character narrative excerpt computed at the read edge. */
  excerpt: string;
  /**
   * When the report joined the archive, derived at the read edge from the
   * row's creation time rather than stored on it. Optional because a read
   * served by a Postgres deployment older than the projection that adds it has
   * no value to give, and the index falls back to the experience date.
   */
  published_at?: string;
};

export interface PublicReportPreview {
  title: string;
  slug: string;
  author: string;
  featured: boolean;
  substanceNames: string[];
  substances: TripReportSubstance[];
  introduction: string;
  tripDate?: string;
  age?: string;
  gender?: string;
  height?: string;
  weight?: string;
  medications?: string;
  setting?: string;
  authorAvatarUrl?: string | null;
  authorProfileKey?: string;
  /** Read-edge publication date; see `TripReportPreviewRecord.published_at`. */
  publishedAt?: string;
}

/** A detail record as a read serves it, carrying the read-edge publication date. */
export type TripReportDetailRecordWithPublication = TripReportDetailRecord & {
  published_at?: string;
};

export interface ReportCardModel {
  slug: string;
  title: string;
  featured: boolean;
  subject: Pick<TripReportSubject, "name" | "avatar_url" | "profile_key" | "trip_date">;
  substances: TripReportSubstance[];
  /**
   * When the report joined the archive. The index's default band ranks on
   * this and falls back to the experience date where it is absent.
   */
  publishedAt?: string;
}

type TripReportExcerptInput = Pick<
  TripReport,
  "introduction" | "onset" | "peak" | "offset" | "conclusion"
>;

/** Shared excerpt algorithm for both Postgres preview projection and consumers. */
export const getTripReportExcerpt = (
  report: TripReportExcerptInput,
  maxLength = 170,
): string => {
  const timelineText = [
    ...(report.onset ?? []),
    ...(report.peak ?? []),
    ...(report.offset ?? []),
  ].map((entry) => entry.description);
  const normalized = [
    report.introduction,
    ...timelineText,
    report.conclusion,
  ]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  return normalized.length <= maxLength
    ? normalized
    : `${normalized.slice(0, maxLength).trimEnd()}…`;
};

export const toPublicReportPreview = (
  report: TripReportPreviewRecord,
  options: {
    authorAvatarUrl?: string | null;
    authorProfileKey?: string;
  },
): PublicReportPreview => ({
  title: report.title,
  slug: report.slug,
  author: report.subject.name,
  featured: report.featured === true,
  substanceNames: report.substances.map((substance) => substance.name),
  substances: report.substances.map((substance) => ({ ...substance })),
  introduction: report.excerpt,
  tripDate: report.subject.trip_date,
  age: report.subject.age,
  gender: report.subject.gender,
  height: report.subject.height,
  weight: report.subject.weight,
  medications: report.subject.medications,
  setting: report.subject.setting,
  authorAvatarUrl: options.authorAvatarUrl ?? null,
  authorProfileKey: options.authorProfileKey,
  publishedAt: report.published_at,
});

export const toPublicReportDetail = (report: TripReportDetailRecord): TripReport => report;

export const toReportCardModel = (
  report: PublicReportPreview | TripReportDetailRecordWithPublication,
): ReportCardModel => {
  if ("author" in report) {
    return {
      slug: report.slug,
      title: report.title,
      featured: report.featured,
      subject: {
        name: report.author,
        trip_date: report.tripDate,
        avatar_url: report.authorAvatarUrl ?? undefined,
        profile_key: report.authorProfileKey,
      },
      substances:
        report.substances.length > 0
          ? report.substances.map((substance) => ({ ...substance }))
          : report.substanceNames.map((name) => ({ name })),
      publishedAt: report.publishedAt,
    };
  }

  return {
    slug: report.slug,
    title: report.title,
    featured: report.featured === true,
    subject: {
      name: report.subject.name,
      trip_date: report.subject.trip_date,
      avatar_url: report.subject.avatar_url,
      profile_key: report.subject.profile_key,
    },
    substances: report.substances,
    publishedAt: report.published_at,
  };
};

/**
 * View mode for the trip reports list page.
 */
export type ReportViewMode = "substance" | "title" | "author";
