export type EditableFieldKind = "text" | "range" | "aliases";

export const EDITABLE_ARTICLE_FIELD_KINDS = {
  title: "text",
  summary: "text",
  "identification.substitutive_name": "text",
  "identification.botanical_name": "text",
  "identification.common_name": "text",
  "identification.alternative_names": "aliases",
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
  "tolerance.full_tolerance": "text",
  "tolerance.half_tolerance": "text",
  "tolerance.baseline_tolerance": "text",
  "tolerance.cross_tolerance[]": "text",
  "subjective_effects.notes.overview": "text",
  "subjective_effects.notes.physical": "text",
  "subjective_effects.notes.cognitive": "text",
  "subjective_effects.sensory.*.note": "text",
  "subjective_effects.sensory.*.subcategories.*.note": "text",
  "subjective_effects.physical.*.note": "text",
  "subjective_effects.cognitive.*.note": "text",
  "subjective_effects.progressive_stages.*.note": "text",
  "pharmacology.pharmacodynamics": "text",
  "pharmacology.pharmacokinetics": "text",
  "legality.international[]": "text",
  "legality.countries.*.notes": "text",
  "legality.usStatesNote": "text",
  "legality.usStates.*.notes": "text",
  "legality.usStates.*.cities.*.notes": "text",
  "harm_potential.addiction.psychological.description": "text",
  "harm_potential.addiction.physical_dependence.description": "text",
  "harm_potential.psychosis.description": "text",
  "harm_potential.seizure.description": "text",
  "harm_potential.toxicity.lethal_dosage.notes": "text",
  "harm_potential.toxicity.organ_toxicity[].findings": "text",
  "harm_potential.toxicity.organ_toxicity[].mechanism": "text",
  "harm_potential.toxicity.organ_toxicity[].notes": "text",
  "history_culture.content": "text",
  "history_culture.sections[].content": "text",
  "history_culture.sections[].subsections[].content": "text",
} as const;

export type EditableArticleFieldTemplate = keyof typeof EDITABLE_ARTICLE_FIELD_KINDS;

export const EDITABLE_ARTICLE_FIELD_TEMPLATES = Object.keys(
  EDITABLE_ARTICLE_FIELD_KINDS,
) as EditableArticleFieldTemplate[];

export function editableFieldKindForPath(path: string): EditableFieldKind | null {
  const parts = parseEditableFieldPath(path);
  if (!parts) return null;
  const template = resolveEditableFieldTemplate(parts);
  if (!template) return null;
  const kinds = EDITABLE_ARTICLE_FIELD_KINDS as Record<string, EditableFieldKind>;
  return kinds[template] ?? null;
}

export interface EditableRangeValue {
  min: number | null;
  max: number | null;
  unit: string;
}

export type EditableFieldValue = string | EditableRangeValue | string[];

export const EDITABLE_ALIAS_MAX_COUNT = 128;
export const EDITABLE_ALIAS_MAX_LENGTH = 512;
export const EDITABLE_ALIAS_MAX_TOTAL_LENGTH = 16_384;

function isEditableAliasArray(value: unknown): value is string[] {
  if (!Array.isArray(value) || value.length > EDITABLE_ALIAS_MAX_COUNT) return false;
  let length = 0;
  const names = new Set<string>();
  for (const name of value) {
    if (typeof name !== "string" || !name || name !== name.trim() ||
        name.length > EDITABLE_ALIAS_MAX_LENGTH || /\p{Cc}/u.test(name) || names.has(name)) return false;
    names.add(name);
    length += name.length;
  }
  return length <= EDITABLE_ALIAS_MAX_TOTAL_LENGTH;
}

function aliasArraysEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((name, index) => name === right[index]);
}

function applyAlternativeNameAppend(
  document: Record<string, unknown>, value: unknown, expected: unknown,
): EditableFieldWriteResult {
  if (!isEditableAliasArray(value) || !isEditableAliasArray(expected)) {
    return { ok: false, reason: "Names and expected names must be bounded arrays of unique, nonempty, unpadded strings." };
  }
  const identification = document.identification;
  if (!isRecord(identification) || !isEditableAliasArray(identification.alternative_names)) {
    return { ok: false, reason: "Stored alternative names must be a valid string array before appending." };
  }
  const existing = identification.alternative_names;
  if (!aliasArraysEqual(existing, expected)) {
    return { ok: false, reason: EDITABLE_FIELD_CONFLICT_REASON, conflict: true };
  }
  if (value.length < existing.length || existing.some((name, index) => value[index] !== name)) {
    return { ok: false, reason: "Appending names must preserve every existing name in its original order." };
  }
  const names = [...value];
  return { ok: true, topLevelKey: "identification", topLevelValue: { ...identification, alternative_names: names }, value: names };
}

export const EDITABLE_RANGE_UNIT_MAX_LENGTH = 32;

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

export const EDITABLE_ARTICLE_FIELD_MAX_LENGTH = 4000;

const MAX_PATH_LENGTH = 200;
const MAX_ARRAY_INDEX = 999;

const SEGMENT_PATTERN = /^([A-Za-z0-9_%-]+)(?:\[(\d+)\])?$/;
const PLAIN_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const EXTRA_ESCAPED_CHARACTERS = /[.*!'()~]/g;

const FORBIDDEN_SEGMENT_KEYS = new Set(["__proto__", "constructor", "prototype"]);

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

export function resolveEditableFieldTemplate(
  parts: EditableFieldPathParts,
): string | null {
  const kinds = EDITABLE_ARTICLE_FIELD_KINDS as Record<string, EditableFieldKind>;
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
  template: string;
  topLevelKey: string;
  segments: FieldPathSegment[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

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

  if (segments.length === 0) return null;

  return {
    template: templateParts.join("."),
    topLevelKey: segments[0].key,
    segments,
  };
}

export function isEditableArticleFieldPath(path: string): boolean {
  const parts = parseEditableFieldPath(path);
  if (!parts) return false;
  return resolveEditableFieldTemplate(parts) !== null;
}

export type EditableFieldWriteResult =
  | {
      ok: true;
      topLevelKey: string;
      topLevelValue: unknown;
      value: EditableFieldValue;
    }
  | { ok: false; reason: string; conflict?: true };

export interface EditableFieldWriteOptions {
  expected?: EditableFieldValue;
}

export const EDITABLE_FIELD_CONFLICT_REASON =
  "This field changed since the article was loaded. Reload the article, then make the edit again.";

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

  if (kind === "aliases") return applyAlternativeNameAppend(document, value, options.expected);

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

  for (const segment of segments) {
    if (FORBIDDEN_SEGMENT_KEYS.has(segment.key)) {
      return { ok: false, reason: `Field "${path}" is not inline-editable.` };
    }
  }

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
