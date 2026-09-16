import { createHmac } from "node:crypto";

const TRIP_REPORT_SUBMISSION_SCHEMA_VERSION = 1

const SUBMISSION_STATUSES = [
  "submitted",
  "reviewing",
  "accepted",
  "rejected",
  "spam",
  "exported",
] as const

export type TripReportSubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

export type TimelineEntryInput = {
  time?: string;
  description: string;
};

export type TripReportSubmissionSubjectInput = {
  name: string;
  // The three fields below are accepted from clients that still post them and
  // never stored. Each one publishes something the reader takes as vouched for
  // by the site — a contributor page link, the face beside a byline, an
  // outbound link captioned as this report's tracker PDF — and an anonymous
  // submitter can prove none of it. Normalization drops them and reports each
  // drop through `warnings`.
  profile_key?: string;
  avatar_url?: string;
  trip_date?: string;
  age?: string;
  gender?: string;
  height?: string;
  weight?: string;
  medications?: string;
  setting?: string;
  pdf_url?: string;
};

export type TripReportSubmissionSubstanceInput = {
  name: string;
  dose?: string;
  roa?: string;
};

type TripReportSubmissionReportInput = {
  title: string;
  subject: TripReportSubmissionSubjectInput;
  substances: TripReportSubmissionSubstanceInput[];
  introduction?: string;
  onset: TimelineEntryInput[];
  peak: TimelineEntryInput[];
  offset: TimelineEntryInput[];
  conclusion?: string;
  tags: string[];
}

type SubmitterRestrictedSubjectField = "profile_key" | "avatar_url" | "pdf_url"

type NormalizedTripReportSubmissionSubject = Omit<
  TripReportSubmissionSubjectInput,
  SubmitterRestrictedSubjectField
>

type NormalizedTripReportSubmissionReport = Omit<TripReportSubmissionReportInput, "subject"> & {
  subject: NormalizedTripReportSubmissionSubject;
}

export type TripReportSubmissionInput = {
  report: TripReportSubmissionReportInput;
  contact_email?: string;
  may_contact: boolean;
  publish_consent: boolean;
  age_confirmed: boolean;
  honeypot?: string;
  ip?: string;
  ip_hash_secret?: string;
  user_agent?: string;
};

export type TripReportSubmissionRow = {
  id: string;
  status: TripReportSubmissionStatus;
  schema_version: typeof TRIP_REPORT_SUBMISSION_SCHEMA_VERSION;
  report: NormalizedTripReportSubmissionReport;
  title: string;
  author_name: string;
  substance_names: string[];
  contact_email?: string;
  may_contact: boolean;
  publish_consent: boolean;
  age_confirmed: boolean;
  ip_hash?: string;
  user_agent?: string;
  honeypot_triggered: boolean;
  review_notes?: string;
  reviewed_by?: string;
  reviewed_at?: string;
  exported_trip_report_id?: string;
  exported_at?: string;
  created_at: string;
  updated_at: string;
};

export type DataTripReportImportPayload = Omit<NormalizedTripReportSubmissionReport, "subject"> & {
  // Attribution appears only on the promotion payload, where a trusted editor
  // assigned it; it never survives the submission itself.
  subject: NormalizedTripReportSubmissionSubject & { profile_key?: string };
  slug: string;
  featured: boolean;
  attribution_review?: {
    reviewed_by: string;
    reviewed_at: string;
    decision: "assigned" | "declined";
  };
};

export type CreateTripReportSubmissionOptions = {
  id: string;
  now?: Date;
};

export type TripReportSubmissionValidationResult =
  | { ok: true; report: NormalizedTripReportSubmissionReport; warnings: string[] }
  | { ok: false; errors: string[]; warnings: string[] };

export type TransitionTripReportSubmissionOptions = {
  status: TripReportSubmissionStatus;
  reviewer: string;
  notes?: string;
  now?: Date;
};

// Returned to the submitter instead of failing the request: the claims are
// worth nothing, but the report behind them usually is, so the submission still
// lands and the submitter is told what was dropped.
export const IGNORED_PROFILE_KEY_WARNING =
  "Contributor profile key was ignored; an editor assigns report attribution when publishing.";

const IGNORED_AVATAR_URL_WARNING = "Avatar URL was ignored; a published report shows the avatar of the contributor profile it is attributed to."

const IGNORED_PDF_URL_WARNING = "PDF URL was ignored; outbound links on a published report are added by an editor, not by the submitter."

const VALID_TRANSITIONS: Record<TripReportSubmissionStatus, TripReportSubmissionStatus[]> = {
  submitted: ["reviewing", "accepted", "rejected", "spam"],
  reviewing: ["accepted", "rejected", "spam", "submitted"],
  accepted: ["reviewing", "rejected"],
  rejected: ["reviewing"],
  spam: ["reviewing"],
  exported: [],
};

export function isTripReportSubmissionStatus(value: unknown): value is TripReportSubmissionStatus {
  return typeof value === "string" && SUBMISSION_STATUSES.includes(value as TripReportSubmissionStatus);
}

export function validateTripReportSubmission(
  input: TripReportSubmissionInput,
): TripReportSubmissionValidationResult {
  const normalized = normalizeTripReportSubmissionInput(input);
  const errors: string[] = [];
  const warnings: string[] = [];
  const report = normalized.report;

  if (trim(input.report.subject.profile_key)) {
    warnings.push(IGNORED_PROFILE_KEY_WARNING);
  }

  if (trim(input.report.subject.avatar_url)) {
    warnings.push(IGNORED_AVATAR_URL_WARNING);
  }

  if (trim(input.report.subject.pdf_url)) {
    warnings.push(IGNORED_PDF_URL_WARNING);
  }

  if (!report.title) {
    errors.push("Title is required.");
  }

  if (report.substances.length === 0) {
    errors.push("At least one substance is required.");
  }

  if (!normalized.publish_consent) {
    errors.push("Publish consent is required.");
  }

  if (!normalized.age_confirmed) {
    errors.push("Age confirmation is required.");
  }

  if (errors.length > 0) {
    return { ok: false, errors, warnings };
  }

  const narrativeLength = [
    report.introduction,
    ...report.onset.map((entry) => entry.description),
    ...report.peak.map((entry) => entry.description),
    ...report.offset.map((entry) => entry.description),
    report.conclusion,
  ].join(" ").trim().length;

  if (narrativeLength < 80) {
    warnings.push("Narrative is short; keep in review queue.");
  }

  if (report.substances.some((substance) => !substance.dose)) {
    warnings.push("One or more substances are missing dose.");
  }

  return { ok: true, report, warnings };
}

export function createTripReportSubmission(
  input: TripReportSubmissionInput,
  options: CreateTripReportSubmissionOptions,
): TripReportSubmissionRow {
  const normalized = normalizeTripReportSubmissionInput(input);
  const timestamp = (options.now ?? new Date()).toISOString();
  const honeypotTriggered = normalized.honeypot.length > 0;

  return {
    id: options.id,
    status: honeypotTriggered ? "spam" : "submitted",
    schema_version: TRIP_REPORT_SUBMISSION_SCHEMA_VERSION,
    report: normalized.report,
    title: normalized.report.title,
    author_name: normalized.report.subject.name,
    substance_names: normalized.report.substances.map((substance) => substance.name),
    contact_email: normalized.contact_email,
    may_contact: normalized.may_contact,
    publish_consent: normalized.publish_consent,
    age_confirmed: normalized.age_confirmed,
    ip_hash: hashIpAddress(normalized.ip, normalized.ip_hash_secret),
    user_agent: normalized.user_agent,
    honeypot_triggered: honeypotTriggered,
    created_at: timestamp,
    updated_at: timestamp,
  };
}

export function transitionTripReportSubmission(
  row: TripReportSubmissionRow,
  options: TransitionTripReportSubmissionOptions,
): TripReportSubmissionRow {
  if (!VALID_TRANSITIONS[row.status].includes(options.status)) {
    throw new Error(`Illegal transition: ${row.status} -> ${options.status}.`);
  }

  const timestamp = (options.now ?? new Date()).toISOString();
  return {
    ...row,
    status: options.status,
    review_notes: typeof options.notes === "string" ? options.notes : row.review_notes,
    reviewed_by: options.reviewer,
    reviewed_at: timestamp,
    updated_at: timestamp,
  };
}

export function buildDataTripReportImportPayload(
  row: TripReportSubmissionRow,
): DataTripReportImportPayload {
  if (row.status !== "accepted") {
    throw new Error(`Only accepted submissions can be promoted. Current status: ${row.status}.`);
  }

  return {
    ...row.report,
    slug: slugify(row.title),
    featured: false,
  };
}

type NormalizedTripReportSubmissionInput = Omit<
  TripReportSubmissionInput,
  "contact_email" | "honeypot" | "ip" | "ip_hash_secret" | "user_agent" | "report"
> & {
  report: NormalizedTripReportSubmissionReport;
  contact_email?: string;
  honeypot: string;
  ip?: string;
  ip_hash_secret?: string;
  user_agent?: string;
};

function normalizeTripReportSubmissionInput(
  input: TripReportSubmissionInput,
): NormalizedTripReportSubmissionInput {
  return {
    ...input,
    contact_email: emptyToUndefined(trim(input.contact_email)),
    honeypot: trim(input.honeypot),
    ip: emptyToUndefined(trim(input.ip)),
    ip_hash_secret: emptyToUndefined(trim(input.ip_hash_secret)),
    user_agent: emptyToUndefined(trim(input.user_agent)),
    report: normalizeReport(input.report),
  };
}

function normalizeReport(report: TripReportSubmissionReportInput): NormalizedTripReportSubmissionReport {
  return {
    title: trim(report.title),
    subject: {
      name: trim(report.subject.name) || "Anonymous",
      // `profile_key`, `avatar_url`, and `pdf_url` are deliberately absent: an
      // anonymous submitter has no identity to attach and no standing to put a
      // remote image or outbound link on a published dose.wiki page, so the
      // claims are dropped before they can be stored or promoted. Postgres
      // `tripReportSubmissions.create` strips them again.
      trip_date: emptyToUndefined(trim(report.subject.trip_date)),
      age: emptyToUndefined(trim(report.subject.age)),
      gender: emptyToUndefined(trim(report.subject.gender)),
      height: emptyToUndefined(trim(report.subject.height)),
      weight: emptyToUndefined(trim(report.subject.weight)),
      medications: emptyToUndefined(trim(report.subject.medications)),
      setting: emptyToUndefined(trim(report.subject.setting)),
    },
    substances: report.substances
      .map((substance) => ({
        name: trim(substance.name),
        dose: emptyToUndefined(trim(substance.dose)),
        roa: emptyToUndefined(trim(substance.roa)),
      }))
      .filter((substance) => substance.name.length > 0),
    introduction: emptyToUndefined(trim(report.introduction)),
    onset: normalizeTimeline(report.onset),
    peak: normalizeTimeline(report.peak),
    offset: normalizeTimeline(report.offset),
    conclusion: emptyToUndefined(trim(report.conclusion)),
    tags: report.tags.map(trim).filter(Boolean),
  };
}

function normalizeTimeline(entries: TimelineEntryInput[]): TimelineEntryInput[] {
  return entries
    .map((entry) => ({
      time: emptyToUndefined(trim(entry.time)),
      description: trim(entry.description),
    }))
    .filter((entry) => entry.description.length > 0);
}

function hashIpAddress(ip: string | undefined, secret: string | undefined): string | undefined {
  if (!ip || !secret) {
    return undefined;
  }

  const digest = createHmac("sha256", secret).update(ip).digest("hex");
  return `sha256:${digest}`;
}

function trim(value: string | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function emptyToUndefined(value: string): string | undefined {
  return value.length > 0 ? value : undefined;
}

export function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "untitled-report"
  );
}
