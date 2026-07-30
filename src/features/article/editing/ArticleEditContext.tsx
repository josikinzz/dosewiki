"use client";

import { createContext, useContext } from "react";

/**
 * The one capability an inline-editable article surface needs: persist a new
 * string for one field path and resolve with the value that was stored.
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
   */
  commit: (path: string, value: string, expected: string) => Promise<string>;
}

const ArticleEditContext = createContext<ArticleEditContextValue | null>(null);

export const ArticleEditProvider = ArticleEditContext.Provider;

/** `null` on the public path; a commit handle inside an editing surface. */
export function useArticleEdit(): ArticleEditContextValue | null {
  return useContext(ArticleEditContext);
}
