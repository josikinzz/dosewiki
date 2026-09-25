import { contentHash } from "../../../../lib/proposals/contentHash";
import { articleArrayIdentity } from "../../../../lib/proposals/articlePatch";
import { mergeThreeWay, type MergeChoices, type ThreeWayMerge } from "../../../../lib/proposals/threeWayMerge";
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
  /**
   * The baseline's value of every field in `set` and `unset`, so an edit held
   * aside can be merged into a newer article instead of laid over it. Absent
   * on copies kept before it was recorded.
   */
  before?: Record<string, unknown>;
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
    const previous: Record<string, unknown> = {};
    for (const key of [...Object.keys(set), ...unset]) if (before[key] !== undefined) previous[key] = before[key];
    changes.push({ slug, baseline: stagedArticleBaseline(original), set, unset, before: previous });
  });
  return changes;
}

/** One copied change laid over the article it now lands on. */
export function applyStagedArticleChange(article: ArticleRecord | undefined, change: StagedArticleChange): ArticleRecord {
  const next = { ...(article ?? {}), ...change.set } as Record<string, unknown>;
  for (const key of change.unset) delete next[key];
  return next as unknown as ArticleRecord;
}

/**
 * A copied edit merged into the newer article it now meets, field by field
 * from the baseline it was made against: what only the copy changed is laid
 * in, what only the newer article changed stays, and a field both changed
 * waits on `choices`. Null for a copy that did not record its baseline.
 */
export function mergeStagedArticleChange(
  current: ArticleRecord,
  change: StagedArticleChange,
  choices: MergeChoices = {},
): ThreeWayMerge<Record<string, unknown>> | null {
  if (!change.before) return null;
  const latest = current as unknown as Record<string, unknown>;
  const base: Record<string, unknown> = {}, mine: Record<string, unknown> = {}, theirs: Record<string, unknown> = {};
  for (const key of [...Object.keys(change.set), ...change.unset]) {
    if (change.before[key] !== undefined) base[key] = change.before[key];
    if (key in change.set) mine[key] = change.set[key];
    if (latest[key] !== undefined) theirs[key] = latest[key];
  }
  return mergeThreeWay<Record<string, unknown>>(base, mine, theirs, { choices, identity: articleArrayIdentity });
}

/** The newer article with a merged copy's fields laid in; a field the merge removed is removed. */
export function applyMergedStagedArticle(current: ArticleRecord, change: StagedArticleChange, merged: Record<string, unknown>): ArticleRecord {
  const next = { ...(current as unknown as Record<string, unknown>) };
  for (const key of [...Object.keys(change.set), ...change.unset]) {
    if (merged[key] === undefined) delete next[key];
    else next[key] = merged[key];
  }
  return next as unknown as ArticleRecord;
}
