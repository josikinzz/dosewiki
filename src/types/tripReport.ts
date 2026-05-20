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
}

export type StoredTripReport = TripReport;
export type TripReportImportInput = StoredTripReport;
export type TripReportDetailRecord = StoredTripReport;

export type TripReportPreviewRecord = Pick<
  StoredTripReport,
  "slug" | "title" | "featured" | "subject" | "substances" | "introduction"
>;

export interface PublicReportPreview {
  title: string;
  slug: string;
  author: string;
  featured: boolean;
  substanceNames: string[];
  introduction: string;
  tripDate?: string;
  authorAvatarUrl?: string | null;
  authorProfileKey?: string;
}

export interface ReportCardModel {
  slug: string;
  title: string;
  featured: boolean;
  subject: Pick<TripReportSubject, "name" | "avatar_url" | "profile_key" | "trip_date">;
  substances: TripReportSubstance[];
}

export const toPublicReportPreview = (
  report: TripReportPreviewRecord,
  options: {
    introduction: string;
    authorAvatarUrl?: string | null;
    authorProfileKey?: string;
  },
): PublicReportPreview => ({
  title: report.title,
  slug: report.slug,
  author: report.subject.name,
  featured: report.featured === true,
  substanceNames: report.substances.map((substance) => substance.name),
  introduction: options.introduction,
  tripDate: report.subject.trip_date,
  authorAvatarUrl: options.authorAvatarUrl ?? null,
  authorProfileKey: options.authorProfileKey,
});

export const toPublicReportDetail = (report: TripReportDetailRecord): TripReport => report;

export const toReportCardModel = (report: PublicReportPreview | TripReportDetailRecord): ReportCardModel => {
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
      substances: report.substanceNames.map((name) => ({ name })),
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
  };
};

/**
 * View mode for the trip reports list page.
 */
export type ReportViewMode = "substance" | "title" | "author";
