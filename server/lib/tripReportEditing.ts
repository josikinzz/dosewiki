/**
 * Per-record editing contract for published trip reports.
 *
 * The Trip Report Portal edits a stored `tripReports` row field by field, which
 * the corpus had no write path for: reports only ever arrived through
 * `bulkImport` (whole-row overwrite from a migration file) or through submission
 * promotion. This module owns the narrow slice of a report an editor may edit
 * and the normalization both sides of that edit agree on.
 *
 * Three fields are deliberately outside the editable set:
 *
 * - `slug`, because it is the report's public URL. Renaming is a redirect
 *   question, not a field edit.
 * - `subject.profile_key`, because assigning a contributor is an attribution
 *   decision that `tripReports.update` adjudicates explicitly rather than
 *   accepting as free-form text from the form.
 * - `subject.avatar_url` / `subject.pdf_url`, which are editor-set links this
 *   tool does not surface; an update preserves whatever the row already had.
 *
 * The normalization here is what makes optimistic concurrency honest: the read
 * endpoint hands the client `editableSnapshotOf(row)`, the client sends that
 * same snapshot back as `expected`, and the mutation re-derives it from storage
 * to compare. Without one shared normalizer, incidental whitespace in the stored
 * corpus would read as a concurrent edit and block every save.
 */

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

/**
 * Collapse a blank optional string to an absent key.
 *
 * Storage distinguishes an absent optional from an empty string, and
 * the public detail page renders an empty `introduction` as an empty section.
 * Normalizing to absence keeps "the editor cleared this field" and "this field
 * was never filled in" the same state.
 */
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

/**
 * Drop substances with no name. The form's "+ substance" affordance appends a
 * blank row, so an editor who adds one and changes their mind would otherwise
 * publish a nameless substance onto the report's dose table.
 */
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

/**
 * Drop timeline entries with no description. A timestamp on its own renders as
 * a marker with nothing hanging off it, so an empty entry is a half-finished
 * edit rather than content.
 */
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

/** Trim, drop blanks, and de-duplicate case-insensitively, keeping first casing. */
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

/** The editable slice of a stored row, normalized the same way an edit is. */
export function editableSnapshotOf(row: SourceRow): TripReportEditableFields {
  return normalizeEditableFields(row);
}

/**
 * Structural equality over the editable slice.
 *
 * This is the concurrency guard, mirroring `editorialSnapshotsAgree` in
 * `server/replications.ts`: `tripReports` carries no `updatedAt` or version
 * column, so "did this change under me" can only be answered by comparing the
 * content the editor was shown against the content in storage. Field order is
 * irrelevant; array order is not, because reordering timeline entries is itself
 * an edit.
 */
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

/**
 * Everything that would make a report unpublishable, reported at once rather
 * than one throw at a time, so the editor fixes the whole form in one pass.
 */
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
