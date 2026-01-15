/**
 * Trip report types - imported from EffectIndex.
 */

export interface TripReportSubject {
  name: string;
  avatar_url?: string;
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

/**
 * View mode for the trip reports list page.
 */
export type ReportViewMode = "substance" | "title" | "author";
