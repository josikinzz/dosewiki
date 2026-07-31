"use client";

import { createContext, useContext } from "react";

import type { EditableFieldValue } from "../../../../convex/lib/articleFieldWrites";

export type { EditableFieldValue, EditableRangeValue } from "../../../../convex/lib/articleFieldWrites";

/**
 * What a call site may hand an editable field.
 *
 * Looser than `EditableFieldValue` on purpose. The wire contract spells a range
 * as `{min: number | null, max: number | null, unit: string}`, but this project
 * compiles with `strictNullChecks` off, so the schema's own `DoseRange` and
 * `DurationStage` infer their bounds as optional instead. The two describe the
 * same runtime object; only the compiler disagrees, and a render site should
 * not have to cast its own schema type to hand it over.
 */
export type EditableValueInput =
  | string
  | { min?: number | null; max?: number | null; unit?: string };

/**
 * The one capability an inline-editable article surface needs: persist a new
 * value for one field path and resolve with the value that was stored.
 *
 * Deliberately tiny. The public article path never provides this context, so
 * every `EditableValue` collapses to its children and the rendered DOM is
 * unchanged — the affordance exists only where an editor opted in.
 */
export interface ArticleEditContextValue {
  /**
   * Rejects with a human-readable `Error` the field can render inline.
   *
   * `expected` is the value the field held on screen. Paths carry concrete
   * array indices, and the rendered article can be a local draft that has been
   * reordered since the database last saw it, so the write is only safe when
   * the store still agrees about what sits at that index.
   *
   * A value is either prose or a `{min, max, unit}` range; the kind is fixed by
   * the path's entry in the inline-edit allow-list, and both sides of the
   * exchange are validated against it before anything is written.
   */
  commit: (
    path: string,
    value: EditableFieldValue,
    expected: EditableFieldValue,
  ) => Promise<EditableFieldValue>;
}

const ArticleEditContext = createContext<ArticleEditContextValue | null>(null);

export const ArticleEditProvider = ArticleEditContext.Provider;

/** `null` on the public path; a commit handle inside an editing surface. */
export function useArticleEdit(): ArticleEditContextValue | null {
  return useContext(ArticleEditContext);
}
