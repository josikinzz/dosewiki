/**
 * The allow-list — and the minimal path walker — behind
 * `substanceIndex.setArticleField`, the single-field write the review portal's
 * inline click-to-edit uses.
 *
 * Convex functions cannot import from `src/`, so the canonical list lives here
 * and the Next API route imports it back the other way. One source of truth for
 * what an inline edit is allowed to touch: anything reachable by a field path
 * would otherwise be one typo away from a client-driven overwrite of an entire
 * subtree.
 *
 * This file must stay dependency-free (no Convex imports, no `src/` imports) so
 * both runtimes can load it.
 */

/**
 * Template field paths an inline edit may write, in `fieldPath.ts` notation:
 * `[]` marks an array whose concrete index is supplied by the caller.
 *
 * Every entry must address a plain string leaf. The walker refuses to replace
 * an object or an array with a string even if a path somehow reaches one.
 */
export const EDITABLE_ARTICLE_FIELD_TEMPLATES = [
  "dosage.routes[].notes",
  "tolerance.full_tolerance",
  "tolerance.half_tolerance",
  "tolerance.baseline_tolerance",
] as const;

export type EditableArticleFieldTemplate =
  (typeof EDITABLE_ARTICLE_FIELD_TEMPLATES)[number];

/** Guards the request body long before Convex sees it; prose fields are short. */
export const EDITABLE_ARTICLE_FIELD_MAX_LENGTH = 4000;

/** Keeps a hostile path from forcing a long walk or a sparse-array blowup. */
const MAX_PATH_LENGTH = 200;
const MAX_ARRAY_INDEX = 999;

const SEGMENT_PATTERN = /^([A-Za-z_][A-Za-z0-9_]*)(?:\[(\d+)\])?$/;

interface FieldPathSegment {
  key: string;
  /** `null` for a plain property segment. */
  index: number | null;
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

    const key = match[1];
    const indexText = match[2];
    if (indexText === undefined) {
      segments.push({ key, index: null });
      templateParts.push(key);
      continue;
    }

    const index = Number(indexText);
    if (!Number.isSafeInteger(index) || index < 0 || index > MAX_ARRAY_INDEX) {
      return null;
    }
    segments.push({ key, index });
    templateParts.push(`${key}[]`);
  }

  // A single-segment path would patch a whole top-level key; not in scope.
  if (segments.length < 2) return null;

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
  return (EDITABLE_ARTICLE_FIELD_TEMPLATES as readonly string[]).includes(parts.template);
}

export type EditableFieldWriteResult =
  | {
      ok: true;
      topLevelKey: string;
      /** The cloned, updated value for `topLevelKey` — patch it wholesale. */
      topLevelValue: unknown;
      value: string;
    }
  | { ok: false; reason: string; conflict?: true };

export interface EditableFieldWriteOptions {
  /**
   * What the caller believes the field currently holds.
   *
   * An inline edit addresses a route by index, and the index comes from a
   * client-side draft that may have been reordered, shortened, or edited
   * without ever reaching Convex — `dosage.routes[0]` on screen is not
   * necessarily `dosage.routes[0]` in the database. Comparing the stored value
   * against what the editor was actually looking at turns that mismatch into a
   * refusal instead of a silent overwrite of a different route's note.
   */
  expected?: string;
}

/** The stored value moved under the editor; nothing was written. */
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
  value: string,
  options: EditableFieldWriteOptions = {},
): EditableFieldWriteResult {
  if (typeof value !== "string") {
    return { ok: false, reason: "Field value must be a string." };
  }
  if (value.length > EDITABLE_ARTICLE_FIELD_MAX_LENGTH) {
    return { ok: false, reason: "Field value is too long." };
  }

  const parts = parseEditableFieldPath(path);
  if (!parts || !isEditableArticleFieldPath(path)) {
    return { ok: false, reason: `Field "${path}" is not inline-editable.` };
  }

  const { segments, topLevelKey } = parts;
  const original = document[topLevelKey];
  if (original === undefined || original === null) {
    return { ok: false, reason: `Article has no "${topLevelKey}" section to edit.` };
  }

  // Stored Convex documents are JSON-shaped, so this round trip is lossless and
  // avoids depending on `structuredClone` being present in every runtime.
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

  const matchesExpected = (existing: unknown): boolean => {
    if (options.expected === undefined) return true;
    return (typeof existing === "string" ? existing : "") === options.expected;
  };

  if (last.index !== null) {
    const array = cursor[last.key];
    if (!Array.isArray(array) || last.index >= array.length) {
      return { ok: false, reason: `Field "${path}" does not exist on this article.` };
    }
    const existing: unknown = array[last.index];
    if (existing !== undefined && existing !== null && typeof existing !== "string") {
      return { ok: false, reason: `Field "${path}" is not a text field.` };
    }
    if (!matchesExpected(existing)) {
      return { ok: false, reason: EDITABLE_FIELD_CONFLICT_REASON, conflict: true };
    }
    array[last.index] = value;
  } else {
    const existing: unknown = cursor[last.key];
    if (existing !== undefined && existing !== null && typeof existing !== "string") {
      return { ok: false, reason: `Field "${path}" is not a text field.` };
    }
    if (!matchesExpected(existing)) {
      return { ok: false, reason: EDITABLE_FIELD_CONFLICT_REASON, conflict: true };
    }
    cursor[last.key] = value;
  }

  return { ok: true, topLevelKey, topLevelValue: clone, value };
}
