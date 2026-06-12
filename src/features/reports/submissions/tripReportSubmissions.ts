import { createHmac } from "node:crypto";

export const TRIP_REPORT_SUBMISSION_SCHEMA_VERSION = 1;

export const SUBMISSION_STATUSES = [
  "submitted",
  "reviewing",
  "accepted",
  "rejected",
  "spam",
  "exported",
] as const;

export type TripReportSubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

export type TimelineEntryInput = {
  time?: string;
  description: string;
};

export type TripReportSubmissionSubjectInput = {
  name: string;
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

export type TripReportSubmissionReportInput = {
  title: string;
  subject: TripReportSubmissionSubjectInput;
  substances: TripReportSubmissionSubstanceInput[];
  introduction?: string;
  onset: TimelineEntryInput[];
  peak: TimelineEntryInput[];
  offset: TimelineEntryInput[];
  conclusion?: string;
  tags: string[];
};

export type NormalizedTripReportSubmissionReport = TripReportSubmissionReportInput;

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

export type ConvexTripReportImportPayload = NormalizedTripReportSubmissionReport & {
  slug: string;
  featured: boolean;
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

export function buildConvexTripReportImportPayload(
  row: TripReportSubmissionRow,
): ConvexTripReportImportPayload {
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

export function normalizeTripReportSubmissionInput(
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
      profile_key: emptyToUndefined(trim(report.subject.profile_key)),
      avatar_url: emptyToUndefined(trim(report.subject.avatar_url)),
      trip_date: emptyToUndefined(trim(report.subject.trip_date)),
      age: emptyToUndefined(trim(report.subject.age)),
      gender: emptyToUndefined(trim(report.subject.gender)),
      height: emptyToUndefined(trim(report.subject.height)),
      weight: emptyToUndefined(trim(report.subject.weight)),
      medications: emptyToUndefined(trim(report.subject.medications)),
      setting: emptyToUndefined(trim(report.subject.setting)),
      pdf_url: emptyToUndefined(trim(report.subject.pdf_url)),
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
