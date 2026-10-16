export type TripReportEditableTimelineEntry = {
  time?: string;
  description: string;
};

export type TripReportEditableSubject = {
  name: string;
  trip_date?: string;
  age?: string;
  gender?: string;
  height?: string;
  weight?: string;
  medications?: string;
  setting?: string;
};

export type TripReportEditableSubstance = {
  name: string;
  dose?: string;
  roa?: string;
};

export type TripReportEditableFields = {
  title: string;
  subject: TripReportEditableSubject;
  substances: TripReportEditableSubstance[];
  introduction?: string;
  onset: TripReportEditableTimelineEntry[];
  peak: TripReportEditableTimelineEntry[];
  offset: TripReportEditableTimelineEntry[];
  conclusion?: string;
  tags: string[];
};

export const EDITABLE_SUBJECT_TEXT_FIELDS = [
  "trip_date",
  "age",
  "gender",
  "height",
  "weight",
  "medications",
  "setting",
] as const;

export const TIMELINE_PHASES = ["onset", "peak", "offset"] as const;

export type TripReportTimelinePhase = (typeof TIMELINE_PHASES)[number];

type SourceRow = {
  title: string;
  subject: { name: string } & Partial<Record<(typeof EDITABLE_SUBJECT_TEXT_FIELDS)[number], string | undefined>>;
  substances: readonly { name: string; dose?: string; roa?: string }[];
  introduction?: string;
  onset: readonly { time?: string; description: string }[];
  peak: readonly { time?: string; description: string }[];
  offset: readonly { time?: string; description: string }[];
  conclusion?: string;
  tags: readonly string[];
};

function trimmed(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function optionalText(value: string | null | undefined): string | undefined {
  const text = trimmed(value);
  return text.length > 0 ? text : undefined;
}

function assignOptional<T extends object, K extends string>(
  target: T,
  key: K,
  value: string | undefined,
): void {
  if (value !== undefined) {
    (target as Record<string, unknown>)[key] = value;
  }
}

export function normalizeEditableSubject(subject: {
  name?: string | null;
} & Partial<Record<(typeof EDITABLE_SUBJECT_TEXT_FIELDS)[number], string | null | undefined>>): TripReportEditableSubject {
  const normalized: TripReportEditableSubject = { name: trimmed(subject.name) };

  for (const field of EDITABLE_SUBJECT_TEXT_FIELDS) {
    assignOptional(normalized, field, optionalText(subject[field]));
  }

  return normalized;
}

export function normalizeEditableSubstances(
  substances: readonly { name?: string | null; dose?: string | null; roa?: string | null }[],
): TripReportEditableSubstance[] {
  const normalized: TripReportEditableSubstance[] = [];

  for (const substance of substances) {
    const name = trimmed(substance.name);
    if (!name) {
      continue;
    }

    const entry: TripReportEditableSubstance = { name };
    assignOptional(entry, "dose", optionalText(substance.dose));
    assignOptional(entry, "roa", optionalText(substance.roa));
    normalized.push(entry);
  }

  return normalized;
}

export function normalizeEditableTimeline(
  entries: readonly { time?: string | null; description?: string | null }[],
): TripReportEditableTimelineEntry[] {
  const normalized: TripReportEditableTimelineEntry[] = [];

  for (const entry of entries) {
    const description = trimmed(entry.description);
    if (!description) {
      continue;
    }

    const next: TripReportEditableTimelineEntry = { description };
    assignOptional(next, "time", optionalText(entry.time));
    normalized.push(next);
  }

  return normalized;
}

export function normalizeEditableTags(tags: readonly (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const tag of tags) {
    const text = trimmed(tag);
    if (!text) {
      continue;
    }

    const key = text.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    normalized.push(text);
  }

  return normalized;
}

export function normalizeEditableFields(fields: {
  title?: string | null;
  subject: Parameters<typeof normalizeEditableSubject>[0];
  substances: Parameters<typeof normalizeEditableSubstances>[0];
  introduction?: string | null;
  onset: Parameters<typeof normalizeEditableTimeline>[0];
  peak: Parameters<typeof normalizeEditableTimeline>[0];
  offset: Parameters<typeof normalizeEditableTimeline>[0];
  conclusion?: string | null;
  tags: readonly (string | null | undefined)[];
}): TripReportEditableFields {
  const normalized: TripReportEditableFields = {
    title: trimmed(fields.title),
    subject: normalizeEditableSubject(fields.subject),
    substances: normalizeEditableSubstances(fields.substances),
    onset: normalizeEditableTimeline(fields.onset),
    peak: normalizeEditableTimeline(fields.peak),
    offset: normalizeEditableTimeline(fields.offset),
    tags: normalizeEditableTags(fields.tags),
  };

  assignOptional(normalized, "introduction", optionalText(fields.introduction));
  assignOptional(normalized, "conclusion", optionalText(fields.conclusion));

  return normalized;
}

export function editableSnapshotOf(row: SourceRow): TripReportEditableFields {
  return normalizeEditableFields(row);
}

export function editableSnapshotsAgree(
  a: TripReportEditableFields,
  b: TripReportEditableFields,
): boolean {
  return stableKey(a) === stableKey(b);
}

function stableKey(fields: TripReportEditableFields): string {
  return JSON.stringify([
    fields.title,
    stableSubject(fields.subject),
    fields.substances.map((substance) => [substance.name, substance.dose ?? null, substance.roa ?? null]),
    fields.introduction ?? null,
    ...TIMELINE_PHASES.map((phase) =>
      fields[phase].map((entry) => [entry.time ?? null, entry.description]),
    ),
    fields.conclusion ?? null,
    fields.tags,
  ]);
}

function stableSubject(subject: TripReportEditableSubject): unknown[] {
  return [subject.name, ...EDITABLE_SUBJECT_TEXT_FIELDS.map((field) => subject[field] ?? null)];
}

export function validateEditableFields(fields: TripReportEditableFields): string[] {
  const problems: string[] = [];

  if (!fields.title) {
    problems.push("A report needs a title.");
  }

  if (!fields.subject.name) {
    problems.push("A report needs a byline.");
  }

  if (fields.substances.length === 0) {
    problems.push("A report needs at least one named substance.");
  }

  const hasBody =
    Boolean(fields.introduction) ||
    Boolean(fields.conclusion) ||
    TIMELINE_PHASES.some((phase) => fields[phase].length > 0);

  if (!hasBody) {
    problems.push("A report needs an introduction, a conclusion, or at least one timeline entry.");
  }

  return problems;
}
