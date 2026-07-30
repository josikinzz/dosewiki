import {
  getArticleValueByPath,
  setArticleValueByPath,
} from "@/data/schema/fieldPath";
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
  before: string;
  value: string;
}

export type InlineFieldEdits = Record<string, InlineFieldEdit>;

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
    const stored = getArticleValueByPath(next, path);
    if (typeof stored !== "string" || stored !== edit.before) return next;
    return setArticleValueByPath(next, path, edit.value);
  }, article);
}
