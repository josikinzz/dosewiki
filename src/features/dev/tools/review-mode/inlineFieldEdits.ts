import {
  formatFieldPath,
  getArticleValueByPath,
  isFieldPathDiagnostic,
  parseFieldPath,
  setArticleValueByPath,
} from "@/data/schema/fieldPath";
import type { EditableFieldValue } from "@/features/article/editing";
import type { SubstanceArticle } from "@/schema";

/**
 * One inline edit that is already in Convex, plus the working-set value it was
 * layered over.
 *
 * The review portal writes inline edits straight to Convex and deliberately
 * leaves the dev shell's in-memory article set alone, so the saved value has to
 * be layered back over the render. `before` is what makes that safe to do more
 * than once: an overlay entry addresses a concrete path — `dosage.routes[2].notes`
 * — and the working set can move underneath it.
 */
export interface InlineFieldEdit {
  before: EditableFieldValue;
  value: EditableFieldValue;
}

export type InlineFieldEdits = Record<string, InlineFieldEdit>;

/**
 * Whether a stored value is still the one an overlay entry was layered over.
 *
 * Kind-aware because a dose tier is an object: comparing `{min, max, unit}` by
 * identity would drop every range overlay on the first re-render, and comparing
 * it as a string would keep every range overlay forever, including the ones the
 * form has since overwritten. An absent leaf reads as the empty value of its
 * kind, which is how a blank field that was filled in still matches.
 */
export function inlineFieldValuesMatch(
  stored: unknown,
  before: EditableFieldValue,
): boolean {
  if (typeof before === "string") {
    if (stored === undefined || stored === null) return before === "";
    return typeof stored === "string" && stored === before;
  }

  if (stored === undefined || stored === null) {
    return before.min === null && before.max === null && before.unit === "";
  }
  if (typeof stored !== "object" || Array.isArray(stored)) return false;
  const range = stored as Record<string, unknown>;
  return (
    (range.min ?? null) === before.min &&
    (range.max ?? null) === before.max &&
    (typeof range.unit === "string" ? range.unit : "") === before.unit
  );
}

/**
 * Reads a stored value as an overlay baseline, falling back to the caller's
 * claim when the store holds something of another kind entirely.
 *
 * Lenient about the range shape on purpose: legacy rows carry extra keys, and
 * refusing to recognise them would strand exactly the data most in need of an
 * inline fix.
 */
export function asInlineFieldValue(
  stored: unknown,
  fallback: EditableFieldValue,
): EditableFieldValue {
  if (typeof fallback === "string") {
    return typeof stored === "string" ? stored : fallback;
  }
  if (stored === null || typeof stored !== "object" || Array.isArray(stored)) {
    return fallback;
  }
  const range = stored as Record<string, unknown>;
  if (!("min" in range) || !("max" in range) || !("unit" in range)) return fallback;
  return {
    min: typeof range.min === "number" ? range.min : null,
    max: typeof range.max === "number" ? range.max : null,
    unit: typeof range.unit === "string" ? range.unit : "",
  };
}

/**
 * The slot a path addresses, or `null` when the slot itself is gone.
 *
 * Distinguishing "the leaf is empty" from "the container that held it no longer
 * exists" is what lets an overlay both re-apply an edit that filled in a blank
 * field and refuse to resurrect an array element the working set dropped. A
 * plain read cannot tell those apart: both answer `undefined`.
 */
function resolveSlot(
  article: SubstanceArticle,
  path: string,
): { value: unknown } | null {
  const parsed = parseFieldPath(path);
  if (isFieldPathDiagnostic(parsed) || parsed.isTemplate || parsed.segments.length === 0) {
    return null;
  }

  const last = parsed.segments[parsed.segments.length - 1];
  const parentSegments = parsed.segments.slice(0, -1);
  const parent: unknown =
    parentSegments.length === 0
      ? article
      : getArticleValueByPath(article, formatFieldPath(parentSegments));
  if (parent === null || typeof parent !== "object") return null;

  if (last.kind === "array") {
    if (last.index === "template") return null;
    const array = (parent as Record<string, unknown>)[last.key];
    if (!Array.isArray(array) || last.index >= array.length) return null;
    return { value: array[last.index] };
  }

  if (Array.isArray(parent)) return null;
  return { value: (parent as Record<string, unknown>)[last.key] };
}

/**
 * Layer saved inline edits back over an article, dropping any whose target has
 * moved.
 *
 * An entry only applies while the article still holds exactly what the edit was
 * layered over. Once it does not — the same field was edited through the form
 * and applied, a route was reordered so the index means another route, a route
 * was removed so the index is gone — the path no longer addresses what it did,
 * and the working set wins. That rule is also what keeps a stale index from
 * padding a shortened array with a blank element the renderer cannot read.
 */
export function applyInlineFieldEdits(
  article: SubstanceArticle,
  edits: InlineFieldEdits | undefined,
): SubstanceArticle {
  if (!edits) return article;

  return Object.entries(edits).reduce((next, [path, edit]) => {
    // A shortened array leaves no slot at all, so the write below is never
    // reached and `setArticleValueByPath` never pads it back to length.
    const slot = resolveSlot(next, path);
    if (!slot) return next;
    if (!inlineFieldValuesMatch(slot.value, edit.before)) return next;
    return setArticleValueByPath(next, path, edit.value);
  }, article);
}
