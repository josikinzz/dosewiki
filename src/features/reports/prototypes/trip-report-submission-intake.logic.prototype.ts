/*
 * PROTOTYPE - trip report submission intake logic.
 *
 * Question: does a private Postgres intake queue give us the right backend
 * states for public form submissions before any report is promoted to the
 * existing public Postgres tripReports collection?
 */

export type SubmissionStatus =
  | "submitted"
  | "reviewing"
  | "accepted"
  | "rejected"
  | "spam"
  | "exported";

type TimelineEntry = {
  time?: string;
  description: string;
}

type TripReportSubjectDraft = {
  name: string;
  trip_date?: string;
  age?: string;
  gender?: string;
  height?: string;
  weight?: string;
  medications?: string;
  setting?: string;
}

type TripReportSubstanceDraft = {
  name: string;
  dose?: string;
  roa?: string;
}

export type TripReportDraft = {
  title: string;
  subject: TripReportSubjectDraft;
  substances: TripReportSubstanceDraft[];
  introduction?: string;
  onset: TimelineEntry[];
  peak: TimelineEntry[];
  offset: TimelineEntry[];
  conclusion?: string;
  tags: string[];
};

export type SubmissionFormInput = {
  report: TripReportDraft;
  contact_email?: string;
  may_contact: boolean;
  publish_consent: boolean;
  age_confirmed: boolean;
  honeypot?: string;
  ip?: string;
  user_agent?: string;
};

export type TripReportSubmissionRow = {
  id: string;
  status: SubmissionStatus;
  schema_version: 1;
  report: TripReportDraft;
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
  created_at: string;
  updated_at: string;
};

type DataTripReportImportPayload = TripReportDraft & {
  slug: string;
  featured: boolean;
}

export type IntakeState = {
  nextId: number;
  nowTick: number;
  submissions: TripReportSubmissionRow[];
  selectedId?: string;
  lastResult: string;
  lastPromotionPreview?: DataTripReportImportPayload;
};

export type SubmitResult =
  | { ok: true; row: TripReportSubmissionRow; warnings: string[] }
  | { ok: false; errors: string[]; warnings: string[] };

export type TransitionResult =
  | { ok: true; row: TripReportSubmissionRow; message: string }
  | { ok: false; message: string };

const VALID_TRANSITIONS: Record<SubmissionStatus, SubmissionStatus[]> = {
  submitted: ["reviewing", "accepted", "rejected", "spam"],
  reviewing: ["accepted", "rejected", "spam", "submitted"],
  accepted: ["reviewing", "rejected"],
  rejected: ["reviewing"],
  spam: ["reviewing"],
  exported: [],
};

export function createInitialIntakeState(): IntakeState {
  return {
    nextId: 1,
    nowTick: 0,
    submissions: [],
    lastResult: "Ready. Submit a sample or custom report to inspect the private queue model.",
  };
}

export function submitTripReport(state: IntakeState, input: SubmissionFormInput): SubmitResult {
  const normalized = normalizeInput(input);
  const validation = validateSubmission(normalized);

  if (validation.errors.length > 0) {
    state.lastResult = `Rejected before insert: ${validation.errors.join("; ")}`;
    return { ok: false, errors: validation.errors, warnings: validation.warnings };
  }

  const id = `proto-submission-${state.nextId}`;
  state.nextId += 1;
  state.nowTick += 1;
  const timestamp = makeTimestamp(state.nowTick);
  const honeypotTriggered = normalized.honeypot.length > 0;
  const row: TripReportSubmissionRow = {
    id,
    status: honeypotTriggered ? "spam" : "submitted",
    schema_version: 1,
    report: normalized.report,
    title: normalized.report.title,
    author_name: normalized.report.subject.name,
    substance_names: normalized.report.substances.map((substance) => substance.name),
    contact_email: normalized.contact_email || undefined,
    may_contact: normalized.may_contact,
    publish_consent: normalized.publish_consent,
    age_confirmed: normalized.age_confirmed,
    ip_hash: normalized.ip ? hashPrototypeIp(normalized.ip) : undefined,
    user_agent: normalized.user_agent || undefined,
    honeypot_triggered: honeypotTriggered,
    created_at: timestamp,
    updated_at: timestamp,
  };

  state.submissions.unshift(row);
  state.selectedId = row.id;
  state.lastResult = honeypotTriggered
    ? `Inserted ${row.id} as spam because honeypot was filled.`
    : `Inserted ${row.id} into private submitted queue.`;

  return { ok: true, row, warnings: validation.warnings };
}

export function selectSubmission(state: IntakeState, id: string): TransitionResult {
  const row = findSubmission(state, id);
  if (!row) {
    state.lastResult = `Submission not found: ${id}`;
    return { ok: false, message: state.lastResult };
  }

  state.selectedId = row.id;
  state.lastResult = `Selected ${row.id}.`;
  return { ok: true, row, message: state.lastResult };
}

export function transitionSubmission(
  state: IntakeState,
  id: string,
  nextStatus: SubmissionStatus,
  reviewer: string,
  notes?: string,
): TransitionResult {
  const row = findSubmission(state, id);
  if (!row) {
    state.lastResult = `Submission not found: ${id}`;
    return { ok: false, message: state.lastResult };
  }

  if (!VALID_TRANSITIONS[row.status].includes(nextStatus)) {
    state.lastResult = `Illegal transition: ${row.status} -> ${nextStatus}.`;
    return { ok: false, message: state.lastResult };
  }

  state.nowTick += 1;
  row.status = nextStatus;
  row.updated_at = makeTimestamp(state.nowTick);
  row.reviewed_by = reviewer;
  row.reviewed_at = row.updated_at;
  if (typeof notes === "string") {
    row.review_notes = notes;
  }
  state.selectedId = row.id;
  state.lastResult = `Moved ${row.id} to ${nextStatus}.`;
  return { ok: true, row, message: state.lastResult };
}

export function previewAcceptedSubmissionPromotion(state: IntakeState, id: string): TransitionResult {
  const row = findSubmission(state, id);
  if (!row) {
    state.lastResult = `Submission not found: ${id}`;
    return { ok: false, message: state.lastResult };
  }

  if (row.status !== "accepted") {
    state.lastResult = `Only accepted submissions can preview promotion. Current status: ${row.status}.`;
    return { ok: false, message: state.lastResult };
  }

  state.lastPromotionPreview = {
    ...row.report,
    slug: slugify(row.title),
    featured: false,
  };
  state.lastResult = `Built Postgres promotion preview for ${row.id}; not written anywhere.`;
  return { ok: true, row, message: state.lastResult };
}

export function getSelectedSubmission(state: IntakeState): TripReportSubmissionRow | undefined {
  return state.selectedId ? findSubmission(state, state.selectedId) : undefined;
}

export function summarizeQueue(state: IntakeState): Record<SubmissionStatus, number> {
  return state.submissions.reduce<Record<SubmissionStatus, number>>(
    (counts, row) => {
      counts[row.status] += 1;
      return counts;
    },
    {
      submitted: 0,
      reviewing: 0,
      accepted: 0,
      rejected: 0,
      spam: 0,
      exported: 0,
    },
  );
}

export function makeSampleSubmission(overrides: Partial<SubmissionFormInput> = {}): SubmissionFormInput {
  return {
    report: {
      title: "Careful low dose museum walk",
      subject: {
        name: "Anonymous",
        trip_date: "2026-05-20",
        age: "28",
        gender: "not specified",
        medications: "none",
        setting: "Quiet museum and apartment",
      },
      substances: [{ name: "LSD", dose: "75 ug", roa: "oral" }],
      introduction: "A planned low-dose experience with a sober friend nearby.",
      onset: [
        {
          time: "T+00:45",
          description: "First body lightness and mild visual sharpening.",
        },
      ],
      peak: [
        {
          time: "T+02:30",
          description: "Strong color enhancement, introspection, and manageable stimulation.",
        },
      ],
      offset: [
        {
          time: "T+07:00",
          description: "Effects faded into tiredness with some residual stimulation.",
        },
      ],
      conclusion: "Useful but sleep was delayed, so the timing mattered.",
      tags: ["psychedelic", "low dose"],
    },
    contact_email: "submitter@example.com",
    may_contact: true,
    publish_consent: true,
    age_confirmed: true,
    honeypot: "",
    ip: "203.0.113.10",
    user_agent: "prototype-cli",
    ...overrides,
  };
}

export function makeInvalidSubmission(): SubmissionFormInput {
  return makeSampleSubmission({
    publish_consent: false,
    age_confirmed: false,
    report: {
      ...makeSampleSubmission().report,
      title: "",
      substances: [],
    },
  });
}

function findSubmission(state: IntakeState, id: string): TripReportSubmissionRow | undefined {
  return state.submissions.find((row) => row.id === id);
}

function normalizeInput(input: SubmissionFormInput): SubmissionFormInput {
  return {
    ...input,
    contact_email: emptyToUndefined(trim(input.contact_email)),
    honeypot: trim(input.honeypot),
    ip: emptyToUndefined(trim(input.ip)),
    user_agent: emptyToUndefined(trim(input.user_agent)),
    report: {
      ...input.report,
      title: trim(input.report.title),
      subject: {
        ...input.report.subject,
        name: trim(input.report.subject.name) || "Anonymous",
        trip_date: emptyToUndefined(trim(input.report.subject.trip_date)),
        age: emptyToUndefined(trim(input.report.subject.age)),
        gender: emptyToUndefined(trim(input.report.subject.gender)),
        height: emptyToUndefined(trim(input.report.subject.height)),
        weight: emptyToUndefined(trim(input.report.subject.weight)),
        medications: emptyToUndefined(trim(input.report.subject.medications)),
        setting: emptyToUndefined(trim(input.report.subject.setting)),
      },
      substances: input.report.substances
        .map((substance) => ({
          name: trim(substance.name),
          dose: emptyToUndefined(trim(substance.dose)),
          roa: emptyToUndefined(trim(substance.roa)),
        }))
        .filter((substance) => substance.name.length > 0),
      introduction: emptyToUndefined(trim(input.report.introduction)),
      onset: normalizeTimeline(input.report.onset),
      peak: normalizeTimeline(input.report.peak),
      offset: normalizeTimeline(input.report.offset),
      conclusion: emptyToUndefined(trim(input.report.conclusion)),
      tags: input.report.tags.map(trim).filter(Boolean),
    },
  };
}

function normalizeTimeline(entries: TimelineEntry[]): TimelineEntry[] {
  return entries
    .map((entry) => ({
      time: emptyToUndefined(trim(entry.time)),
      description: trim(entry.description),
    }))
    .filter((entry) => entry.description.length > 0);
}

function validateSubmission(input: SubmissionFormInput): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const report = input.report;

  if (!report.title) {
    errors.push("title is required");
  }

  if (report.substances.length === 0) {
    errors.push("at least one substance is required");
  }

  if (!input.publish_consent) {
    errors.push("publish consent is required");
  }

  if (!input.age_confirmed) {
    errors.push("age confirmation is required");
  }

  const narrativeLength = [
    report.introduction,
    ...report.onset.map((entry) => entry.description),
    ...report.peak.map((entry) => entry.description),
    ...report.offset.map((entry) => entry.description),
    report.conclusion,
  ].join(" ").trim().length;

  if (narrativeLength < 80) {
    warnings.push("narrative is short; keep in review queue");
  }

  if (report.substances.some((substance) => !substance.dose)) {
    warnings.push("one or more substances are missing dose");
  }

  return { errors, warnings };
}

function makeTimestamp(tick: number): string {
  return `2026-06-11T12:${String(tick).padStart(2, "0")}:00.000Z`;
}

function trim(value: string | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function emptyToUndefined(value: string): string | undefined {
  return value.length > 0 ? value : undefined;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "untitled-report";
}

function hashPrototypeIp(value: string): string {
  let hash = 0;
  for (const char of value) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }

  return `prototype-ip-${hash.toString(16)}`;
}
