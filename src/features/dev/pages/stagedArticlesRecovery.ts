import { contentHash } from "../../../../lib/proposals/contentHash";
import type { ArticleRecord } from "../context/devModeTypes";
import { resolveEditorArticleSlug } from "../context/devModeUtils";
import { isSameDocument } from "../context/editorDocumentSession";

/**
 * The staged working set's recovery copy: only the articles that differ from
 * their baseline, and in each only the top-level fields that differ, so a
 * corpus-sized working set keeps a copy the size of its edits. Each article
 * carries the hash of the baseline it was edited against; a restore applies an
 * article only when the library still holds exactly that baseline.
 */
export type StagedArticleChange = {
  slug: string;
  /** `contentHash` of the article the edit started from, or {@link NEW_ARTICLE_BASELINE}. */
  baseline: string;
  set: Record<string, unknown>;
  unset: string[];
};

export type StagedArticlesDraft = { changes: StagedArticleChange[] };

/** The baseline of an article the working set added. */
export const NEW_ARTICLE_BASELINE = contentHash(null);

export function stagedArticleBaseline(article: ArticleRecord | undefined): string {
  try {
    return article ? contentHash(article) : NEW_ARTICLE_BASELINE;
  } catch {
    // An article the hash refuses can never be matched, so it restores as a conflict.
    return "unhashable";
  }
}

/** The working set's edits, as a recovery copy. Empty when nothing differs. */
export function stagedArticleChanges(
  articles: readonly ArticleRecord[],
  originals: readonly ArticleRecord[],
): StagedArticleChange[] {
  const changes: StagedArticleChange[] = [];
  articles.forEach((article, index) => {
    const original = originals[index];
    if (article === original || isSameDocument(article, original)) return;
    const slug = resolveEditorArticleSlug(original ?? article);
    if (!slug) return;
    const before = (original ?? {}) as Record<string, unknown>;
    const after = article as unknown as Record<string, unknown>;
    const set: Record<string, unknown> = {};
    for (const key of Object.keys(after)) {
      if (!isSameDocument(after[key], before[key])) set[key] = after[key];
    }
    const unset = Object.keys(before).filter((key) => before[key] !== undefined && after[key] === undefined);
    changes.push({ slug, baseline: stagedArticleBaseline(original), set, unset });
  });
  return changes;
}

/** One copied change laid over the article it now lands on. */
export function applyStagedArticleChange(article: ArticleRecord | undefined, change: StagedArticleChange): ArticleRecord {
  const next = { ...(article ?? {}), ...change.set } as Record<string, unknown>;
  for (const key of change.unset) delete next[key];
  return next as unknown as ArticleRecord;
}
