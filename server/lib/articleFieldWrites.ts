/**
 * The allow-list — and the minimal path walker — behind
 * `substanceIndex.setArticleField`, the single-field write the review portal's
 * inline click-to-edit uses.
 *
 * The canonical list is shared by native handlers and the Next API route.
 * Keeping one source of truth for permitted inline edits prevents a typo in
 * a client-driven field path from overwriting an entire article section.
 *
 * Keep this module dependency-free so server handlers and route-side guards
 * use the same rules without importing unrelated runtime code.
 */

/**
 * What a leaf holds. `text` is a plain string; `range` is the
 * `{min, max, unit}` shape shared by dose tiers and duration stages.
 */
export type EditableFieldKind = "text" | "range";

/**
 * Template field paths an inline edit may write, in `fieldPath.ts` notation,
 * mapped to the kind of value that leaf holds.
 *
 * Two kinds of variable segment appear here:
 *
 * - `[]` marks an array whose concrete index the caller supplies.
 * - `*` marks a record key the *data* chooses rather than the schema — the
 *   country in `legality.countries`, the subcategory under an effect family.
 *   A fixed template cannot enumerate those, so the matcher compares
 *   segment-by-segment instead of by string equality.
 *
 * The kind is enforced in both directions: the walker refuses to put a string
 * where a range lives, an object where text lives, or either where a path has
 * somehow reached a whole subtree.
 *
 * Every entry here is a leaf the public article actually renders as prose or as
 * a dose/duration range. Status, level, and classification leaves are
 * deliberately absent: those render as canonical badges derived from the stored
 * value, so a free-text edit of one would not survive its own round trip.
 */
export const EDITABLE_ARTICLE_FIELD_KINDS = {
  // Hero
  title: "text",
  summary: "text",
  "identification.substitutive_name": "text",
  "identification.botanical_name": "text",
  "identification.common_name": "text",
  // Dosage & duration
  "dosage.routes[].notes": "text",
  "dosage.routes[].bioavailability": "text",
  "dosage.routes[].bioavailability_notes": "text",
  "dosage.routes[].dose_ranges.threshold": "range",
  "dosage.routes[].dose_ranges.light": "range",
  "dosage.routes[].dose_ranges.moderate": "range",
  "dosage.routes[].dose_ranges.strong": "range",
  "dosage.routes[].dose_ranges.heavy": "range",
  "duration.routes[].half_life": "text",
  "duration.routes[].half_life_notes": "text",
  "duration.routes[].stages.onset": "range",
  "duration.routes[].stages.come_up": "range",
  "duration.routes[].stages.peak": "range",
  "duration.routes[].stages.offset": "range",
  "duration.routes[].stages.after_effects": "range",
  "duration.routes[].stages.total_duration": "range",
  // Tolerance
  "tolerance.full_tolerance": "text",
  "tolerance.half_tolerance": "text",
  "tolerance.baseline_tolerance": "text",
  "tolerance.cross_tolerance[]": "text",
  // Subjective effects
  "subjective_effects.notes.overview": "text",
  "subjective_effects.notes.physical": "text",
  "subjective_effects.notes.cognitive": "text",
  "subjective_effects.sensory.*.note": "text",
  "subjective_effects.sensory.*.subcategories.*.note": "text",
  "subjective_effects.physical.*.note": "text",
  "subjective_effects.cognitive.*.note": "text",
  "subjective_effects.progressive_stages.*.note": "text",
  // Pharmacology
  "pharmacology.pharmacodynamics": "text",
  "pharmacology.pharmacokinetics": "text",
  // Legality
  "legality.international[]": "text",
  "legality.countries.*.notes": "text",
  "legality.usStatesNote": "text",
  "legality.usStates.*.notes": "text",
  "legality.usStates.*.cities.*.notes": "text",
  // Harm potential
  "harm_potential.addiction.psychological.description": "text",
  "harm_potential.addiction.physical_dependence.description": "text",
  "harm_potential.psychosis.description": "text",
  "harm_potential.seizure.description": "text",
  "harm_potential.toxicity.lethal_dosage.notes": "text",
  "harm_potential.toxicity.organ_toxicity[].findings": "text",
  "harm_potential.toxicity.organ_toxicity[].mechanism": "text",
  "harm_potential.toxicity.organ_toxicity[].notes": "text",
  // History & culture
  "history_culture.content": "text",
  "history_culture.sections[].content": "text",
  "history_culture.sections[].subsections[].content": "text",
} as const;

export type EditableArticleFieldTemplate = keyof typeof EDITABLE_ARTICLE_FIELD_KINDS;

export const EDITABLE_ARTICLE_FIELD_TEMPLATES = Object.keys(
  EDITABLE_ARTICLE_FIELD_KINDS,
) as EditableArticleFieldTemplate[];

/** The declared kind for a concrete path, or `null` when it is not editable. */
export function editableFieldKindForPath(path: string): EditableFieldKind | null {
  const parts = parseEditableFieldPath(path);
  if (!parts) return null;
  const template = resolveEditableFieldTemplate(parts);
  if (!template) return null;
  const kinds = EDITABLE_ARTICLE_FIELD_KINDS as Record<string, EditableFieldKind>;
  return kinds[template] ?? null;
}

/** The `{min, max, unit}` leaf shared by dose tiers and duration stages. */
export interface EditableRangeValue {
  min: number | null;
  max: number | null;
  unit: string;
}

export type EditableFieldValue = string | EditableRangeValue;

/** Units are short labels (`mg`, `hours`), never prose. */
export const EDITABLE_RANGE_UNIT_MAX_LENGTH = 32;

/** Strict check for an incoming range: exactly the three known keys. */
export function isEditableRangeValue(value: unknown): value is EditableRangeValue {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value);
  if (keys.length !== 3 || !keys.includes("min") || !keys.includes("max") || !keys.includes("unit")) {
    return false;
  }
  for (const bound of [value.min, value.max]) {
    if (bound === null) continue;
    if (typeof bound !== "number" || !Number.isFinite(bound)) return false;
  }
  return typeof value.unit === "string" && value.unit.length <= EDITABLE_RANGE_UNIT_MAX_LENGTH;
}

/**
 * Lenient check for what is already stored. Legacy rows may carry extra keys,
 * and refusing to edit them would strand exactly the data most in need of it.
 */
function looksLikeStoredRange(value: unknown): boolean {
  return isRecord(value) && "min" in value && "max" in value && "unit" in value;
}

function rangesEqual(a: unknown, b: EditableRangeValue): boolean {
  const stored = isRecord(a) ? a : {};
  const min = stored.min ?? null;
  const max = stored.max ?? null;
  const unit = typeof stored.unit === "string" ? stored.unit : "";
  return min === b.min && max === b.max && unit === b.unit;
}

/** Guards the request body before the handler runs; prose fields are short. */
export const EDITABLE_ARTICLE_FIELD_MAX_LENGTH = 4000;

/** Keeps a hostile path from forcing a long walk or a sparse-array blowup. */
const MAX_PATH_LENGTH = 200;
const MAX_ARRAY_INDEX = 999;

/**
 * A segment key as it travels inside a path.
 *
 * Schema keys are identifiers, but the record keys behind a `*` come from
 * article data — `"United States"`, `"1. Taking Off"` — and carry spaces,
 * punctuation, and dots that no `split(".")` survives. Those keys travel
 * percent-encoded, which keeps every segment inside a charset that cannot be
 * confused with the path syntax around it. Mirrors `encodeFieldPathKey` in
 * `src/data/schema/fieldPath.ts`; this file cannot import it.
 */
const SEGMENT_PATTERN = /^([A-Za-z0-9_%-]+)(?:\[(\d+)\])?$/;
const PLAIN_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const EXTRA_ESCAPED_CHARACTERS = /[.*!'()~]/g;

/**
 * Keys a segment may never resolve to.
 *
 * The walker assigns with `cursor[key] = value` and a `*` matches whatever key
 * the caller supplies, so without this an inline edit is a prototype-pollution
 * primitive: `legality.countries.__proto__.notes` would write through every
 * object in the runtime rather than into one country's note. This allow-list is
 * the security boundary for a client-driven database write, so the rejection
 * lives in three places — the parser, the wildcard matcher, and the walker.
 */
const FORBIDDEN_SEGMENT_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/** Encodes one record key for use as a field-path segment. */
export function encodeArticleFieldPathKey(key: string): string {
  if (PLAIN_KEY_PATTERN.test(key)) return key;
  return encodeURIComponent(key).replace(
    EXTRA_ESCAPED_CHARACTERS,
    (character) =>
      `%${character.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`,
  );
}

function decodeSegmentKey(raw: string): string | null {
  if (!raw.includes("%")) return raw;
  try {
    const decoded = decodeURIComponent(raw);
    return decoded.length === 0 ? null : decoded;
  } catch {
    return null;
  }
}

interface FieldPathSegment {
  key: string;
  /** `null` for a plain property segment. */
  index: number | null;
}

interface TemplateSegment {
  key: string;
  wildcard: boolean;
  array: boolean;
}

function parseTemplateSegments(template: string): TemplateSegment[] {
  return template.split(".").map((rawSegment) => {
    if (rawSegment === "*") return { key: "*", wildcard: true, array: false };
    const array = rawSegment.endsWith("[]");
    return {
      key: array ? rawSegment.slice(0, -2) : rawSegment,
      wildcard: false,
      array,
    };
  });
}

const PARSED_EDITABLE_TEMPLATES: Array<{
  template: string;
  segments: TemplateSegment[];
}> = Object.keys(EDITABLE_ARTICLE_FIELD_KINDS).map((template) => ({
  template,
  segments: parseTemplateSegments(template),
}));

/**
 * The allow-list template a concrete path instantiates, or `null`.
 *
 * Matching is segment-by-segment rather than by string equality because a `*`
 * stands in for a key only the data knows. An exact key matches itself, `key[]`
 * matches an indexed segment, and `*` matches any single plain property segment
 * that is not one of the reserved prototype keys.
 */
export function resolveEditableFieldTemplate(
  parts: EditableFieldPathParts,
): string | null {
  const kinds = EDITABLE_ARTICLE_FIELD_KINDS as Record<string, EditableFieldKind>;
  // Fast path: a fully literal template is its own key.
  if (Object.prototype.hasOwnProperty.call(kinds, parts.template)) {
    return parts.template;
  }

  for (const candidate of PARSED_EDITABLE_TEMPLATES) {
    if (candidate.segments.length !== parts.segments.length) continue;
    let matched = true;
    for (let i = 0; i < candidate.segments.length; i += 1) {
      const templateSegment = candidate.segments[i];
      const segment = parts.segments[i];
      if (templateSegment.wildcard) {
        if (segment.index !== null || FORBIDDEN_SEGMENT_KEYS.has(segment.key)) {
          matched = false;
          break;
        }
        continue;
      }
      if (
        templateSegment.key !== segment.key ||
        templateSegment.array !== (segment.index !== null)
      ) {
        matched = false;
        break;
      }
    }
    if (matched) return candidate.template;
  }

  return null;
}

export interface EditableFieldPathParts {
  /** `dosage.routes[3].notes` → `dosage.routes[].notes`. */
  template: string;
  /** The one document key a write is allowed to patch. */
  topLevelKey: string;
  segments: FieldPathSegment[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Parses a concrete field path into segments plus its template form. Returns
 * `null` for anything that is not a well-formed, fully indexed path.
 */
export function parseEditableFieldPath(path: string): EditableFieldPathParts | null {
  if (typeof path !== "string" || path.length === 0 || path.length > MAX_PATH_LENGTH) {
    return null;
  }

  const segments: FieldPathSegment[] = [];
  const templateParts: string[] = [];

  for (const rawSegment of path.split(".")) {
    const match = SEGMENT_PATTERN.exec(rawSegment);
    if (!match) return null;

    const key = decodeSegmentKey(match[1]);
    // The first of three refusals: a reserved prototype key never becomes a
    // segment at all, so nothing downstream has to remember to check.
    if (key === null || FORBIDDEN_SEGMENT_KEYS.has(key)) return null;
    const encodedKey = encodeArticleFieldPathKey(key);
    const indexText = match[2];
    if (indexText === undefined) {
      segments.push({ key, index: null });
      templateParts.push(encodedKey);
      continue;
    }

    const index = Number(indexText);
    if (!Number.isSafeInteger(index) || index < 0 || index > MAX_ARRAY_INDEX) {
      return null;
    }
    segments.push({ key, index });
    templateParts.push(`${encodedKey}[]`);
  }

  // A single-segment path is allowed, but only where the allow-list names that
  // exact top-level key — it patches that one key and nothing around it.
  if (segments.length === 0) return null;

  return {
    template: templateParts.join("."),
    topLevelKey: segments[0].key,
    segments,
  };
}

/** True when `path` is a concrete instance of an allow-listed template. */
export function isEditableArticleFieldPath(path: string): boolean {
  const parts = parseEditableFieldPath(path);
  if (!parts) return false;
  return resolveEditableFieldTemplate(parts) !== null;
}

export type EditableFieldWriteResult =
  | {
      ok: true;
      topLevelKey: string;
      /** The cloned, updated value for `topLevelKey` — patch it wholesale. */
      topLevelValue: unknown;
      value: EditableFieldValue;
    }
  | { ok: false; reason: string; conflict?: true };

export interface EditableFieldWriteOptions {
  /**
   * What the caller believes the field currently holds.
   *
   * An inline edit addresses a route by index, and the index comes from a
   * client-side draft that may have been reordered, shortened, or edited
   * without ever reaching storage — `dosage.routes[0]` on screen is not
   * necessarily `dosage.routes[0]` in the database. Comparing the stored value
   * against what the editor was actually looking at turns that mismatch into a
   * refusal instead of a silent overwrite of a different route's note.
   */
  expected?: EditableFieldValue;
}

/**
 * The stored value moved under the editor; nothing was written.
 *
 * This reaches the reviewer verbatim: `setArticleField` rethrows it as a
 * `PostgresError` coded `FIELD_CONFLICT`, and the route layer renders that in the
 * inline editor. Keep it addressed to a person, and keep the instruction in it.
 */
export const EDITABLE_FIELD_CONFLICT_REASON =
  "This field changed since the article was loaded. Reload the article, then make the edit again.";

/**
 * Applies one string write to a stored article document, cloning only the
 * top-level key the path touches so a patch never carries the rest of the
 * document back over concurrent edits.
 *
 * Refuses out-of-range array indices and any target that currently holds
 * something other than a string, so a mistyped path degrades to an error
 * instead of flattening a nested object.
 */
export function applyEditableFieldWrite(
  document: Record<string, unknown>,
  path: string,
  value: EditableFieldValue,
  options: EditableFieldWriteOptions = {},
): EditableFieldWriteResult {
  const parts = parseEditableFieldPath(path);
  const kind = editableFieldKindForPath(path);
  if (!parts || !kind) {
    return { ok: false, reason: `Field "${path}" is not inline-editable.` };
  }

  if (kind === "text") {
    if (typeof value !== "string") {
      return { ok: false, reason: "Field value must be a string." };
    }
    if (value.length > EDITABLE_ARTICLE_FIELD_MAX_LENGTH) {
      return { ok: false, reason: "Field value is too long." };
    }
    if (options.expected !== undefined && typeof options.expected !== "string") {
      return { ok: false, reason: "Expected value must be a string." };
    }
  } else if (!isEditableRangeValue(value)) {
    return {
      ok: false,
      reason: "Field value must be a range of the form { min, max, unit }.",
    };
  } else if (options.expected !== undefined && !isEditableRangeValue(options.expected)) {
    return {
      ok: false,
      reason: "Expected value must be a range of the form { min, max, unit }.",
    };
  }

  const { segments, topLevelKey } = parts;

  // Third refusal, after the parser and the wildcard matcher. The walk below
  // assigns straight into a plain object, so a reserved key reaching it would
  // write through the prototype chain instead of into the article.
  for (const segment of segments) {
    if (FORBIDDEN_SEGMENT_KEYS.has(segment.key)) {
      return { ok: false, reason: `Field "${path}" is not inline-editable.` };
    }
  }

  // An absent leaf is editable (that is how a missing note gets written), but a
  // leaf holding the wrong kind means the path is addressing something other
  // than what the caller thinks it is.
  const targetTypeMismatch = (existing: unknown): string | null => {
    if (existing === undefined || existing === null) return null;
    if (kind === "text") {
      return typeof existing === "string" ? null : `Field "${path}" is not a text field.`;
    }
    return looksLikeStoredRange(existing) ? null : `Field "${path}" is not a range field.`;
  };

  const matchesExpected = (existing: unknown): boolean => {
    if (options.expected === undefined) return true;
    if (kind === "text") {
      return (typeof existing === "string" ? existing : "") === options.expected;
    }
    return rangesEqual(existing, options.expected as EditableRangeValue);
  };

  // A single-segment path names the top-level key itself — `title`, `summary`.
  // There is nothing to walk and nothing to clone: the whole patched value is
  // the new leaf. The kind guard is what keeps such a path from flattening a
  // whole section, since a bare key that currently holds an object or an array
  // is refused rather than replaced.
  if (segments.length === 1) {
    const existing = document[topLevelKey];
    const mismatch = targetTypeMismatch(existing);
    if (mismatch) return { ok: false, reason: mismatch };
    if (!matchesExpected(existing)) {
      return { ok: false, reason: EDITABLE_FIELD_CONFLICT_REASON, conflict: true };
    }
    return { ok: true, topLevelKey, topLevelValue: value, value };
  }

  const original = document[topLevelKey];
  if (original === undefined || original === null) {
    return { ok: false, reason: `Article has no "${topLevelKey}" section to edit.` };
  }

  // Editable article documents are JSON-shaped; clone before applying a write
  // so validation cannot mutate the caller's original document.
  let cursor: unknown;
  let clone: unknown;
  try {
    clone = JSON.parse(JSON.stringify(original)) as unknown;
  } catch {
    return { ok: false, reason: `Unable to read "${topLevelKey}" for editing.` };
  }
  cursor = clone;

  if (segments[0].index !== null) {
    if (!Array.isArray(cursor) || segments[0].index >= cursor.length) {
      return { ok: false, reason: `Field "${path}" does not exist on this article.` };
    }
    cursor = cursor[segments[0].index];
  }

  for (let i = 1; i < segments.length - 1; i += 1) {
    const segment = segments[i];
    if (!isRecord(cursor)) {
      return { ok: false, reason: `Field "${path}" does not exist on this article.` };
    }
    let next: unknown = cursor[segment.key];
    if (segment.index !== null) {
      if (!Array.isArray(next) || segment.index >= next.length) {
        return { ok: false, reason: `Field "${path}" does not exist on this article.` };
      }
      next = next[segment.index];
    }
    cursor = next;
  }

  const last = segments[segments.length - 1];
  if (!isRecord(cursor)) {
    return { ok: false, reason: `Field "${path}" does not exist on this article.` };
  }

  if (last.index !== null) {
    const array = cursor[last.key];
    if (!Array.isArray(array) || last.index >= array.length) {
      return { ok: false, reason: `Field "${path}" does not exist on this article.` };
    }
    const existing: unknown = array[last.index];
    const mismatch = targetTypeMismatch(existing);
    if (mismatch) return { ok: false, reason: mismatch };
    if (!matchesExpected(existing)) {
      return { ok: false, reason: EDITABLE_FIELD_CONFLICT_REASON, conflict: true };
    }
    array[last.index] = value;
  } else {
    const existing: unknown = cursor[last.key];
    const mismatch = targetTypeMismatch(existing);
    if (mismatch) return { ok: false, reason: mismatch };
    if (!matchesExpected(existing)) {
      return { ok: false, reason: EDITABLE_FIELD_CONFLICT_REASON, conflict: true };
    }
    cursor[last.key] = value;
  }

  return { ok: true, topLevelKey, topLevelValue: clone, value };
}

/**
 * Applies a compare-and-set update to the stored IUPAC name without making
 * chemical identifiers available to the review portal's generic inline editor.
 */
export function applyIupacNameWrite(
  document: Record<string, unknown>,
  value: string,
  expected: string,
): EditableFieldWriteResult {
  if (value.length > EDITABLE_ARTICLE_FIELD_MAX_LENGTH) {
    return { ok: false, reason: "IUPAC name is too long." };
  }

  const original = document.identification;
  if (!isRecord(original)) {
    return { ok: false, reason: 'Article has no "identification" section to edit.' };
  }

  let identification: Record<string, unknown>;
  try {
    identification = JSON.parse(JSON.stringify(original)) as Record<string, unknown>;
  } catch {
    return { ok: false, reason: 'Unable to read "identification" for editing.' };
  }

  const existing = identification.iupac_name;
  if (existing !== undefined && existing !== null && typeof existing !== "string") {
    return { ok: false, reason: 'Field "identification.iupac_name" is not a text field.' };
  }
  if ((typeof existing === "string" ? existing : "") !== expected) {
    return { ok: false, reason: EDITABLE_FIELD_CONFLICT_REASON, conflict: true };
  }

  identification.iupac_name = value;
  return {
    ok: true,
    topLevelKey: "identification",
    topLevelValue: identification,
    value,
  };
}
